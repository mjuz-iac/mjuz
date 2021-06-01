import * as grpc from '@grpc/grpc-js';
import * as rpc from '@mjuz/grpc-protos';
import { DeploymentService, startDeploymentService } from '../src';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import { Logger } from 'pino';
import { instance, mock } from 'ts-mockito';

describe('deployment service', () => {
	let deploymentService: DeploymentService;
	let deploymentClient: rpc.DeploymentClient;
	beforeEach(async () => {
		deploymentService = await startDeploymentService(
			'127.0.0.1',
			19952,
			instance(mock<Logger>())
		);
		deploymentClient = new rpc.DeploymentClient(
			'127.0.0.1:19952',
			grpc.credentials.createInsecure()
		);
	});
	afterEach(async () => {
		await deploymentClient.close();
		await deploymentService.stop();
	});

	test('start and stop', () => {
		// Intended to be empty
	});

	test('offer', async () => {
		const offer = new rpc.DeploymentOffer();
		const received = new Promise((resolve) =>
			deploymentService.offerUpdated.subscribe((receivedOffer) =>
				resolve(expect(receivedOffer).toEqual(offer.toObject()))
			)
		);
		const response = new Promise((resolve, reject) =>
			deploymentClient.offer(offer, (error, response) =>
				error ? reject(error) : resolve(response)
			)
		);
		await expect(response).resolves.toEqual(new Empty());
		await received;
	});

	test('release offer', async () => {
		const offer = new rpc.DeploymentOffer();
		const received = new Promise((resolve) =>
			deploymentService.offerWithdrawn.subscribe((t) => {
				const [receivedOffer, cb] = t;
				resolve(expect(receivedOffer).toEqual(offer.toObject()));
				cb();
			})
		);
		const response = new Promise((resolve, reject) =>
			deploymentClient.releaseOffer(offer, (error, response) =>
				error ? reject(error) : resolve(response)
			)
		);
		await expect(response).resolves.toEqual(new Empty());
		await received;
	});
});
