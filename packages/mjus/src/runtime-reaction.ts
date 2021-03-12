import {
	Behavior,
	Future,
	nextOccurrenceFrom,
	runNow,
	sample,
	sinkFuture,
	stepTo,
	Stream,
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
 * the next action was sensed before the second moment, the action future is directly resolved at the second moment.
 * Otherwise it is resolved on the first triggered action after the second moment.
 * @param stateChanges When fired at least once, deploy action shall be performed.
 * @param terminateTrigger When triggered, deployment shall be terminated. Supersedes deploy actions.
 * @param destroyTrigger When triggered, deployment shall be destroyed. Supersedes deploy and terminate actions.
 */
export const nextAction = <T, U, V>(
	stateChanges: Stream<T>,
	terminateTrigger: Future<U>,
	destroyTrigger: Future<V>
): Behavior<Behavior<Future<Action>>> =>
	nextOccurrenceFrom(stateChanges).map((stateChange) => {
		const deploy = stateChange.mapTo('deploy' as Action);
		const terminate = terminateTrigger.mapTo('terminate' as Action);
		const destroy = destroyTrigger.mapTo('destroy' as Action);

		return stepTo('noop', deploy)
			.flatMap((action) => stepTo(action, terminate))
			.flatMap((action) => stepTo(action, destroy))
			.map((action) =>
				action !== 'noop' ? Future.of(action) : destroy.combine(terminate).combine(deploy)
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
