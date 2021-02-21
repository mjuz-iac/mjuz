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

	test('create remote', () =>
		expect(createRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('delete remote', () =>
		expect(deleteRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('update offer', () => expect(updateOffer(new rpc.Offer())).resolves.toEqual(new Empty()));

	test('delete offer', async () => {
		resourcesService.offerWithdrawn.subscribe((p) => p[1](null));
		await expect(deleteOffer(new rpc.Offer())).resolves.toEqual(new Empty());
	});

	test('get wish', async () => {
		resourcesService.wishPolled.subscribe((p) => p[1](null, p[0]));
		await expect(getWish(new rpc.Wish())).resolves.toEqual(new Empty());
	});

	test('get delete wish', () =>
		expect(wishDeleted(new rpc.Wish())).resolves.toEqual(new Empty()));
});
