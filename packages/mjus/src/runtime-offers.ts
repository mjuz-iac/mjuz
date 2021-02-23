import {
	accumFrom,
	Behavior,
	combine,
	performStream,
	runNow,
	sample,
	snapshotWith,
	Stream,
	tick,
} from '@funkia/hareactive';
import { callP, catchE, IO } from '@funkia/io';
import * as grpc from '@grpc/grpc-js';
import * as rpc from '@mjus/grpc-protos';
import { Offer, Remote, ResourcesService, Wish } from './resources-service';
import { newLogger } from './logging';
import { JavaScriptValue, Value } from 'google-protobuf/google/protobuf/struct_pb';
import { DeploymentOffer, DeploymentService } from './deployment-service';

const logger = newLogger('offers runtime');

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
				else
					update[remote.id] = new rpc.DeploymentClient(
						`${remote.host}:${remote.port}`,
						grpc.credentials.createInsecure()
					);
			else {
				if (!(remote.id in update))
					logger.warn(`Remote ${remote.id} deleted that was not registered`);
				else {
					update[remote.id].close();
					delete update[remote.id];
				}
			}
			return update;
		},
		{},
		combine(
			remoteCreated.map<['add' | 'remove', Remote]>((remote) => ['add', remote]),
			remoteDeleted.map<['add' | 'remove', Remote]>((remote) => ['remove', remote])
		)
	);

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

const toDeploymentOffer = <O>(wish: Wish<O>): DeploymentOffer<O> => {
	return {
		origin: wish.targetid,
		name: wish.name,
	};
};

export type OffersRuntime = {
	inboundOfferUpdates: Stream<void>;
	stop: () => Promise<void>;
};
export const startOffersRuntime = async (
	deployment: DeploymentService,
	resources: ResourcesService,
	deploymentName: string
): Promise<OffersRuntime> => {
	const remotes: Behavior<Remotes> = runNow(
		sample(accumRemotes(resources.remoteCreated, resources.remoteDeleted))
	);
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
	offersDirectForward.activate(tick());

	const inboundOfferChanges: Stream<void> = combine(
		deployment.offerUpdated.mapTo(undefined),
		deployment.offerWithdrawn.mapTo(undefined)
	);

	const stop = async () => {
		offersDirectForward.deactivate();
	};
	return {
		inboundOfferUpdates: inboundOfferChanges,
		stop,
	};
};
