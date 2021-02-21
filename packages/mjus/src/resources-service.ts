import { sinkStream, Stream } from '@funkia/hareactive';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';
import { startService } from './service-utils';
import { Typify } from './type-utils';

const logger = newLogger('resources service');

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

export type ResourcesService = {
	server: rpc.IResourcesServer;
	remoteCreated: Stream<rpc.Remote>;
	remoteDeleted: Stream<rpc.Remote>;
	offerUpdated: Stream<rpc.Offer>;
	offerWithdrawn: Stream<[rpc.Offer, (error: Error | null) => void]>;
	wishPolled: Stream<[rpc.Wish, (error: Error | null, wish: rpc.Wish | null) => void]>;
	wishDeleted: Stream<rpc.Wish>;
	stopService: () => Promise<void>;
};
const resourceService = (): Omit<ResourcesService, 'stopService'> => {
	class ResourcesServer implements rpc.IResourcesServer {
		[name: string]: grpc.UntypedHandleCall;

		createRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote created');
			remoteCreated.push(remote);
			cb(null, new Empty());
		}

		deleteRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote deleted');
			remoteDeleted.push(remote);
			cb(null, new Empty());
		}

		updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer updated');
			offerUpdated.push(offer);
			cb(null, new Empty());
		}

		deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Withdrawing offer');
			offerWithdrawn.push([offer, (error) => cb(error, new Empty())]);
		}

		getWish(call: grpc.ServerUnaryCall<rpc.Wish, rpc.Wish>, cb: sendUnaryData<rpc.Wish>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Polling remote offer');
			wishPolled.push([wish, cb]);
		}

		wishDeleted(call: grpc.ServerUnaryCall<rpc.Wish, Empty>, cb: sendUnaryData<Empty>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Wish deleted');
			wishDeleted.push(wish);
			cb(null, new Empty());
		}
	}

	const remoteCreated = sinkStream<rpc.Remote>();
	const remoteDeleted = sinkStream<rpc.Remote>();
	const offerUpdated = sinkStream<rpc.Offer>();
	const offerWithdrawn = sinkStream<[rpc.Offer, (error: Error | null) => void]>();
	const wishPolled = sinkStream<
		[rpc.Wish, (error: Error | null, wish: rpc.Wish | null) => void]
	>();
	const wishDeleted = sinkStream<rpc.Wish>();

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

export const startResourcesService = (host: string, port: number): Promise<ResourcesService> => {
	resourcesClientHost = host;
	resourcesClientPort = port;
	const service = resourceService();
	return startService(
		'resources',
		rpc.ResourcesService as Typify<rpc.IResourcesService>,
		service.server,
		host,
		port,
		logger
	).then((stopService) => {
		return {
			...service,
			stopService,
		};
	});
};
