import { Action, loop, nextAction } from '../src';
import { fromFunction, Future, getTime, never, tick } from '@funkia/hareactive';
import { IO, runIO } from '@funkia/io';
import {
	assertFutureEqual,
	testAt,
	testFuture,
	testStreamFromObject,
} from '@funkia/hareactive/testing';

describe('runtime', () => {
	describe('next action', () => {
		const farFuture = testFuture(10, true);
		const farStream = testStreamFromObject({ 10: true });

		test('deploy before 1st moment', () => {
			const na = nextAction(testStreamFromObject({ 1: true }), farFuture, farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), never);
		});
		test('deploy before 2nd moment', () => {
			const na = nextAction(testStreamFromObject({ 3: true }), farFuture, farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'deploy'));
		});
		test('deploy after 2nd moment', () => {
			const na = nextAction(testStreamFromObject({ 5: true }), farFuture, farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(5, 'deploy'));
		});

		test('terminate before 1st moment', () => {
			const na = nextAction(farStream, testFuture(1, true), farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(1, 'terminate'));
		});
		test('terminate before 2nd moment', () => {
			const na = nextAction(farStream, testFuture(3, true), farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'terminate'));
		});
		test('terminate after 2nd moment', () => {
			const na = nextAction(farStream, testFuture(5, true), farFuture);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(5, 'terminate'));
		});

		test('destroy before 1st moment', () => {
			const na = nextAction(farStream, farFuture, testFuture(1, true));
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(1, 'destroy'));
		});
		test('destroy before 2nd moment', () => {
			const na = nextAction(farStream, farFuture, testFuture(3, true));
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'destroy'));
		});
		test('destroy after 2nd moment', () => {
			const na = nextAction(farStream, farFuture, testFuture(5, true));
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(5, 'destroy'));
		});

		test('terminate supersedes deploy', () => {
			const na = nextAction(
				testStreamFromObject({ 3: true }),
				testFuture(3, true),
				farFuture
			);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'terminate'));
		});
		test('terminate does not supersede deploy', () => {
			const na = nextAction(
				testStreamFromObject({ 3: true }),
				testFuture(4, true),
				farFuture
			);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'deploy'));
		});

		test('destroy supersedes deploy', () => {
			const na = nextAction(
				testStreamFromObject({ 3: true }),
				farFuture,
				testFuture(3, true)
			);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'destroy'));
		});
		test('destroy does not supersede deploy', () => {
			const na = nextAction(
				testStreamFromObject({ 3: true }),
				farFuture,
				testFuture(4, true)
			);
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'deploy'));
		});

		test('destroy supersedes terminate', () => {
			const na = nextAction(farStream, testFuture(3, true), testFuture(3, true));
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'destroy'));
		});
		test('destroy does not supersede terminate', () => {
			const na = nextAction(farStream, testFuture(3, true), testFuture(4, true));
			assertFutureEqual(testAt(4, testAt(2, na)), testFuture(3, 'terminate'));
		});
	});

	describe('loop', () => {
		let operationTime = 0;

		const operations = (action: Action) => (s: string) => {
			tick();
			operationTime = getTime();
			return IO.of(s + action.slice(0, 3));
		};
		let remainingActions: Action[] = [];
		const nextAction = fromFunction((t1) =>
			fromFunction((t2) => {
				expect(t1).toBeLessThan(operationTime);
				expect(t2).toBeGreaterThan(operationTime);
				const action = remainingActions[0];
				remainingActions = remainingActions.slice(1);
				return Future.of(action);
			})
		);

		test('direct destroy', () => {
			remainingActions = ['destroy'];
			const l = loop(() => IO.of('I'), operations, nextAction);
			return expect(runIO(l)).resolves.toBe('Idepdes');
		});

		test('direct terminate', () => {
			remainingActions = ['terminate'];
			const l = loop(() => IO.of('I'), operations, nextAction);
			return expect(runIO(l)).resolves.toBe('Idepter');
		});

		test('deploy and terminate', () => {
			remainingActions = ['deploy', 'deploy', 'terminate', 'deploy'];
			const l = loop(() => IO.of('I'), operations, nextAction);
			return expect(runIO(l)).resolves.toBe('Idepdepdepter');
		});

		test('deploy and destroy', () => {
			remainingActions = ['deploy', 'deploy', 'destroy', 'deploy'];
			const l = loop(() => IO.of('I'), operations, nextAction);
			return expect(runIO(l)).resolves.toBe('Idepdepdepdes');
		});
	});
});
