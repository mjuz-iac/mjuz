import { createRemote, deleteRemote, startRemotesService } from '../src';
import { Remote } from '../src/protos/remotes_pb';

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
