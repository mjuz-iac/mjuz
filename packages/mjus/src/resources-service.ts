import { sinkStream, Stream } from '@funkia/hareactive';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';
import { startService } from './service-utils';
import { Typify } from './type-utils';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';

const logger = newLogger('resources service');

export const toRpcWish = (wish: Wish): rpc.Wish => {
	const w = new rpc.Wish()
		.setTargetid(wish.targetid)
		.setName(wish.name)
		.setIswithdrawn(wish.iswithdrawn);
	if (wish.offer) w.setOffer(Value.fromJavaScript(wish.offer));
	return w;
};

let resourcesClientHost: string;
let resourcesClientPort: number;
const resourcesClientRpc = <R>(
	callFunction: (
		client: rpc.ResourcesClient,
		cb: (error: grpc.ServiceError | null, res: R) => void
	) => grpc.ClientUnaryCall
): Promise<R> =>
	new Promise((resolve, reject) => {
		const client = new rpc.ResourcesClient(
			`${resourcesClientHost}:${resourcesClientPort}`,
			grpc.credentials.createInsecure()
		);
		callFunction(client, (error, res) => {
			client.close();
			error ? reject(error) : resolve(res);
		});
	});
export const createRemote = (remote: rpc.Remote): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.createRemote(remote, cb));
export const deleteRemote = (remote: rpc.Remote): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.deleteRemote(remote, cb));
export const updateOffer = (offer: rpc.Offer): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.updateOffer(offer, cb));
export const deleteOffer = (offer: rpc.Offer): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.deleteOffer(offer, cb));
export const getWish = (wish: rpc.Wish): Promise<rpc.Wish> =>
	resourcesClientRpc((client, cb) => client.getWish(wish, cb));
export const wishDeleted = (wish: rpc.Wish): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.wishDeleted(wish, cb));

const resourceService = (): Omit<ResourcesService, 'stop'> & { server: rpc.IResourcesServer } => {
	class ResourcesServer implements rpc.IResourcesServer {
		[name: string]: grpc.UntypedHandleCall;

		createRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote created');
			remoteCreated.push(remote.toObject());
			cb(null, new Empty());
		}

		deleteRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote deleted');
			remoteDeleted.push(remote.toObject());
			cb(null, new Empty());
		}

		updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer updated');
			offerUpdated.push(offer.toObject());
			cb(null, new Empty());
		}

		deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Withdrawing offer');
			offerWithdrawn.push([offer.toObject(), (error) => cb(error, new Empty())]);
		}

		getWish(call: grpc.ServerUnaryCall<rpc.Wish, rpc.Wish>, cb: sendUnaryData<rpc.Wish>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Polling remote offer');
			wishPolled.push([wish.toObject(), cb]);
		}

		wishDeleted(call: grpc.ServerUnaryCall<rpc.Wish, Empty>, cb: sendUnaryData<Empty>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Wish deleted');
			wishDeleted.push(wish.toObject());
			cb(null, new Empty());
		}
	}

	const remoteCreated = sinkStream<Remote>();
	const remoteDeleted = sinkStream<Remote>();
	const offerUpdated = sinkStream<Offer>();
	const offerWithdrawn = sinkStream<[Offer, (error: Error | null) => void]>();
	const wishPolled = sinkStream<[Wish, (error: Error | null, wish: rpc.Wish | null) => void]>();
	const wishDeleted = sinkStream<Wish>();

	return {
		server: new ResourcesServer(),
		remoteCreated,
		remoteDeleted,
		offerUpdated,
		offerWithdrawn,
		wishPolled,
		wishDeleted,
	};
};

export type Remote = rpc.Remote.AsObject;
export type Offer = rpc.Offer.AsObject;
export type Wish = rpc.Wish.AsObject;
export type ResourcesService = {
	remoteCreated: Stream<Remote>;
	remoteDeleted: Stream<Remote>;
	offerUpdated: Stream<Offer>;
	offerWithdrawn: Stream<[Offer, (error: Error | null) => void]>;
	wishPolled: Stream<[Wish, (error: Error | null, wish: rpc.Wish | null) => void]>;
	wishDeleted: Stream<Wish>;
	stop: () => Promise<void>;
};
export const startResourcesService = async (
	host: string,
	port: number
): Promise<ResourcesService> => {
	resourcesClientHost = host;
	resourcesClientPort = port;
	const service = resourceService();
	const stopService = await startService(
		'resources',
		rpc.ResourcesService as Typify<rpc.IResourcesService>,
		service.server,
		host,
		port,
		logger
	);
	return {
		...service,
		stop: stopService,
	};
};
