import { nextAction } from '../src/runtime';
import { empty, Future, sample, sinkFuture, sinkStream, toPromise } from '@funkia/hareactive';

describe('runtime', () => {
	describe('next action', () => {
		/**
		 * Tests not using the nice functional testing features of Hareactive due to bugs in their library...
		 */

		test('deploy before 2nd moment', () => {
			const stateChanges = sinkStream();
			const na = nextAction(stateChanges, sinkFuture(), sinkFuture());

			const na1 = sample(na).run(2);
			stateChanges.pushS(3, true);
			const naP = toPromise(sample(na1).run(4));
			return expect(naP).resolves.toBe('deploy');
		});

		test('deploy after 2nd moment', () => {
			const stateChanges = sinkStream();
			const na = nextAction(stateChanges, sinkFuture(), sinkFuture());

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			stateChanges.pushS(5, true);
			return expect(naP).resolves.toBe('deploy');
		});

		test('terminate', () => {
			const na = nextAction(empty, Future.of(true), sinkFuture());

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			return expect(naP).resolves.toBe('terminate');
		});

		test('destroy', () => {
			const na = nextAction(empty, sinkFuture(), Future.of(true));

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			return expect(naP).resolves.toBe('destroy');
		});

		test('terminate supersedes deploy', () => {
			const stateChanges = sinkStream();
			const na = nextAction(stateChanges, Future.of(true), sinkFuture());

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			stateChanges.pushS(5, true);
			return expect(naP).resolves.toBe('terminate');
		});

		test('destroy supersedes deploy', () => {
			const stateChanges = sinkStream();
			const na = nextAction(stateChanges, sinkFuture(), Future.of(true));

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			stateChanges.pushS(5, true);
			return expect(naP).resolves.toBe('destroy');
		});

		test('destroy supersedes terminate', () => {
			const na = nextAction(empty, Future.of(true), Future.of(true));

			const naP = toPromise(sample(sample(na).run(2)).run(4));
			return expect(naP).resolves.toBe('destroy');
		});
	});
});
