import { IO, runIO } from '@funkia/io';
import { Behavior, Future } from '@funkia/hareactive';
import { Action, newLogger, reactionLoop, startResourcesService } from '.';
import * as yargs from 'yargs';

const logger = newLogger('runtime');

type RuntimeOptions = {
	deploymentHost: string;
	deploymentPort: number;
	resourcesHost: string;
	resourcesPort: number;
};
const getOptions = (defaults: Partial<RuntimeOptions>): RuntimeOptions =>
	yargs.options({
		deploymentHost: {
			alias: 'dh',
			default: defaults.deploymentHost || '0.0.0.0',
			description: 'Host of the µs deployment service',
		},
		deploymentPort: {
			alias: 'dp',
			default: defaults.deploymentPort || 19952,
			description: 'Port of the µs deployment service',
		},
		resourcesHost: {
			alias: 'rh',
			default: defaults.deploymentHost || '127.0.0.1',
			description: 'Host of the µs resources service',
		},
		resourcesPort: {
			alias: 'rp',
			default: defaults.resourcesPort || 19951,
			description: 'Port of the µs resources service',
		},
	}).argv;

export const runDeployment = <S>(
	initOperation: () => IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: Behavior<Behavior<Future<Action>>>,
	options?: Partial<RuntimeOptions>
): Promise<S> => {
	const opts = getOptions(options || {});
	return startResourcesService(opts.resourcesHost, opts.resourcesPort)
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
};
