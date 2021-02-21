import { IO, runIO } from '@funkia/io';
import { Behavior, Future } from '@funkia/hareactive';
import { Action, newLogger, reactionLoop, ResourcesService, startResourcesService } from '.';
import * as yargs from 'yargs';
import { startDeploymentService } from './deployment-service';

const logger = newLogger('runtime');

type RuntimeOptions = {
	name: string;
	deploymentHost: string;
	deploymentPort: number;
	resourcesHost: string;
	resourcesPort: number;
};
const getOptions = (defaults: Partial<RuntimeOptions>): RuntimeOptions =>
	yargs.options({
		name: {
			alias: 'name',
			default: defaults.name || 'deployment',
			description: 'Name of the deployment (used for identification with other deployments)',
		},
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
	options?: Partial<RuntimeOptions>,
	disableExit = false
): Promise<S> => {
	const opts = getOptions(options || {});
	return Promise.all<ResourcesService, () => Promise<void>>([
		startResourcesService(opts.resourcesHost, opts.resourcesPort),
		startDeploymentService(opts.deploymentHost, opts.deploymentPort),
	])
		.then((res) => {
			const [resourcesService, stopDeploymentService] = res;
			return runIO(reactionLoop(initOperation, operations, nextAction)).then((finalStack) =>
				Promise.all([resourcesService.stop(), stopDeploymentService()]).then(
					() => finalStack
				)
			);
		})
		.catch((err) => {
			logger.error(err, 'Deployment error');
			process.exit(1);
		})
		.finally(() => {
			logger.info('Deployment terminated');
			if (!disableExit) process.exit(0);
		});
};
