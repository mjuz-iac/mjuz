import { sinkStream, Stream } from '@funkia/hareactive';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import * as rpc from '@mjuz/grpc-protos';
import { startService } from './service-utils';
import { Typify } from './type-utils';
import { Logger } from 'pino';

export const toDeploymentOffer = <O>(offer: rpc.DeploymentOffer): DeploymentOffer<O> => {
	return {
		origin: offer.getOrigin(),
		name: offer.getName(),
		offer: offer.getOffer()?.toJavaScript() as O,
	};
};

const deploymentService = (
	logger: Logger
): Omit<DeploymentService, 'stop'> & {
	server: rpc.IDeploymentServer;
} => {
	class DeploymentServer implements rpc.IDeploymentServer {
		[name: string]: grpc.UntypedHandleCall;

		offer(
			call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const offer = call.request as rpc.DeploymentOffer;
			logger.info(
				offer,
				`Received offer '${offer.getName()}' from remote '${offer.getOrigin()}`
			);
			cb(null, new Empty());
			offers.push(toDeploymentOffer(offer));
		}

		releaseOffer(
			call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const offer = call.request as rpc.DeploymentOffer;
			logger.info(
				offer,
				`Releasing offer '${offer.getName()}' from remote '${offer.getOrigin()}'`
			);
			releaseOffers.push([
				toDeploymentOffer(offer),
				() => {
					logger.info(
						offer,
						`Released offer '${offer.getName()}' from remote '${offer.getOrigin()}'`
					);
					cb(null, new Empty());
				},
			]);
		}

		heartbeat(call: grpc.ServerUnaryCall<Empty, Empty>, cb: sendUnaryData<Empty>): void {
			cb(null, new Empty());
		}
	}

	const offers = sinkStream<DeploymentOffer<unknown>>();
	const releaseOffers = sinkStream<[DeploymentOffer<unknown>, () => void]>();

	return {
		server: new DeploymentServer(),
		offerUpdated: offers,
		offerWithdrawn: releaseOffers,
	};
};

export type DeploymentOffer<O> = Omit<rpc.DeploymentOffer.AsObject, 'offer'> & { offer?: O };
export type DeploymentService = {
	offerUpdated: Stream<DeploymentOffer<unknown>>;
	offerWithdrawn: Stream<[DeploymentOffer<unknown>, () => void]>;
	stop: () => Promise<void>;
};
export const startDeploymentService = async (
	host: string,
	port: number,
	logger: Logger
): Promise<DeploymentService> => {
	const service = deploymentService(logger);
	const stopService = await startService(
		'deployment',
		rpc.DeploymentService as Typify<rpc.IDeploymentService>,
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
