import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import {
	createRemote,
	deleteOffer,
	deleteRemote,
	getWish,
	startResourcesService,
	updateOffer,
	wishDeleted,
} from '../src';

describe('resources service', () => {
	let stopService: () => Promise<void>;
	beforeEach(() => {
		return startResourcesService('127.0.0.1', 19951).then((resourceService) => {
			stopService = resourceService.stopService;
			return Promise.resolve();
		});
	});
	afterEach(() => {
		return stopService();
	});

	test('start and stop', () => {
		// Intended to be empty
	});

	test('create remote', () =>
		expect(createRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('delete remote', () =>
		expect(deleteRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('update offer', () => expect(updateOffer(new rpc.Offer())).resolves.toEqual(new Empty()));

	// test('delete offer', () => expect(updateOffer(new rpc.Offer())).resolves.toEqual(new Empty()));

	// test('get wish', () => expect(getWish(new rpc.Wish())).resolves.toEqual(new Empty()));

	test('get delete wish', () =>
		expect(wishDeleted(new rpc.Wish())).resolves.toEqual(new Empty()));
});
