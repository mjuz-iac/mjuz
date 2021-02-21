import { IO, runIO } from '@funkia/io';
import { Behavior, Future, Stream } from '@funkia/hareactive';
import { Action, newLogger, reactionLoop, startResourcesService } from '.';
import * as yargs from 'yargs';
import { startDeploymentService } from './deployment-service';
import { startOffersRuntime } from './runtime-offers';

const logger = newLogger('runtime');

type RuntimeOptions = {
	deploymentName: string;
	deploymentHost: string;
	deploymentPort: number;
	resourcesHost: string;
	resourcesPort: number;
};
const getOptions = (defaults: Partial<RuntimeOptions>): RuntimeOptions =>
	yargs.options({
		deploymentName: {
			alias: 'n',
			default: defaults.deploymentName || 'deployment',
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
	nextAction: (offerUpdates: Stream<void>) => Behavior<Behavior<Future<Action>>>,
	options?: Partial<RuntimeOptions>,
	disableExit = false
): Promise<S> => {
	const setup = async () => {
		const opts = getOptions(options || {});
		const [resourcesService, deploymentService] = await Promise.all([
			startResourcesService(opts.resourcesHost, opts.resourcesPort),
			startDeploymentService(opts.deploymentHost, opts.deploymentPort),
		]);
		const offersRuntime = await startOffersRuntime(
			deploymentService,
			resourcesService,
			opts.deploymentName
		);

		const finalStack = await runIO(
			reactionLoop(initOperation, operations, nextAction(offersRuntime.inboundOfferUpdates))
		);
		await Promise.all([resourcesService.stop(), deploymentService.stop(), offersRuntime.stop]);
		return finalStack;
	};

	return setup()
		.catch((err) => {
			logger.error(err, 'Deployment error');
			process.exit(1);
		})
		.finally(() => {
			logger.info('Deployment terminated');
			if (!disableExit) process.exit(0);
		});
};
