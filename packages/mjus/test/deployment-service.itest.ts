import { startDeploymentService } from '../src';

describe('deployment service', () => {
	let stopService: () => Promise<void>;
	beforeEach(() => {
		return startDeploymentService('127.0.0.1', 19952).then((stop) => {
			stopService = stop;
			return Promise.resolve();
		});
	});
	afterEach(() => {
		return stopService();
	});

	test('start and stop', () => {
		// Intended to be empty
	});
});
