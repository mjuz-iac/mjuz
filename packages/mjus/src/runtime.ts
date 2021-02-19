import { IO, runIO } from '@funkia/io';
import { Behavior, Future } from '@funkia/hareactive';
import { Action, newLogger, reactionLoop, startResourcesService } from '.';

const logger = newLogger('runtime');

export const runDeployment = <S>(
	initOperation: () => IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: Behavior<Behavior<Future<Action>>>
): Promise<S> =>
	startResourcesService()
		.then((stopResourcesService: () => Promise<void>) =>
			runIO(reactionLoop(initOperation, operations, nextAction)).then((finalStack) =>
				stopResourcesService().then(() => finalStack)
			)
		)
		.catch((err) => {
			logger.error(err, 'Deployment error');
			process.exit(1);
		})
		.finally(() => {
			logger.info('Deployment terminated');
			process.exit(0);
		});
