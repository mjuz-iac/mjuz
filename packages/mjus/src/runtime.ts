import {
	Behavior,
	changes,
	Future,
	nextOccurrenceFrom,
	runNow,
	sample,
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
): Behavior<Behavior<Future<Action>>> => {
	const nextAction = (nextDeploy: Future<T>): Behavior<Action | 'unknown'> =>
		stepTo('unknown', nextDeploy.mapTo<Action>('deploy'))
			.flatMap((nextAction) =>
				stepTo(nextAction, terminateTrigger.mapTo<Action>('terminate'))
			)
			.flatMap((nextAction) => stepTo(nextAction, destroyTrigger.mapTo<Action>('destroy')));

	return nextOccurrenceFrom(stateChanges).map((nextDeploy) => {
		const na = nextAction(nextDeploy);
		return na.flatMap((maybeAction) =>
			maybeAction !== 'unknown'
				? Behavior.of(Future.of(<Action>maybeAction))
				: nextOccurrenceFrom(
						<Stream<Action>>changes(na).filter((action) => action !== 'unknown')
				  )
		);
	});
};

/**
 * Reactive main loop.
 * @param initOperation Returns state initialization operation.
 * @param operations Maps each action to a function the current state to the action's operation.
 * @param nextAction Evaluates subsequent actions. First moment is sampled when current action is started, second moment
 * is sampled when current action completed. Future is expected to resolve after the second moment.
 */
export const loop = <S>(
	initOperation: () => IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: Behavior<Behavior<Future<Action>>>
): Behavior<IO<S>> => {
	const logger = newLogger('loop');

	const recurse = (bufferingNextAction: Behavior<Future<Action>>, state: S): IO<S> =>
		call(() => logger.info(`Waiting for next action`))
			.flatMap(() => callP(() => toPromise(runNow(sample(bufferingNextAction)))))
			.flatMap((action) => {
				// Start buffering next action
				const bufferingNextAction = runNow(sample(nextAction));
				logger.info(`Running action ${action}`);
				return operations(action)(state).flatMap((newState) => {
					logger.info(`Completed action ${action}`);
					return isFinalAction(action)
						? IO.of(newState)
						: recurse(bufferingNextAction, newState);
				});
			});

	return nextAction.map((buffering2ndAction: Behavior<Future<Action>>) =>
		call(() => logger.info('Initializing stack'))
			.flatMap(initOperation)
			.flatMap((state) => {
				logger.info('Completed initializing state');
				return recurse(buffering2ndAction, state);
			})
	);
};
