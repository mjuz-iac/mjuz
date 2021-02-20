import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';

const logger = newLogger('offer runtime');

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

class ResourcesServer implements rpc.IResourcesServer {
	[name: string]: grpc.UntypedHandleCall;

	createRemote(call: grpc.ServerUnaryCall<rpc.Remote, Empty>, cb: sendUnaryData<Empty>): void {
		const remote = call.request as rpc.Remote;
		logger.info(remote, 'Creating remote');
		cb(null, new Empty());
	}
	deleteRemote(call: grpc.ServerUnaryCall<rpc.Remote, Empty>, cb: sendUnaryData<Empty>): void {
		const remote = call.request as rpc.Remote;
		logger.info(remote, 'Deleting remote');
		cb(null, new Empty());
	}

	updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
		const offer = call.request as rpc.Offer;
		logger.info(offer, 'Updating offer');
		cb(null, new Empty());
	}
	deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
		const offer = call.request as rpc.Offer;
		logger.info(offer, 'Deleting offer');
		cb(null, new Empty());
	}

	getWish(call: grpc.ServerUnaryCall<rpc.Wish, rpc.Wish>, cb: sendUnaryData<rpc.Wish>): void {
		const wish = call.request as rpc.Wish;
		logger.info(wish, 'Polling remote offer');
		cb(null, wish);
	}
	wishDeleted(call: grpc.ServerUnaryCall<rpc.Wish, Empty>, cb: sendUnaryData<Empty>): void {
		const wish = call.request as rpc.Wish;
		logger.info(wish, 'Wish was deleted');
		cb(null, new Empty());
	}
}

export const startResourcesService = (host: string, port: number): Promise<() => Promise<void>> =>
	new Promise((resolve, reject) => {
		resourcesClientHost = host;
		resourcesClientPort = port;
		const server = new grpc.Server();
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		server.addService(rpc.ResourcesService, new ResourcesServer());
		server.bindAsync(
			`${host}:${port}`,
			grpc.ServerCredentials.createInsecure(),
			(err, port) => {
				if (err) return reject(err);
				logger.info(`Resources service binding port ${port}`);
				server.start();
				logger.info(`Resources service started on port ${port}`);

				resolve(() => stopServer(server, 'resources service'));
			}
		);
	});

const stopServer = async (server: grpc.Server, name: string): Promise<void> => {
	logger.info(`Shutting down ${name}`);
	server.forceShutdown();
};
