import { Action, reactionLoop, nextAction } from '../src';
import { fromFunction, Future, getTime, never, Stream, tick } from '@funkia/hareactive';
import { IO, runIO } from '@funkia/io';
import { assertFutureEqual, testAt, testFuture } from '@funkia/hareactive/testing';
import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import {
	futureArb,
	FutureArbConstraints,
	streamArb,
	StreamArbConstraints,
} from './hareactive-arbitraries';

describe('reaction runtime', () => {
	describe('next action', () => {
		type Arbs = [number, number, Stream<unknown>, Future<unknown>, Future<unknown>];
		const arbs = (
			constraints: (
				t1: number,
				t2: number
			) => [StreamArbConstraints, FutureArbConstraints, FutureArbConstraints]
		): Arbitrary<Arbs> =>
			fc.tuple(fc.integer(), fc.nat()).chain(([t1, deltaT2]) => {
				const t2 = t1 + deltaT2 + 0.1;
				const [
					changesConstraints,
					terminateTriggerConstraints,
					destroyTriggerConstraints,
				] = constraints(t1, t2);
				return fc.tuple(
					fc.constant(t1), // t1
					fc.constant(t2), // t2
					streamArb(fc.anything(), changesConstraints), // changes
					futureArb(fc.anything(), terminateTriggerConstraints), // terminate trigger
					futureArb(fc.anything(), destroyTriggerConstraints) // destroy trigger
				);
			});

		test('no next action, if at most state changes before/at 1st moment', () => {
			const as = arbs((t1) => [{ maxTime: t1 }, {}, {}]);
			const pred = ([t1, t2, changes]: Arbs) => {
				const na = nextAction(changes, never, never);
				assertFutureEqual(testAt(t2, testAt(t1, na)), never);
			};
			fc.assert(fc.property(as, pred));
		});

		test('deploy if change between 1st and 2nd moment and no terminate/destroy at/before t2', () => {
			const as = arbs((t1, t2) => [
				{ minTime: t1 + 0.1, maxTime: t2, minEvents: 1 },
				{ minTime: t2 + 0.1 },
				{ minTime: t2 + 0.1 },
			]);
			const pred = ([t1, t2, changes, terminate, destroy]: Arbs) => {
				const na = nextAction(changes, terminate, destroy);
				assertFutureEqual(testAt(t2, testAt(t1, na)), Future.of('deploy'));
			};
			fc.assert(fc.property(as, pred));
		});

		test('terminate if terminate trigger before/at t2 and no destroy before/at t2', () => {
			const as = arbs((_, t2) => [{}, { maxTime: t2, freq: false }, { minTime: t2 + 0.1 }]);
			const pred = ([t1, t2, changes, terminate, destroy]: Arbs) => {
				const na = nextAction(changes, terminate, destroy);
				assertFutureEqual(testAt(t2, testAt(t1, na)), Future.of('terminate'));
			};
			fc.assert(fc.property(as, pred));
		});

		test('destroy if destroy trigger before/at t2', () => {
			const as = arbs((_, t2) => [{}, {}, { maxTime: t2, freq: false }]);
			const pred = ([t1, t2, changes, terminate, destroy]: Arbs) => {
				const na = nextAction(changes, terminate, destroy);
				assertFutureEqual(testAt(t2, testAt(t1, na)), Future.of('destroy'));
			};
			fc.assert(fc.property(as, pred));
		});

		test('first trigger after t2 wins', () => {
			const as = arbs((_, t2) => [
				{ minTime: t2 + 0.1 },
				{ minTime: t2 + 0.1, freq: false },
				{ minTime: t2 + 0.1, freq: false },
			]);
			const pred = ([t1, t2, changes, terminate, destroy]: Arbs) => {
				const na = nextAction(changes, terminate, destroy);
				const triggersChrono = ([
					[destroy.model().time, 'destroy'],
					[terminate.model().time, 'terminate'],
					...Object.values(changes.model()).map((e) => [Number(e.time), 'deploy']),
				] as [number, Action][]).sort((a, b) => a[0] - b[0]);
				assertFutureEqual(testAt(t2, testAt(t1, na)), testFuture(...triggersChrono[0]));
			};
			fc.assert(fc.property(as, pred));
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
			const l = reactionLoop(() => IO.of('I'), operations, nextAction)[0];
			return expect(runIO(l)).resolves.toBe('Idepdes');
		});

		test('direct terminate', () => {
			remainingActions = ['terminate'];
			const l = reactionLoop(() => IO.of('I'), operations, nextAction)[0];
			return expect(runIO(l)).resolves.toBe('Idepter');
		});

		test('deploy and terminate', () => {
			remainingActions = ['deploy', 'deploy', 'terminate', 'deploy'];
			const l = reactionLoop(() => IO.of('I'), operations, nextAction)[0];
			return expect(runIO(l)).resolves.toBe('Idepdepdepter');
		});

		test('deploy and destroy', () => {
			remainingActions = ['deploy', 'deploy', 'destroy', 'deploy'];
			const l = reactionLoop(() => IO.of('I'), operations, nextAction)[0];
			return expect(runIO(l)).resolves.toBe('Idepdepdepdes');
		});
	});
});
