import { Behavior, fromFunction, Future } from '@funkia/hareactive';
import { IO } from '@funkia/io';
import { Logger } from 'pino';
import { deepEqual, instance, mock, when } from 'ts-mockito';
import { Action, runDeployment } from '../src';

describe('runtime', () => {
	const operations = (action: Action) => (s: string) => {
		return IO.of(s + action.slice(0, 3));
	};
	let remainingActions: Action[];

	test('run deployment', () => {
		const nextAction = Behavior.of(
			fromFunction(() => {
				const action = remainingActions[0];
				remainingActions = remainingActions.slice(1);
				return Future.of(action);
			})
		);
		remainingActions = ['deploy', 'deploy', 'terminate', 'deploy'];

		const loggerMock = mock<Logger>();
		['resources service', 'deployment service', 'offers runtime', 'reaction loop'].forEach(
			(name) =>
				when(loggerMock.child(deepEqual({ c: name }))).thenReturn(instance(loggerMock))
		);

		return expect(
			runDeployment(IO.of('I'), operations, () => nextAction, {
				logger: instance(loggerMock),
				disableExit: true,
			})
		).resolves.toBe('Idepdepdepter');
	});
});
