import {
	accumFrom,
	Behavior,
	combine,
	flatFutures,
	flatFuturesFrom,
	Future,
	nextOccurrenceFrom,
	performStream,
	producerStream,
	runNow,
	sample,
	snapshot,
	snapshotWith,
	Stream,
	tick,
	when,
} from '@funkia/hareactive';
import { call, callP, catchE, IO, withEffects } from '@funkia/io';
import * as grpc from '@grpc/grpc-js';
import * as rpc from '@mjuz/grpc-protos';
import { Offer, Remote, RemoteOffer, ResourcesService, Wish } from './resources-service';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';
import { DeploymentOffer, DeploymentService } from './deployment-service';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import { Logger } from 'pino';
import { intervalStream } from './utils';
import { Status } from '@grpc/grpc-js/build/src/constants';

type Remotes = Record<string, [Remote, rpc.DeploymentClient]>;
export const accumRemotes = (
	upsert: Stream<Remote>,
	remove: Stream<Remote>
): Behavior<Behavior<Remotes>> =>
	accumFrom<['upsert' | 'remove', Remote], Remotes>(
		([change, remote], remotes) => {
			const update = { ...remotes };
			if (remote.id in remotes) {
				const [oldRemote, client] = remotes[remote.id];
				if (
					change === 'remove' ||
					remote.host !== oldRemote.host ||
					remote.port !== oldRemote.port
				) {
					client.close();
					delete update[remote.id];
				}
			}
			if (change === 'upsert' && !(remote.id in update)) {
				const client = new rpc.DeploymentClient(
					`${remote.host}:${remote.port}`,
					grpc.credentials.createInsecure()
				);
				update[remote.id] = [remote, client];
			}
			return update;
		},
		{},
		combine<['upsert' | 'remove', Remote]>(
			remove.map<['remove', Remote]>((remote) => ['remove', remote]),
			upsert.map<['upsert', Remote]>((remote) => ['upsert', remote])
		)
	);

/**
 * @param remotes
 * @param trigger
 * @param logger
 * @return After each round all remotes with successful heartbeat
 */
const sendHeartbeats = (
	remotes: Behavior<Remotes>,
	trigger: Stream<unknown>,
	logger: Logger
): Stream<IO<Remotes>> => {
	const heartbeat = ([remote, client]: [Remote, rpc.DeploymentClient]) =>
		new Promise<string | undefined>((resolve) => {
			logger.trace(`Sending heartbeat to remote '${remote.id}'`);
			client.heartbeat(new Empty(), (err) => resolve(err ? undefined : remote.id));
		});
	const connectedRemotes = (remotes: Remotes, remoteIdsConnected: (string | undefined)[]) =>
		Object.entries(remotes)
			.filter(([remoteId]) => remoteIdsConnected.indexOf(remoteId) !== -1)
			.reduce<Remotes>((remotes, [remoteId, remote]) => {
				remotes[remoteId] = remote;
				return remotes;
			}, {});

	return snapshot(remotes, trigger).map((remotes) =>
		callP(() => Promise.all(Object.values(remotes).map(heartbeat))).map(
			(remoteIdsConnected) => {
				logger.trace(`Heartbeat successful for remotes: ${remoteIdsConnected}`);
				return connectedRemotes(remotes, remoteIdsConnected);
			}
		)
	);
};

const scanRemoteConnects = (
	connectedRemotes: Stream<Remotes>,
	logger: Logger
): Behavior<Stream<IO<Remotes>>> =>
	connectedRemotes
		.scanFrom<[Remotes, Remotes]>(
			(connected, [, prevConnected]) => {
				const newConnects = { ...connected };
				Object.keys(prevConnected).forEach((remoteId) => delete newConnects[remoteId]);
				return [newConnects, connected];
			},
			[{}, {}]
		)
		.map((stream) =>
			stream.map(([newConnects]) =>
				call(() => {
					if (Object.keys(newConnects).length > 0)
						logger.debug(`Remotes connected: ${Object.keys(newConnects)}`);
				}).flatMap(() => IO.of(newConnects))
			)
		);

type Offers = Record<string, Offer<unknown>>;
const accumOutboundOffers = (
	offerUpdate: Stream<Offer<unknown>>,
	offerWithdrawal: Stream<Offer<unknown>>,
	logger: Logger
): Behavior<Behavior<Offers>> =>
	accumFrom<['upsert' | 'remove', Offer<unknown>], Offers>(
		([change, offer], offers) => {
			const update = { ...offers };
			const offerId = `${offer.beneficiaryId}:${offer.name}`;

			if (change === 'upsert') update[offerId] = offer;
			else if (!(offerId in update))
				logger.warn(
					`Withdrawing unknown offer '${offer.name}' to remote '${offer.beneficiaryId}'`
				);
			else delete update[offerId];

			return update;
		},
		{},
		combine(
			offerUpdate.map<['upsert' | 'remove', Offer<unknown>]>((offer) => ['upsert', offer]),
			offerWithdrawal.map<['upsert' | 'remove', Offer<unknown>]>((offer) => ['remove', offer])
		)
	);

