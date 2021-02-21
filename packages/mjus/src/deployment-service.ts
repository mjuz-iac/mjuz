import { sinkStream, Stream } from '@funkia/hareactive';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';
import { startService } from './service-utils';
import { Typify } from './type-utils';

const logger = newLogger('deployment service');

const deploymentService = (): Omit<DeploymentService, 'stop'> & {
	server: rpc.IDeploymentServer;
} => {
	class DeploymentServer implements rpc.IDeploymentServer {
		[name: string]: grpc.UntypedHandleCall;

		offer(
			call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const offer = call.request as rpc.DeploymentOffer;
			logger.info(offer, 'Received offer');
			cb(null, new Empty());
			offers.push(offer.toObject());
		}

		releaseOffer(
			call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const offer = call.request as rpc.DeploymentOffer;
			logger.info(offer, 'Releasing offer');
			releaseOffers.push([offer.toObject(), () => cb(null, new Empty())]);
		}
	}

	const offers = sinkStream<DeploymentOffer>();
	const releaseOffers = sinkStream<[DeploymentOffer, () => void]>();

	return {
		server: new DeploymentServer(),
		offers,
		releaseOffers,
	};
};

export type DeploymentOffer = rpc.DeploymentOffer.AsObject;
export type DeploymentService = {
	offers: Stream<DeploymentOffer>;
	releaseOffers: Stream<[DeploymentOffer, () => void]>;
	stop: () => Promise<void>;
};
export const startDeploymentService = async (
	host: string,
	port: number
): Promise<DeploymentService> => {
	const service = deploymentService();
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
