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
import { Offer, Remote, ResourcesService } from './resources-service';
import { newLogger } from './logging';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';

const logger = newLogger('offers runtime');

type Remotes = Record<string, rpc.DeploymentClient>;
const accumulatedRemotes = (
	remoteCreated: Stream<Remote>,
	remoteDeleted: Stream<Remote>
): Behavior<Behavior<Remotes>> =>
	accumFrom<['created' | 'deleted', Remote], Record<string, rpc.DeploymentClient>>(
		(event, remotes) => {
			const [change, remote] = event;
			const update = { ...remotes };
			if (change === 'created')
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
			remoteCreated.map<['created' | 'deleted', Remote]>((remote) => ['created', remote]),
			remoteDeleted.map<['created' | 'deleted', Remote]>((remote) => ['deleted', remote])
		)
	);

const toDeploymentOffer = <O>(offer: Offer<O>, deploymentName: string): rpc.DeploymentOffer =>
	new rpc.DeploymentOffer()
		.setOrigin(deploymentName)
		.setName(offer.name)
		.setOffer(Value.fromJavaScript(offer.offer));
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
				remote.offer(toDeploymentOffer(offer, deploymentName), (error) =>
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

export type OffersRuntime = {
	stop: () => Promise<void>;
};
export const startOffersRuntime = async (
	resourcesService: ResourcesService,
	deploymentName: string
): Promise<OffersRuntime> => {
	const remotes: Behavior<Remotes> = runNow(
		sample(accumulatedRemotes(resourcesService.remoteCreated, resourcesService.remoteDeleted))
	);
	const offersDirectForward = runNow(
		performStream(directOfferForward(resourcesService.offerUpdated, remotes, deploymentName))
	);
	offersDirectForward.activate(tick());

	const stop = async () => {
		offersDirectForward.deactivate();
	};

	return {
		stop,
	};
};