/**
 * Protocol: Offer from remote updates the offer and resets the withdrawn flag. When a deployment reads the offer, it
 * sets the locked flag. Withdrawal from the offering deployment removes the offer, if it was not locked. If it was
 * locked, withdrawal sets the withdrawn flag. The deployment undeploys wishes to a withdrawn offer and confirms the
 * undeployment with its release. On release, the offer is removed, if the withdrawn flag is set.
 *
 * Any withdrawal should be delayed until the first deployment round completed to ensure all locked offers exist in the
 * state. Otherwise withdrawals may get confirmed (the offer released) even though the corresponding wish is still
 * deployed.
 *
 * @param offerUpdate
 * @param deployedOfferPolled
 * @param undeployedOfferPolled
 * @param offerWithdrawal
 * @param offerReleased
 * @param logger
 */
const accumInboundOffers = (
	offerUpdate: Stream<DeploymentOffer<unknown>>,
	deployedOfferPolled: Stream<DeploymentOffer<unknown>>,
	undeployedOfferPolled: Stream<DeploymentOffer<unknown>>,
	offerWithdrawal: Stream<DeploymentOffer<unknown>>,
	offerReleased: Stream<DeploymentOffer<unknown>>,
	logger: Logger
): Behavior<Behavior<InOffers>> =>
	accumFrom<InOfferEvt<unknown>, InOffers>(
		([change, offer], offers) => {
			const update = { ...offers };
			const offerId = `${offer.origin}:${offer.name}`;

			switch (change) {
				case 'upsert':
					if (offerId in update) {
						update[offerId].withdrawn = false;
						update[offerId].offer = offer;
					} else {
						update[offerId] = {
							deployed: false,
							withdrawn: false,
							offer: offer,
						};
					}
					break;
				case 'polledDeployed':
					if (offerId in update) update[offerId].deployed = true;
					// Case: after restart the offer was not renewed from the offering side, but the corresponding wish is already deployed
					else
						update[offerId] = {
							deployed: true,
							withdrawn: false,
						};
					break;
				case 'polledUndeployed':
					// Set deployed, if it is going to be deployed after this poll
					if (
						offerId in update &&
						!update[offerId].withdrawn &&
						update[offerId].offer?.offer !== undefined
					)
						update[offerId].deployed = true;
					break;
				case 'withdraw':
					if (offerId in update) update[offerId].withdrawn = true;
					else
						update[offerId] = {
							deployed: false,
							withdrawn: true,
						};
					break;
				case 'release':
					if (offerId in update)
						if (update[offerId].withdrawn) delete update[offerId];
						else
							logger.warn(
								`Released offer '${offer.name}' from remote '${offer.origin}' that is not withdrawn (anymore?)`
							);
					else logger.warn(`Released unknown offer ${offerId}`);
					break;
			}
			logger.trace(
				`Inbound offer '${offer.name}' from remote '${offer.origin}' after ${change}: ` +
					`deployed ${update[offerId]?.deployed}, withdrawn ${update[offerId]?.withdrawn}`
			);
			return update;
		},
		{},
		combine(
			offerUpdate.map<InOfferEvt<unknown>>((offer) => ['upsert', offer]),
			deployedOfferPolled.map<InOfferEvt<unknown>>((offer) => ['polledDeployed', offer]),
			undeployedOfferPolled.map<InOfferEvt<unknown>>((offer) => ['polledUndeployed', offer]),
			offerWithdrawal.map<InOfferEvt<unknown>>((offer) => ['withdraw', offer]),
			offerReleased.map<InOfferEvt<unknown>>((offer) => ['release', offer])
		)
	);
type InOfferEvt<O> = [
	'upsert' | 'polledDeployed' | 'polledUndeployed' | 'withdraw' | 'release',
	DeploymentOffer<O>
];
type InOffers = Record<string, InOffer<unknown>>;
type InOffer<O> = {
	deployed: boolean;
	withdrawn: boolean;
	offer?: DeploymentOffer<O>;
};

const toRpcDeploymentOffer = <O>(offer: Offer<O>, deploymentName: string): rpc.DeploymentOffer =>
	new rpc.DeploymentOffer()
		.setOrigin(deploymentName)
		.setName(offer.name)
		.setOffer(Value.fromJavaScript(offer.offer || null));
