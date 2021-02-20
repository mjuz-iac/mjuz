import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';
import { startService } from './service-utils';
import { Typify } from './type-utils';

const logger = newLogger('deployment service');

class DeploymentServer implements rpc.IDeploymentServer {
	[name: string]: grpc.UntypedHandleCall;

	offer(call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>, cb: sendUnaryData<Empty>): void {
		const offer = call.request as rpc.DeploymentOffer;
		logger.info(offer, 'Received offer');
		cb(null, new Empty());
	}

	releaseOffer(
		call: grpc.ServerUnaryCall<rpc.DeploymentOffer, Empty>,
		cb: sendUnaryData<Empty>
	): void {
		const offer = call.request as rpc.DeploymentOffer;
		logger.info(offer, 'Releasing offer');
		cb(null, new Empty());
	}
}

export const startDeploymentService = (
	host: string,
	port: number
): Promise<() => Promise<void>> => {
	return startService(
		'deployment',
		rpc.DeploymentService as Typify<rpc.IDeploymentService>,
		new DeploymentServer(),
		host,
		port,
		logger
	);
};
