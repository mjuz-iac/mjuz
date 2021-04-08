import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import {
	updateRemote,
	deleteOffer,
	deleteRemote,
	getWish,
	Offer,
	refreshRemote,
	Remote,
	ResourcesService,
	startResourcesService,
	updateOffer,
	wishDeleted,
	refreshOffer,
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

	const testRpc = async <T>(
		sendFn: (v: T) => void,
		arb: Arbitrary<T>,
		stream: Stream<T | [T, (err: Error | null) => void]>
	) => {
		const pred = async (val: T) => {
			const asyncReceive = firstEvent(stream);
			const asyncResponse = sendFn(val);
			const received = await asyncReceive;
			let receivedVal, receivedCb;
			if (Array.isArray(received)) {
				[receivedVal, receivedCb] = received;
				receivedCb(null);
			} else receivedVal = received;
			expect(receivedVal).toEqual(val);
			await asyncResponse;
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

	const offerArb: fc.Arbitrary<Offer<unknown>> = fc.record({
		beneficiaryId: fc.string(),
		name: fc.string(),
		offer: fc.option(fc.jsonObject(), { nil: undefined }),
	});
	test('update offer', () => testRpc(updateOffer, offerArb, resourcesService.offerUpdated));
	test('refresh offer', () => testRpc(refreshOffer, offerArb, resourcesService.offerRefreshed));
	test('delete offer', () => testRpc(deleteOffer, offerArb, resourcesService.offerWithdrawn));

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
