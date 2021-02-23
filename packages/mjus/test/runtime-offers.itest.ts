import { sinkStream, SinkStream } from '@funkia/hareactive';
import {
	DeploymentOffer,
	DeploymentService,
	Offer,
	OffersRuntime,
	Remote,
	ResourcesService,
	startDeploymentService,
	startOffersRuntime,
	Wish,
} from '../src';
import * as rpc from '@mjus/grpc-protos';

describe('offers runtime', () => {
	let deploymentService: DeploymentService & {
		offerUpdated: SinkStream<DeploymentOffer<unknown>>;
		offerWithdrawn: SinkStream<[DeploymentOffer<unknown>, () => void]>;
	};
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
		deploymentService = {
			offerUpdated: sinkStream<DeploymentOffer<unknown>>(),
			offerWithdrawn: sinkStream<[DeploymentOffer<unknown>, () => void]>(),
			stop: async () => {
				// Intended to be empty
			},
		};
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
		offersRuntime = await startOffersRuntime(
			deploymentService,
			resourcesService,
			'test-deployment'
		);

		remoteDeploymentService = await startDeploymentService('127.0.0.1', 19953);
	});

	afterEach(async () => {
		await offersRuntime.stop();
		await remoteDeploymentService.stop();
	});

	test('directly forward offer', async () => {
		const receivedOffer = new Promise<void>((resolve) =>
			remoteDeploymentService.offerUpdated.subscribe((receivedOffer) =>
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

	test('inbound offer updates', async () => {
		const threeUpdates = new Promise<void>((resolve) => {
			let updates = 0;
			offersRuntime.inboundOfferUpdates.subscribe(() => {
				updates++;
				if (updates === 3) resolve();
			});
		});

		deploymentService.offerUpdated.push({ origin: 'a', name: 'b', offer: 'c' });
		// eslint-disable-next-line @typescript-eslint/no-empty-function
		deploymentService.offerWithdrawn.push([{ origin: 'a', name: 'b', offer: 'c' }, () => {}]);
		deploymentService.offerUpdated.push({ origin: 'a', name: 'b', offer: 'c' });

		await threeUpdates;
	});
});
