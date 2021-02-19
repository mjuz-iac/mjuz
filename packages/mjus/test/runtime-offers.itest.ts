import { Remote } from '@mjus/grpc-protos';
import { createRemote, deleteRemote, startRemotesService } from '../src';

describe('offers runtime', () => {
	test('remotes service start, create, delete and stop', () =>
		expect(
			startRemotesService().then((stop) =>
				createRemote(new Remote())
					.then(() => deleteRemote(new Remote()))
					.then(() => stop())
			)
		).resolves.toBe(undefined));
});
