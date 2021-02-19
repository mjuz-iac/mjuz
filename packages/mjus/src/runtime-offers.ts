import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { newLogger } from '.';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';

const REMOTES_SERVICE_PORT = '127.0.0.1:19951';

const logger = newLogger('offer runtime');

const tmpResourcesClient = () =>
	new rpc.ResourcesClient(REMOTES_SERVICE_PORT, grpc.credentials.createInsecure());
export const createRemote = (remote: rpc.Remote): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const client = tmpResourcesClient();
		client.createRemote(remote, (error) => {
			client.close();
			error ? reject(error) : resolve();
		});
	});
export const deleteRemote = (remote: rpc.Remote): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const client = tmpResourcesClient();
		client.deleteRemote(remote, (error) => {
			client.close();
			error ? reject(error) : resolve();
		});
	});

class ResourcesServer implements rpc.IResourcesServer {
	[name: string]: grpc.UntypedHandleCall;

	createRemote(
		call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
		callback: sendUnaryData<Empty>
	): void {
		const remote = call.request as rpc.Remote;
		logger.info(remote, 'Creating remote');
		callback(null, new Empty());
	}
	deleteRemote(
		call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
		callback: sendUnaryData<Empty>
	): void {
		const remote = call.request as rpc.Remote;
		logger.info(remote, 'Deleting remote');
		callback(null, new Empty());
	}

	updateOffer(
		call: grpc.ServerUnaryCall<rpc.Offer, Empty>,
		callback: sendUnaryData<Empty>
		// eslint-disable-next-line @typescript-eslint/no-empty-function
	): void {}
	deleteOffer(
		call: grpc.ServerUnaryCall<rpc.Offer, Empty>,
		callback: sendUnaryData<Empty>
		// eslint-disable-next-line @typescript-eslint/no-empty-function
	): void {}
	getRemoteOffer(
		call: grpc.ServerUnaryCall<rpc.Wish, rpc.OptionalOffer>,
		callback: sendUnaryData<rpc.OptionalOffer>
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
