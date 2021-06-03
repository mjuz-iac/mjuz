import {
	Behavior,
	Future,
	nextOccurrenceFrom,
	producerStream,
	runNow,
	sample,
	sinkFuture,
	stepTo,
	Stream,
	toPromise,
} from '@funkia/hareactive';
import { call, callP, IO } from '@funkia/io';
import { Logger } from 'pino';

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
 * @param initOperation State initialization operation.
 * @param operations Maps each action to a function of the current state to the action's operation.
 * @param nextAction Evaluates subsequent actions. First moment is sampled when current action is started, second moment
 * is sampled when current action completed. Future is expected to resolve after the second moment.
 * @param logger
 * @return Stream of the IO operations and future that resolves with the final state after the final operation.
 */
export const reactionLoop = <S>(
	initOperation: IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: Behavior<Behavior<Future<Action>>>,
	logger: Logger
): [Stream<IO<S>>, Future<S>] => {
	const completed = sinkFuture<S>();
	const actions = producerStream<IO<S>>((push) => {
		const recurse = (bufferingNextAction: Behavior<Future<Action>>, state: S): IO<S> =>
			callP(() => toPromise(runNow(sample(bufferingNextAction)))).flatMap((action) =>
				call(() => runNow(sample(nextAction))).flatMap((bufferingNextAction) =>
					call(() => logger.info(`Starting ${action}`))
						.flatMap(() => operations(action)(state))
						.flatMap((newState) =>
							call(() => {
								logger.info(`Completed ${action}`);
								if (isFinalAction(action)) {
									actions.deactivate(true);
									completed.resolve(newState);
								} else {
									logger.info(`Waiting for next action`);
									push(recurse(bufferingNextAction, newState));
								}
								return newState;
							})
						)
				)
			);

		const init = call(() => logger.info('Initializing'))
			.flatMap(() => initOperation)
			.flatMap((state) => {
				logger.info('Completed initializing');
				return recurse(Behavior.of(Future.of('deploy')), state);
			});

		push(init);
		return () => {
			// Intended to be empty
		};
	});
	return [actions, completed];
};
