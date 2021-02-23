import {
	accumFrom,
	Behavior,
	combine,
	flatFuturesFrom,
	performStream,
	runNow,
	sample,
	sinkStream,
	snapshotWith,
	Stream,
	when,
} from '@funkia/hareactive';
import { call, callP, catchE, IO, runIO, withEffects } from '@funkia/io';
import * as grpc from '@grpc/grpc-js';
import * as rpc from '@mjus/grpc-protos';
import { Offer, Remote, ResourcesService, Wish } from './resources-service';
import { newLogger } from './logging';
import { JavaScriptValue, Value } from 'google-protobuf/google/protobuf/struct_pb';
import { DeploymentOffer, DeploymentService } from './deployment-service';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';

const logger = newLogger('offers runtime');

const setupRemote = (remote: Remote): rpc.DeploymentClient =>
	new rpc.DeploymentClient(`${remote.host}:${remote.port}`, grpc.credentials.createInsecure());
const shutdownRemote = (client: rpc.DeploymentClient): IO<void> => call(() => client.close());

type Remotes = Record<string, rpc.DeploymentClient>;
const accumRemotes = (
	remoteCreated: Stream<Remote>,
	remoteDeleted: Stream<Remote>
): Behavior<Behavior<Remotes>> =>
	accumFrom<['add' | 'remove', Remote], Remotes>(
		(event, remotes) => {
			const [change, remote] = event;
			const update = { ...remotes };
			if (change === 'add')
				if (remote.id in update)
					logger.warn(
						`Remote ${remote.id} created even though it was already registered`
					);
				else update[remote.id] = setupRemote(remote);
			else {
				if (!(remote.id in update))
					logger.warn(`Remote ${remote.id} deleted that was not registered`);
				else {
					runIO(shutdownRemote(update[remote.id]));
					delete update[remote.id];
				}
			}
			return update;
		},
		{},
		combine<['remove' | 'add', Remote]>(
			remoteCreated.map<['add', Remote]>((remote) => ['add', remote]),
			remoteDeleted.map<['remove', Remote]>((remote) => ['remove', remote])
		)
	);

type HeartbeatMonitor = {
	// Fires a remote client with its id on the first successful heartbeat (initially and after disconnects)
	connects: Stream<[string, rpc.DeploymentClient]>;
	stop: () => void;
};
/**
 * @param remotes
 * @param heartbeatInterval in seconds
 */
const startHeartbeatMonitor = (
	remotes: Behavior<Remotes>,
	heartbeatInterval: number
): HeartbeatMonitor => {
	const connected = new Set<string>();
	const connects = sinkStream<[string, rpc.DeploymentClient]>();

	const interval = setInterval(() => {
		Object.entries(runNow(sample(remotes))).forEach((t) => {
			const [remoteId, client] = t;
			client.heartbeat(new Empty(), (err) => {
				if (err && connected.has(remoteId)) {
					logger.info(`Remote ${remoteId} disconnected`);
					connected.delete(remoteId);
				} else if (!err && !connected.has(remoteId)) {
					logger.info(`Remote ${remoteId} connected`);
					connected.add(remoteId);
					connects.push(t);
				}
			});
		});
	}, heartbeatInterval * 1000);
	return {
		connects,
		stop: () => clearInterval(interval),
	};
};

