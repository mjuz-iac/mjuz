import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { newLogger } from '.';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import { IRemotesServer, Remote, RemotesClient, RemotesService } from '@mjus/grpc-protos';

const REMOTES_SERVICE_PORT = '127.0.0.1:19951';

const logger = newLogger('offer runtime');

const tmpRemotesClient = () =>
	new RemotesClient(REMOTES_SERVICE_PORT, grpc.credentials.createInsecure());
export const createRemote = (remote: Remote): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const client = tmpRemotesClient();
		client.createRemote(remote, (error) => {
			client.close();
			error ? reject(error) : resolve();
		});
	});
export const deleteRemote = (remote: Remote): Promise<void> =>
	new Promise<void>((resolve, reject) => {
		const client = tmpRemotesClient();
		client.deleteRemote(remote, (error) => {
			client.close();
			error ? reject(error) : resolve();
		});
	});

class RemotesServer implements IRemotesServer {
	[name: string]: grpc.UntypedHandleCall;

	createRemote(call: grpc.ServerUnaryCall<Remote, Empty>, callback: sendUnaryData<Empty>): void {
		const remote = call.request as Remote;
		logger.info(remote, 'Creating remote');
		callback(null, new Empty());
	}
	deleteRemote(call: grpc.ServerUnaryCall<Remote, Empty>, callback: sendUnaryData<Empty>): void {
		const remote = call.request as Remote;
		logger.info(remote, 'Deleting remote');
		callback(null, new Empty());
	}
}

export const startRemotesService = (): Promise<() => Promise<void>> =>
	new Promise((resolve, reject) => {
		const server = new grpc.Server();
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		server.addService(RemotesService, new RemotesServer());
		server.bindAsync(
			REMOTES_SERVICE_PORT,
			grpc.ServerCredentials.createInsecure(),
			(err, port) => {
				if (err) return reject(err);
				logger.info(`Remotes service binding port ${port}`);
				server.start();
				logger.info(`Remotes service started on port ${port}`);

				resolve(() => stopServer(server, 'remotes service'));
			}
		);
	});

const stopServer = async (server: grpc.Server, name: string): Promise<void> => {
	logger.info(`Shutting down ${name}`);
	server.forceShutdown();
};
