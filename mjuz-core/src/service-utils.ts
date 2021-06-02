import * as grpc from '@grpc/grpc-js';
import { Logger } from 'pino';

export const startService = <D extends grpc.ServiceDefinition>(
	name: string,
	definition: D,
	impl: grpc.UntypedServiceImplementation,
	host: string,
	port: number,
	logger: Logger
): Promise<() => Promise<void>> =>
	new Promise((resolve, reject) => {
		const server = new grpc.Server();
		server.addService(definition, impl);
		server.bindAsync(
			`${host}:${port}`,
			grpc.ServerCredentials.createInsecure(),
			(err, port) => {
				if (err) return reject(err);
				logger.info(`${name} service binding port ${port}`);
				server.start();
				logger.info(`${name} service started on port ${port}`);

				resolve(async (): Promise<void> => {
					logger.info(`Shutting down ${name}`);
					server.forceShutdown();
				});
			}
		);
	});
