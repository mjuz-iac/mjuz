import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import {
	updateRemote,
	deleteOffer,
	deleteRemote,
	getWish,
	refreshRemote,
	Remote,
	ResourcesService,
	startResourcesService,
	updateOffer,
	wishDeleted,
} from '../src';
import { Stream } from '@funkia/hareactive';
import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';

describe('resources service', () => {
	let resourcesService: ResourcesService;
	beforeEach(async () => {
		resourcesService = await startResourcesService('127.0.0.1', 19951);
	});
	afterEach(async () => {
		await resourcesService.stop();
	});

	test('start and stop', () => {
		// Intended to be empty
	});

	const firstEvent = <R>(stream: Stream<R>) =>
		new Promise((resolve) => stream.subscribe((firstEvent) => resolve(firstEvent)));

	const testRpc = async <T>(fn: (v: T) => void, arb: Arbitrary<T>, stream: Stream<T>) => {
		const pred = async (val: T) => {
			const received = firstEvent(stream);
			await fn(val);
			expect(await received).toEqual(val);
		};
		await fc.assert(fc.asyncProperty(arb, pred));
	};

	const remoteArb: fc.Arbitrary<Remote> = fc.record({
		id: fc.string(),
		host: fc.string(),
		port: fc.nat(),
	});
	test('update remote', () => testRpc(updateRemote, remoteArb, resourcesService.remoteUpdated));
	test('refresh remote', () =>
		testRpc(refreshRemote, remoteArb, resourcesService.remoteRefreshed));
	test('delete remote', () => testRpc(deleteRemote, remoteArb, resourcesService.remoteDeleted));

	test('update offer', async () => {
		const offer = new rpc.Offer();
		const received = new Promise((resolve) =>
			resourcesService.offerUpdated.subscribe((receivedOffer) =>
				resolve(expect(receivedOffer).toEqual(offer.toObject()))
			)
		);
		await expect(updateOffer(offer)).resolves.toEqual(new Empty());
		await received;
	});

	test('delete offer', async () => {
		const offer = new rpc.Offer();
		const received = new Promise((resolve) =>
			resourcesService.offerWithdrawn.subscribe((t) => {
				const [receivedOffer, cb] = t;
				resolve(expect(receivedOffer).toEqual(offer.toObject()));
				cb(null);
			})
		);
		await expect(deleteOffer(offer)).resolves.toEqual(new Empty());
		await received;
	});

	test('get wish', async () => {
		const wish = new rpc.Wish();
		const received = new Promise((resolve) =>
			resourcesService.wishPolled.subscribe((t) => {
				const [receivedWish, cb] = t;
				resolve(expect(receivedWish).toEqual(wish.toObject()));
				cb(null, wish);
			})
		);
		await expect(getWish(wish).then((w) => w.toObject())).resolves.toEqual(wish.toObject());
		await received;
	});

	test('delete wish', async () => {
		const wish = new rpc.Wish();
		const received = new Promise((resolve) =>
			resourcesService.wishDeleted.subscribe((receivedWish) =>
				resolve(expect(receivedWish).toEqual(wish.toObject()))
			)
		);
		await expect(wishDeleted(wish)).resolves.toEqual(new Empty());
		await received;
	});
});
