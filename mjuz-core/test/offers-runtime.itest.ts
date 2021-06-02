import { Future, sinkStream, SinkStream } from '@funkia/hareactive';
import { Logger } from 'pino';
import { instance, mock } from 'ts-mockito';
import {
	DeploymentOffer,
	DeploymentService,
	Offer,
	OffersRuntime,
	Remote,
	RemoteOffer,
	ResourcesService,
	startDeploymentService,
	startOffersRuntime,
	Wish,
} from '../src';

describe('offers runtime', () => {
	let deploymentService: DeploymentService & {
		offerUpdated: SinkStream<DeploymentOffer<unknown>>;
		offerWithdrawn: SinkStream<[DeploymentOffer<unknown>, () => void]>;
	};
	let resourcesService: ResourcesService & {
		remoteUpdated: SinkStream<Remote>;
		remoteRefreshed: SinkStream<Remote>;
		remoteDeleted: SinkStream<Remote>;
		offerRefreshed: SinkStream<Offer<unknown>>;
		offerUpdated: SinkStream<Offer<unknown>>;
		offerWithdrawn: SinkStream<[Offer<unknown>, (error: Error | null) => void]>;
		wishPolled: SinkStream<
			[Wish<unknown>, (error: Error | null, remoteOffer: RemoteOffer<unknown> | null) => void]
		>;
		wishDeleted: SinkStream<Wish<unknown>>;
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
			remoteUpdated: sinkStream<Remote>(),
			remoteRefreshed: sinkStream<Remote>(),
			remoteDeleted: sinkStream<Remote>(),
			offerRefreshed: sinkStream<Offer<unknown>>(),
			offerUpdated: sinkStream<Offer<unknown>>(),
			offerWithdrawn: sinkStream<[Offer<unknown>, (error: Error | null) => void]>(),
			wishPolled:
				sinkStream<
					[
						Wish<unknown>,
						(error: Error | null, remoteOffer: RemoteOffer<unknown> | null) => void
					]
				>(),
			wishDeleted: sinkStream<Wish<unknown>>(),
			stop: async () => {
				// Intended to be empty
			},
		};
		offersRuntime = await startOffersRuntime(
			deploymentService,
			resourcesService,
			Future.of(undefined),
			'test-deployment',
			1,
			instance(mock<Logger>())
		);

		remoteDeploymentService = await startDeploymentService(
			'127.0.0.1',
			19953,
			instance(mock<Logger>())
		);
	});

	afterEach(async () => {
		await offersRuntime.stop();
		await remoteDeploymentService.stop();
	});

	test('remote create, delete and directly forward offer', async () => {
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

		resourcesService.remoteUpdated.push({ id: 'remote', host: '127.0.0.1', port: 19953 });
		resourcesService.offerUpdated.push({
			beneficiaryId: 'no-remote',
			name: 'test',
			offer: { a: ['b', 'c'] },
		});
		resourcesService.offerUpdated.push({
			beneficiaryId: 'remote',
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

	test('resend offers on connect', async () => {
		await remoteDeploymentService.stop();
		resourcesService.remoteUpdated.push({ id: 'remote', host: '127.0.0.1', port: 19953 });
		resourcesService.offerUpdated.push({
			beneficiaryId: 'remote',
			name: 'test',
			offer: { a: ['b', 'c'] },
		});

		remoteDeploymentService = await startDeploymentService(
			'127.0.0.1',
			19953,
			instance(mock<Logger>())
		);
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
		await receivedOffer;
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

	const testWish: Wish<unknown> = { targetId: 'remote', name: 'test', isDeployed: false };
	const testDeploymentOffer: DeploymentOffer<unknown> = { origin: 'remote', name: 'test' };
	const noCb: () => void = () => {
		// Intended to be empty
	};

	test('poll satisfied wish', async () => {
		deploymentService.offerUpdated.push({
			...testDeploymentOffer,
			offer: { fancy: ['array', 'val', 3] },
		});
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, remoteOffer) => {
					expect(remoteOffer).toStrictEqual({
						isWithdrawn: false,
						offer: { fancy: ['array', 'val', 3] },
					});
					resolve();
				},
			])
		);
	});

	test('poll unsatisfied wish', async () => {
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, remoteOffer) => {
					expect(remoteOffer).toStrictEqual({
						isWithdrawn: false,
					});
					resolve();
				},
			])
		);
	});

	test('poll withdrawn wish', async () => {
		// Create and lock offer
		resourcesService.wishPolled.push([testWish, noCb]);
		// Withdrawal
		deploymentService.offerWithdrawn.push([testDeploymentOffer, noCb]);
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, remoteOffer) => {
					expect(remoteOffer).toStrictEqual({
						isWithdrawn: true,
					});
					resolve();
				},
			])
		);
	});

	test('poll wish of released offer', async () => {
		// Create and lock offer
		resourcesService.wishPolled.push([testWish, noCb]);
		// Withdrawal
		deploymentService.offerWithdrawn.push([testDeploymentOffer, noCb]);
		// Release
		resourcesService.wishDeleted.push(testWish);
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, remoteOffer) => {
					expect(remoteOffer).toStrictEqual({
						isWithdrawn: false,
					});
					resolve();
				},
			])
		);
	});

	test('release not registered offer', async () => {
		await new Promise<void>((resolve) =>
			deploymentService.offerWithdrawn.push([testDeploymentOffer, resolve])
		);
	});

	test('release not locked offer', async () => {
		deploymentService.offerUpdated.push(testDeploymentOffer);
		await new Promise<void>((resolve) =>
			deploymentService.offerWithdrawn.push([testDeploymentOffer, resolve])
		);
	});

	test('release deployed offer', async () => {
		deploymentService.offerUpdated.push({
			...testDeploymentOffer,
			offer: 'val',
		});
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, wish) => resolve(expect(wish?.isWithdrawn).toBe(false)),
			])
		);
		const offerReleased = new Promise<void>((resolve) =>
			deploymentService.offerWithdrawn.push([testDeploymentOffer, resolve])
		);
		// Only work with correct semantics, not with delayed wish poll answer
		await new Promise<void>((resolve) =>
			resourcesService.wishPolled.push([
				testWish,
				(err, wish) => resolve(expect(wish?.isWithdrawn).toBe(true)),
			])
		);
		resourcesService.wishDeleted.push(testWish);
		await offerReleased;
	});
});
