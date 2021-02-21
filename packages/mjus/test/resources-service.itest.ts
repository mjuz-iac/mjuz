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
	beforeEach(() => {
		return startResourcesService('127.0.0.1', 19951).then((service) => {
			resourcesService = service;
			return Promise.resolve();
		});
	});
	afterEach(() => {
		return resourcesService.stop();
	});

	test('start and stop', () => {
		// Intended to be empty
	});

	test('create remote', () =>
		expect(createRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('delete remote', () =>
		expect(deleteRemote(new rpc.Remote())).resolves.toEqual(new Empty()));

	test('update offer', () => expect(updateOffer(new rpc.Offer())).resolves.toEqual(new Empty()));

	test('delete offer', () => {
		resourcesService.offerWithdrawn.subscribe((p) => p[1](null));
		return expect(deleteOffer(new rpc.Offer())).resolves.toEqual(new Empty());
	});

	test('get wish', () => {
		resourcesService.wishPolled.subscribe((p) => p[1](null, p[0]));
		return expect(getWish(new rpc.Wish())).resolves.toEqual(new Empty());
	});

	test('get delete wish', () =>
		expect(wishDeleted(new rpc.Wish())).resolves.toEqual(new Empty()));
});
