import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import {
	createRemote,
	deleteOffer,
	deleteRemote,
	getWish,
	ResourcesService,
	startResourcesService,
	updateOffer,
	wishDeleted,
} from '../src';

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

	test('create remote', async () => {
		const remote = new rpc.Remote();
		const received = new Promise((resolve) =>
			resourcesService.remoteCreated.subscribe((receivedRemote) =>
				resolve(expect(receivedRemote).toEqual(remote.toObject()))
			)
		);
		await expect(createRemote(remote)).resolves.toEqual(new Empty());
		await received;
	});

	test('delete remote', async () => {
		const remote = new rpc.Remote();
		const received = new Promise((resolve) =>
			resourcesService.remoteDeleted.subscribe((receivedRemote) =>
				resolve(expect(receivedRemote).toEqual(remote.toObject()))
			)
		);
		await expect(deleteRemote(remote)).resolves.toEqual(new Empty());
		await received;
	});

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
