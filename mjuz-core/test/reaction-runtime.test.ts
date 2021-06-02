import { Action, reactionLoop, nextAction } from '../src';
import {
	Behavior,
	fromFunction,
	Future,
	getTime,
	performStream,
	runNow,
	never,
	sample,
	stepper,
	Stream,
	toPromise,
} from '@funkia/hareactive';
import { IO } from '@funkia/io';
import { assertFutureEqual, testAt, testFuture } from '@funkia/hareactive/testing';
import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { Logger } from 'pino';
import { instance, mock } from 'ts-mockito';
import {
	futureArb,
	FutureArbConstraints,
	streamArb,
	StreamArbConstraints,
} from './hareactive.arbs';

describe('reaction runtime', () => {
	describe('next action', () => {
		type Arbs = [number, number, Stream<unknown>, Future<unknown>, Future<unknown>];
		const arbs = (
			constraints: (
				t1: number,
				t2: number
			) => [StreamArbConstraints<unknown>, FutureArbConstraints, FutureArbConstraints]
		): Arbitrary<Arbs> =>
			fc.tuple(fc.integer(), fc.nat()).chain(([t1, deltaT2]) => {
				const t2 = t1 + deltaT2 + 0.1;
				const [changesConstraints, terminateTriggerConstraints, destroyTriggerConstraints] =
					constraints(t1, t2);
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
				const triggersChrono = (
					[
						[destroy.model().time, 'destroy'],
						[terminate.model().time, 'terminate'],
						...Object.values(changes.model()).map((e) => [Number(e.time), 'deploy']),
					] as [number, Action][]
				).sort((a, b) => a[0] - b[0]);
				assertFutureEqual(testAt(t2, testAt(t1, na)), testFuture(...triggersChrono[0]));
			};
			fc.assert(fc.property(as, pred));
		});
	});

	describe('reaction loop', () => {
		test('init, deploy n times and complete after first destroy or terminate', () => {
			const deployActionArb = fc.constant<Action>('deploy');
			const finalActionArb = fc.oneof(
				fc.constant<Action>('terminate'),
				fc.constant<Action>('destroy')
			);

			const pred = async (nextActions: Action[]) => {
				const actions = [
					'deploy', // On init 'deploy' is executed once
					...nextActions.slice(0, nextActions.findIndex((a) => a !== 'deploy') + 1),
				];
				let lastOpTime = -Infinity;
				const expectedOperations = actions.slice().reverse();
				const operations = (action: Action) => (s: string) => {
					lastOpTime = getTime();
					expect(action).toBe(expectedOperations.pop());
					return IO.of(s + action);
				};

				const expectedNextActions = nextActions.slice().reverse();
				const nextAction: Behavior<Behavior<Future<Action>>> = fromFunction((t1) =>
					fromFunction((t2) => {
						expect(t1).toEqual(lastOpTime);
						expect(t2).toBeGreaterThan(t1);
						const action = expectedNextActions.pop();
						if (!action) throw new Error('Unexpected invocation of nextAction');
						else return Future.of(action);
					})
				);
				const logger = instance(mock<Logger>());
				const [ops, completed] = reactionLoop(IO.of('I'), operations, nextAction, logger);

				const exec = runNow(performStream(ops).flatMap((s) => stepper(never, s)));
				await toPromise(completed);
				const finalState = await toPromise(runNow(sample(exec)));
				expect(finalState).toBe(`I${actions.join('')}`);
			};

			return fc.assert(
				fc.asyncProperty(
					fc.array(
						fc.frequency(
							{ arbitrary: deployActionArb, weight: 10 },
							{ arbitrary: finalActionArb, weight: 1 }
						),
						{ maxLength: 100 }
					),
					finalActionArb,
					async (actions, lastAction) => pred([...actions, lastAction])
				)
			);
		});
	});
});
