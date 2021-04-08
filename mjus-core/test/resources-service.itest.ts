import {
	updateRemote,
	deleteOffer,
	deleteRemote,
	getWish,
	Offer,
	refreshRemote,
	Remote,
	RemoteOffer,
	ResourcesService,
	startResourcesService,
	updateOffer,
	Wish,
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

	const testRpc = async <T, R>(
		requestFn: (v: T) => void,
		requestArb: Arbitrary<T>,
		stream: Stream<
			T | [T, (err: Error | null) => void] | [T, (err: Error | null, res: R | null) => void]
		>,
		responseArb?: Arbitrary<R>
	) => {
		const pred = async (request: T, response?: R) => {
			const asyncReceive = firstEvent(stream);
			const asyncResponse = requestFn(request);
			const received = await asyncReceive;
			let receivedVal, receivedCb;
			if (Array.isArray(received)) {
				[receivedVal, receivedCb] = received;
				receivedCb(null, response);
			} else receivedVal = received;
			expect(receivedVal).toEqual(request);
			expect(await asyncResponse).toStrictEqual(response);
		};
		await fc.assert(
			fc.asyncProperty(requestArb, responseArb ? responseArb : fc.constant(undefined), pred)
		);
	};

	const remoteArb: Arbitrary<Remote> = fc.record({
		id: fc.string(),
		host: fc.string(),
		port: fc.nat(),
	});
	test('update remote', () => testRpc(updateRemote, remoteArb, resourcesService.remoteUpdated));
	test('refresh remote', () =>
		testRpc(refreshRemote, remoteArb, resourcesService.remoteRefreshed));
	test('delete remote', () => testRpc(deleteRemote, remoteArb, resourcesService.remoteDeleted));

	const offerArb: Arbitrary<Offer<unknown>> = fc.record({
		beneficiaryId: fc.string(),
		name: fc.string(),
		offer: fc.option(fc.jsonObject(), { nil: undefined }),
	});
	test('update offer', () => testRpc(updateOffer, offerArb, resourcesService.offerUpdated));
	test('refresh offer', () => testRpc(refreshOffer, offerArb, resourcesService.offerRefreshed));
	test('delete offer', () => testRpc(deleteOffer, offerArb, resourcesService.offerWithdrawn));

	const wishArb: Arbitrary<Wish<unknown>> = fc.record({
		targetId: fc.string(),
		name: fc.string(),
	});
	const remoteOfferArb: Arbitrary<RemoteOffer<unknown>> = fc
		.record({
			isWithdrawn: fc.boolean(),
			offer: fc.option(fc.jsonObject(), { nil: undefined }),
		})
		.filter(({ isWithdrawn, offer }) => offer === undefined || !isWithdrawn);
	test('get wish', () => testRpc(getWish, wishArb, resourcesService.wishPolled, remoteOfferArb));
	test('wish deleted', () => testRpc(wishDeleted, wishArb, resourcesService.wishDeleted));
});