const directOfferForward = (
	offerUpdated: Stream<Offer<unknown>>,
	remotes: Behavior<Remotes>,
	deploymentName: string,
	logger: Logger
): Stream<IO<rpc.Offer>> =>
	snapshotWith<Offer<unknown>, Remotes, [[Remote, rpc.DeploymentClient], Offer<unknown>]>(
		(offer, remotes) => [remotes[offer.beneficiaryId], offer],
		remotes,
		offerUpdated
	)
		.filter(([t]) => t !== undefined)
		.map(([[, remote], offer]) => {
			const sendOffer = (
				resolve: (offer: Offer<unknown>) => void,
				reject: (err: unknown) => void
			) =>
				remote.offer(toRpcDeploymentOffer(offer, deploymentName), (error) =>
					error ? reject(error) : resolve(offer)
				);
			return callP(() => new Promise(sendOffer));
		})
		.map((sendOfferOp) =>
			sendOfferOp.map((sentOffer) =>
				logger.debug(
					sentOffer,
					`Directly forwarded offer '${sentOffer.name}' to remote '${sentOffer.beneficiaryId}'`
				)
			)
		)
		.map((sentOffer) =>
			catchE(
				(error) => IO.of(logger.debug(error, 'Directly forwarding offer failed')),
				sentOffer
			)
		);

export const resendOffersOnConnect = (
	offers: Behavior<Offers>,
	connects: Stream<Remotes>,
	deploymentName: string,
	logger: Logger
): Stream<IO<void>> =>
	snapshotWith<Remotes, Offers, IO<void>>(
		(remotes, offers) =>
			Object.values(offers)
				.filter((offer) => offer.beneficiaryId in remotes)
				.map((offer) =>
					call(() => {
						remotes[offer.beneficiaryId][1].offer(
							toRpcDeploymentOffer(offer, deploymentName),
							(err) => {
								if (err)
									logger.warn(
										err,
										`Failed to resend offer '${offer.name}' to remote '${offer.beneficiaryId}'`
									);
							}
						);
					})
				)
				.reduce((a, b) => a.flatMap(() => b), IO.of(undefined)),
		offers,
		connects
	);

const offerWithdrawalSend = (
	remotes: Behavior<Remotes>,
	connects: Stream<Remotes>,
	withdrawals: Stream<[Offer<unknown>, (error: Error | null) => void]>,
	deploymentName: string,
	logger: Logger
): Stream<Stream<Future<IO<void>>>> =>
	withdrawals.map(([offer, cb]) => {
		const withdrawalSends = producerStream<Future<IO<void>>>((push) => {
			const withdrawRemote: Behavior<Future<IO<void>>> = remotes.flatMap((remotes) => {
				const waitingMsg = `Waiting for remote '${offer.beneficiaryId}' to reconnect and release withdrawn offer '${offer.name}'`;
				const logWaiting = () => push(Future.of(call(() => logger.info(waitingMsg))));

				const withdraw = call(() => {
					remotes[offer.beneficiaryId][1].releaseOffer(
						toRpcDeploymentOffer(offer, deploymentName),
						(err) => {
							if (err?.code === Status.UNAVAILABLE) {
								logWaiting();
								push(runNow(sample(withdrawOnConnect)));
							} else {
								// Stop recursion
								withdrawalSends.deactivate();
								cb(err);
							}
						}
					);
				});

				const withdrawOnConnect = nextOccurrenceFrom(
					connects.filter((remotes) => offer.beneficiaryId in remotes)
				).map((f) => f.flatMap(() => runNow(sample(withdrawRemote))));

				if (offer.beneficiaryId in remotes) return Behavior.of(Future.of(withdraw));
				logWaiting();
				return withdrawOnConnect;
			});

			push(runNow(sample(withdrawRemote)));
			return () => {
				// Intended to be empty
			};
		});
		return withdrawalSends;
	});

const toDeploymentOffer = <O>(wish: Wish<O>): DeploymentOffer<O> => {
	return {
		origin: wish.targetId,
		name: wish.name,
	};
};

const offerRelease = (
	offerWithdrawals: Stream<[DeploymentOffer<unknown>, () => void]>,
	inboundOffers: Behavior<InOffers>,
	offersStateInitialized: Future<void>
): Behavior<Stream<IO<void>>> =>
	flatFuturesFrom(
		offerWithdrawals.map(([offer, cb]) => {
			const offerId = `${offer.origin}:${offer.name}`;
			const offerReleased: Behavior<boolean> = inboundOffers.map(
				(offers) => !(offerId in offers) || !offers[offerId].deployed
			);

			return offersStateInitialized
				.flatMap(() => runNow(when(offerReleased)))
				.map(withEffects(cb));
		})
	);

