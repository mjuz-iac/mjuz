import { Remote } from '@mjus/grpc-protos';
import { createRemote, deleteRemote, startResourcesService } from '../src';

describe('offers runtime', () => {
	test('remotes service start, create, delete and stop', () =>
		expect(
			startResourcesService('127.0.0.1', 19951).then((stop) =>
				createRemote(new Remote())
					.then(() => deleteRemote(new Remote()))
					.then(() => stop())
			)
		).resolves.toBe(undefined));
});
