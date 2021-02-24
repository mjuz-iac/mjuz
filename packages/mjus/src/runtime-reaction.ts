import {
	Behavior,
	fromFunction,
	Future,
	nextOccurrenceFrom,
	runNow,
	sample,
	sinkFuture,
	Stream,
	tick,
	toPromise,
} from '@funkia/hareactive';
import { call, callP, IO } from '@funkia/io';
import { newLogger } from './logging';

type FinalAction = 'terminate' | 'destroy';
const isFinalAction = (v: string): v is FinalAction => {
	return ['terminate', 'destroy'].indexOf(v) >= 0;
};
export type Action = 'deploy' | FinalAction;

/**
 * Starts sensing for next action after first moment, but resolves the action future not before the second moment. If
 * the next action was sensed before the second moment, the action future is directly resolved with it at the second
 * moment.
 * @param stateChanges When fired at least once, deploy action shall be performed.
 * @param terminateTrigger When triggered, deployment shall be terminated. Supersedes deploy actions.
 * @param destroyTrigger When triggered, deployment shall be destroyed. Supersedes deploy and terminate actions.
 */
export const nextAction = <T, U, V>(
	stateChanges: Stream<T>,
	terminateTrigger: Future<U>,
	destroyTrigger: Future<V>
): Behavior<Behavior<Future<Action>>> =>
	nextOccurrenceFrom(stateChanges).map((nextDeploy) => {
		nextDeploy.activate(tick()); // Required to ensure occurrences are buffered before inner behavior is sampled
		return fromFunction(() =>
			destroyTrigger
				.mapTo<Action>('destroy')
				.combine(terminateTrigger.mapTo('terminate'))
				.combine(nextDeploy.mapTo('deploy'))
		);
	});

/**
 * Reactive main loop.
 * @param initOperation Returns state initialization operation.
 * @param operations Maps each action to a function the current state to the action's operation.
 * @param nextAction Evaluates subsequent actions. First moment is sampled when current action is started, second moment
 * is sampled when current action completed. Future is expected to resolve after the second moment.
 * @return IO operations and future that resolves after the first stack deployment succeeded.
 */
export const reactionLoop = <S>(
	initOperation: () => IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: Behavior<Behavior<Future<Action>>>
): [IO<S>, Future<void>] => {
	const logger = newLogger('reaction loop');
	const initialized = sinkFuture<void>();

	const recurse = (
		bufferingNextAction: Behavior<Future<Action>>,
		state: S,
		initialRun = false
	): IO<S> =>
		call(() => logger.info(`Waiting for next action`))
			.flatMap(() => callP(() => toPromise(runNow(sample(bufferingNextAction)))))
			.flatMap((action) => {
				// Start buffering next action
				const bufferingNextAction = runNow(sample(nextAction));
				logger.info(`Running action ${action}`);
				return operations(action)(state).flatMap((newState) => {
					logger.info(`Completed action ${action}`);
					if (initialRun) initialized.resolve();
					return isFinalAction(action)
						? IO.of(newState)
						: recurse(bufferingNextAction, newState);
				});
			});

	return [
		call(() => logger.info('Initializing stack'))
			.flatMap(initOperation)
			.flatMap((state) => {
				logger.info('Completed initializing state, triggering deploy');
				return recurse(Behavior.of(Future.of('deploy')), state, true);
			}),
		initialized,
	];
};
