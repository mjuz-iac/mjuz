import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';

const REMOTES_SERVICE_PORT = '127.0.0.1:19951';

const logger = newLogger('offer runtime');

const resourcesClientRpc = <R>(
	callFunction: (
		client: rpc.ResourcesClient,
		cb: (error: grpc.ServiceError | null, res: R) => void
	) => grpc.ClientUnaryCall
): Promise<R> =>
	new Promise((resolve, reject) => {
		const client = new rpc.ResourcesClient(
			REMOTES_SERVICE_PORT,
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

	getRemoteOffer(
		call: grpc.ServerUnaryCall<rpc.Wish, rpc.OptionalOffer>,
		cb: sendUnaryData<rpc.OptionalOffer>
		// eslint-disable-next-line @typescript-eslint/no-empty-function
	): void {}
}

export const startResourcesService = (): Promise<() => Promise<void>> =>
	new Promise((resolve, reject) => {
		const server = new grpc.Server();
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		server.addService(rpc.ResourcesService, new ResourcesServer());
		server.bindAsync(
			REMOTES_SERVICE_PORT,
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
