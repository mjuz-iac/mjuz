import {
	Behavior,
	changes,
	Future,
	nextOccurrenceFrom,
	stepTo,
	Stream,
} from '@funkia/hareactive';

export type NextAction = 'deploy' | 'terminate' | 'destroy';
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
): Behavior<Behavior<Future<NextAction>>> => {
	const nextAction = (nextDeploy: Future<any>): Behavior<NextAction | 'unknown'> =>
		stepTo('unknown', nextDeploy.mapTo<NextAction>('deploy'))
			.flatMap((nextAction) =>
				stepTo(nextAction, terminateTrigger.mapTo<NextAction>('terminate'))
			)
			.flatMap((nextAction) =>
				stepTo(nextAction, destroyTrigger.mapTo<NextAction>('destroy'))
			);

	return nextOccurrenceFrom(stateChanges).map((nextDeploy) => {
		const na = nextAction(nextDeploy);
		return na.flatMap((maybeAction) =>
			maybeAction !== 'unknown'
				? Behavior.of(Future.of(<NextAction>maybeAction))
				: nextOccurrenceFrom(
						<Stream<NextAction>>changes(na).filter((action) => action !== 'unknown')
				  )
		);
	});
};
