import { sinkStream, SinkStream } from '@funkia/hareactive';
import {
	DeploymentService,
	Offer,
	Remote,
	ResourcesService,
	startDeploymentService,
	Wish,
} from '../src';
import { OffersRuntime, startOffersRuntime } from '../src/runtime-offers';
import * as rpc from '@mjus/grpc-protos';

describe('offers runtime', () => {
	let resourcesService: ResourcesService & {
		remoteCreated: SinkStream<Remote>;
		remoteDeleted: SinkStream<Remote>;
		offerUpdated: SinkStream<Offer<unknown>>;
		offerWithdrawn: SinkStream<[Offer<unknown>, (error: Error | null) => void]>;
		wishPolled: SinkStream<[Wish, (error: Error | null, wish: rpc.Wish | null) => void]>;
		wishDeleted: SinkStream<Wish>;
	};
	let offersRuntime: OffersRuntime;
	let remoteDeploymentService: DeploymentService;
	beforeEach(async () => {
		resourcesService = {
			remoteCreated: sinkStream<Remote>(),
			remoteDeleted: sinkStream<Remote>(),
			offerUpdated: sinkStream<Offer<unknown>>(),
			offerWithdrawn: sinkStream<[Offer<unknown>, (error: Error | null) => void]>(),
			wishPolled: sinkStream<[Wish, (error: Error | null, wish: rpc.Wish | null) => void]>(),
			wishDeleted: sinkStream<Wish>(),
			stop: async () => {
				// Intended to be empty
			},
		};
		offersRuntime = await startOffersRuntime(resourcesService, 'test-deployment');

		remoteDeploymentService = await startDeploymentService('127.0.0.1', 19953);
	});

	afterEach(async () => {
		await offersRuntime.stop();
		await remoteDeploymentService.stop();
	});

	test('directly forward offer', async () => {
		const receivedOffer = new Promise<void>((resolve) =>
			remoteDeploymentService.offers.subscribe((receivedOffer) =>
				resolve(
					expect(receivedOffer).toEqual({
						origin: 'test-deployment',
						name: 'test',
						offer: { a: ['b', 'c'] },
					})
				)
			)
		);

		resourcesService.remoteCreated.push({ id: 'remote', host: '127.0.0.1', port: 19953 });
		resourcesService.offerUpdated.push({
			beneficiaryid: 'no-remote',
			name: 'test',
			offer: { a: ['b', 'c'] },
		});
		resourcesService.offerUpdated.push({
			beneficiaryid: 'remote',
			name: 'test',
			offer: { a: ['b', 'c'] },
		});
		await receivedOffer;

		// Cleanup
		const deletedRemote = new Promise<void>((resolve) =>
			resourcesService.remoteDeleted.subscribe(() => resolve())
		);
		resourcesService.remoteDeleted.push({ id: 'remote', host: '127.0.0.1', port: 19953 });
		await deletedRemote;
	});
});