const wishPollAnswer = (
	polls: Stream<
		[Wish<unknown>, (error: Error | null, remoteOffer: RemoteOffer<unknown>) => void]
	>,
	offers: Behavior<InOffers>
): Stream<IO<void>> =>
	snapshotWith(
		([wish, cb], offers) => {
			const offerId = `${wish.targetId}:${wish.name}`;
			const offer: RemoteOffer<unknown> =
				offerId in offers
					? offers[offerId].withdrawn
						? { isWithdrawn: true }
						: { isWithdrawn: false, offer: offers[offerId].offer?.offer }
					: { isWithdrawn: false };
			return call(() => cb(null, offer));
		},
		offers,
		polls
	);

export type OffersRuntime = {
	inboundOfferUpdates: Stream<void>;
	stop: () => Promise<void>;
};
export const startOffersRuntime = async (
	deployment: DeploymentService,
	resources: ResourcesService,
	// Indicating when first deployment finished => only after this the entire deployment
	// state is reconstructed and offers can be safely released
	initialized: Future<void>,
	deploymentName: string,
	heartbeatInterval: number,
	logger: Logger
): Promise<OffersRuntime> => {
	const remoteUpserts = resources.remoteUpdated.combine(resources.remoteRefreshed);
	const remotes: Behavior<Remotes> = runNow(
		sample(accumRemotes(remoteUpserts, resources.remoteDeleted))
	);
	const heartbeatTrigger = intervalStream(heartbeatInterval * 1000);
	const connectedRemotes: Stream<Remotes> = runNow(
		performStream(sendHeartbeats(remotes, heartbeatTrigger, logger)).flatMap(flatFutures)
	);
	const remoteConnects = runNow(
		sample(scanRemoteConnects(connectedRemotes, logger))
			.flatMap(performStream)
			.flatMap(flatFutures)
	);
	const outboundOffers: Behavior<Offers> = runNow(
		sample(
			accumOutboundOffers(
				combine(resources.offerUpdated, resources.offerRefreshed),
				resources.offerWithdrawn.map(([o]) => o),
				logger
			)
		)
	);
	const inboundOffers: Behavior<InOffers> = runNow(
		sample(
			accumInboundOffers(
				deployment.offerUpdated,
				resources.wishPolled
					.filter(([w]) => w.isDeployed)
					.map(([w]) => toDeploymentOffer(w)),
				resources.wishPolled
					.filter(([w]) => !w.isDeployed)
					.map(([w]) => toDeploymentOffer(w)),
				deployment.offerWithdrawn.map(([o]) => o),
				resources.wishDeleted.map(toDeploymentOffer),
				logger
			)
		)
	);

	// Forward new and updated offers directly to beneficiary
	const offersDirectForward = runNow(
		performStream(directOfferForward(resources.offerUpdated, remotes, deploymentName, logger))
	);
	// When a remote (re)connects resend all offers it is the beneficiary of
	const resendOffers = runNow(
		performStream(resendOffersOnConnect(outboundOffers, remoteConnects, deploymentName, logger))
	);
	// Directly forward offer withdrawals to the beneficiary
	const sendOfferWithdrawals = offerWithdrawalSend(
		remotes,
		remoteConnects,
		resources.offerWithdrawn,
		deploymentName,
		logger
	).map((substream) => runNow(performStream(runNow(flatFutures(substream)))));
	sendOfferWithdrawals.activate(tick());
	// Directly forward offer releases to withdrawing remote
	const sendOfferRelease = runNow(
		sample(offerRelease(deployment.offerWithdrawn, inboundOffers, initialized)).flatMap(
			performStream
		)
	);
	// Handle wish polls of own deployment
	const answerWishPolls = runNow(
		// performStream(delayUntilSatisfiedWishPollAnswer(resources.wishPolled, inboundOffers))
		performStream(wishPollAnswer(resources.wishPolled, inboundOffers))
	);

	const inboundOfferUpdates: Stream<void> = combine(
		deployment.offerUpdated.mapTo(undefined),
		deployment.offerWithdrawn.mapTo(undefined)
	);

	const stop = async () => {
		heartbeatTrigger.deactivate();
		offersDirectForward.deactivate();
		resendOffers.deactivate();
		sendOfferWithdrawals.deactivate();
		sendOfferRelease.deactivate();
		answerWishPolls.deactivate();
	};
	return { inboundOfferUpdates, stop };
};