type Offers = Record<string, Offer<unknown>>;
const accumOutboundOffers = (
	offerUpdate: Stream<Offer<unknown>>,
	offerWithdrawal: Stream<Offer<unknown>>
): Behavior<Behavior<Offers>> =>
	accumFrom<['upsert' | 'remove', Offer<unknown>], Offers>(
		(event, offers) => {
			const [change, offer] = event;
			const update = { ...offers };
			const offerId = `${offer.beneficiaryid}:${offer.name}`;

			if (change === 'upsert') update[offerId] = offer;
			else if (!(offerId in update)) logger.warn(`Withdrawing unknown offer ${offerId}`);
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
 * @param offerLocked
 * @param offerWithdrawal
 * @param offerReleased
 */
const accumInboundOffers = (
	offerUpdate: Stream<DeploymentOffer<unknown>>,
	offerLocked: Stream<DeploymentOffer<unknown>>,
	offerWithdrawal: Stream<DeploymentOffer<unknown>>,
	offerReleased: Stream<DeploymentOffer<unknown>>
): Behavior<Behavior<InboundOffers>> =>
	accumFrom<InboundOfferEvent<unknown>, InboundOffers>(
		(event, offers) => {
			const [change, offer] = event;
			const update = { ...offers };
			const offerId = `${offer.origin}:${offer.name}`;

			switch (change) {
				case 'upsert':
					if (offerId in update) {
						update[offerId].withdrawn = false;
						update[offerId].offer = offer;
					} else {
						update[offerId] = {
							locked: false,
							withdrawn: false,
							offer: offer,
						};
					}
					break;
				case 'lock':
					if (offerId in update) update[offerId].locked = true;
					// Case: after restart the offer was not renewed from the offering side, but the corresponding wish is already deployed
					else
						update[offerId] = {
							locked: true,
							withdrawn: false,
						};
					break;
				case 'withdraw':
					if (offerId in update)
						if (update[offerId].locked) update[offerId].withdrawn = true;
						else delete update[offerId];
					break;
				case 'release':
					if (offerId in update)
						if (update[offerId].withdrawn) delete update[offerId];
						else
							logger.warn(
								`Released offer ${offerId} that is not withdrawn (anymore?)`
							);
					else logger.warn(`Released unknown offer ${offerId}`);
					break;
			}
			return update;
		},
		{},
		combine(
			offerUpdate.map<InboundOfferEvent<unknown>>((offer) => ['upsert', offer]),
			offerLocked.map<InboundOfferEvent<unknown>>((offer) => ['lock', offer]),
			offerWithdrawal.map<InboundOfferEvent<unknown>>((offer) => ['withdraw', offer]),
			offerReleased.map<InboundOfferEvent<unknown>>((offer) => ['release', offer])
		)
	);
type InboundOfferEvent<O> = ['upsert' | 'lock' | 'withdraw' | 'release', DeploymentOffer<O>];
type InboundOffers = Record<string, InboundOffer<unknown>>;
type InboundOffer<O> = {
	locked: boolean;
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
	deploymentName: string
): Stream<IO<rpc.Offer>> =>
	snapshotWith<Offer<unknown>, Remotes, [rpc.DeploymentClient, Offer<unknown>]>(
		(offer, remotes) => [remotes[offer.beneficiaryid], offer],
		remotes,
		offerUpdated
	)
		.filter((t) => t[0] !== undefined)
		.map((t) => {
			const [remote, offer] = t;
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
					`Directly forwarded offer ${sentOffer.name} to ${sentOffer.beneficiaryid}`
				)
			)
		)
		.map((sentOffer) =>
			catchE(
				(error) => IO.of(logger.debug(error, 'Directly forwarding offer failed')),
				sentOffer
			)
		);

const offerResend = (
	offers: Behavior<Offers>,
	connects: Stream<[string, rpc.DeploymentClient]>,
	deploymentName: string
) =>
	snapshotWith<[string, rpc.DeploymentClient], Offers, IO<void>>(
		(remote, offers) => {
			const [remoteId, client] = remote;
			const resends: IO<void>[] = Object.keys(offers)
				.filter((offerId) => offerId.startsWith(`${remoteId}:`))
				.map((offerId) =>
					call(() => {
						client.offer(
							toRpcDeploymentOffer(offers[offerId], deploymentName),
							(err) => {
								if (err) logger.warn(err, `Failed to resend offer ${offerId}`);
							}
						);
					})
				);
			return resends.reduce((a, b) => a.flatMap(() => b));
		},
		offers,
		connects
	);

const toDeploymentOffer = <O>(wish: Wish<O>): DeploymentOffer<O> => {
	return {
		origin: wish.targetid,
		name: wish.name,
	};
};

const offerRelease = (
	offerWithdrawals: Stream<[DeploymentOffer<unknown>, () => void]>,
	inboundOffers: Behavior<InboundOffers>
): Behavior<Stream<IO<void>>> =>
	flatFuturesFrom(
		offerWithdrawals.map((withdrawal) => {
			const [offer, cb] = withdrawal;
			const offerId = `${offer.origin}:${offer.name}`;
			const offerReleased: Behavior<boolean> = inboundOffers.map(
				(offers) => !(offerId in offers) || !offers[offerId].locked
			);
			return runNow(when(offerReleased)).map(withEffects(cb));
		})
	);

const wishPollAnswer = (
	polls: Stream<[Wish<unknown>, (error: Error | null, wish: rpc.Wish | null) => void]>,
	offers: Behavior<InboundOffers>
): Stream<IO<void>> =>
	snapshotWith(
		(poll, offers) => {
			const [wish, cb] = poll;
			const offerId = `${wish.targetid}:${wish.name}`;
			const offer = new rpc.Wish().setTargetid(wish.targetid).setName(wish.name);
			if (offerId in offers)
				if (offers[offerId].withdrawn) offer.setIswithdrawn(true);
				else
					offer.setOffer(
						Value.fromJavaScript(offers[offerId].offer?.offer as JavaScriptValue)
					);
			else offer.setIswithdrawn(false);
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
	deploymentName: string,
	heartbeatInterval: number
): Promise<OffersRuntime> => {
	const remotes: Behavior<Remotes> = runNow(
		sample(accumRemotes(resources.remoteCreated, resources.remoteDeleted))
	);
	const heartbeatMonitor = startHeartbeatMonitor(remotes, heartbeatInterval);
	const outboundOffers: Behavior<Offers> = runNow(
		sample(
			accumOutboundOffers(
				resources.offerUpdated,
				resources.offerWithdrawn.map((t) => t[0])
			)
		)
	);
	const inboundOffers: Behavior<InboundOffers> = runNow(
		sample(
			accumInboundOffers(
				deployment.offerUpdated,
				resources.wishPolled.map((t) => toDeploymentOffer(t[0])),
				deployment.offerWithdrawn.map((t) => t[0]),
				resources.wishDeleted.map(toDeploymentOffer)
			)
		)
	);

	const offersDirectForward = runNow(
		performStream(directOfferForward(resources.offerUpdated, remotes, deploymentName))
	);
	const resendOffers = runNow(
		performStream(offerResend(outboundOffers, heartbeatMonitor.connects, deploymentName))
	);
	const sendOfferRelease = runNow(
		sample(offerRelease(deployment.offerWithdrawn, inboundOffers)).flatMap(performStream)
	);
	const answerWishPolls = runNow(
		performStream(wishPollAnswer(resources.wishPolled, inboundOffers))
	);

	const inboundOfferChanges: Stream<void> = combine(
		deployment.offerUpdated.mapTo(undefined),
		deployment.offerWithdrawn.mapTo(undefined)
	);

	const stop = async () => {
		heartbeatMonitor.stop();
		offersDirectForward.deactivate();
		resendOffers.deactivate();
		sendOfferRelease.deactivate();
		answerWishPolls.deactivate();
	};
	return {
		inboundOfferUpdates: inboundOfferChanges,
		stop,
	};
};
