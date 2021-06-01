import { IO } from '@funkia/io';
import {
	Behavior,
	flatFutures,
	Future,
	nextOccurrenceFrom,
	performStream,
	runNow,
	sample,
	sinkFuture,
	Stream,
	toPromise,
} from '@funkia/hareactive';
import {
	Action,
	newLogger,
	reactionLoop,
	startDeploymentService,
	startOffersRuntime,
	startResourcesService,
} from '.';
import * as yargs from 'yargs';
import { Logger } from 'pino';

type RuntimeOptions = {
	deploymentName: string;
	deploymentHost: string;
	deploymentPort: number;
	heartbeatInterval: number;
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
		heartbeatInterval: {
			alias: 'h',
			default: defaults.heartbeatInterval || 5,
			description: 'Heartbeat interval on connections between deployments in seconds',
		},
	}).argv as RuntimeOptions;

export const runDeployment = <S>(
	initOperation: IO<S>,
	operations: (action: Action) => (state: S) => IO<S>,
	nextAction: (offerUpdates: Stream<void>) => Behavior<Behavior<Future<Action>>>,
	options: Partial<RuntimeOptions> & { logger?: Logger; disableExit?: true } = {}
): Promise<S> => {
	const logger = options.logger || newLogger('runtime');
	const setup = async () => {
		const opts = getOptions(options || {});
		const [resourcesService, deploymentService] = await Promise.all([
			startResourcesService(
				opts.resourcesHost,
				opts.resourcesPort,
				logger.child({ c: 'resources service' })
			),
			startDeploymentService(
				opts.deploymentHost,
				opts.deploymentPort,
				logger.child({ c: 'deployment service' })
			),
		]);
		const initialized = sinkFuture<void>();
		const offersRuntime = await startOffersRuntime(
			deploymentService,
			resourcesService,
			initialized,
			opts.deploymentName,
			opts.heartbeatInterval,
			logger.child({ c: 'offers runtime' })
		);

		const [stackActions, completed] = reactionLoop(
			initOperation,
			operations,
			nextAction(offersRuntime.inboundOfferUpdates),
			logger.child({ c: 'reaction loop' })
		);
		const stacks = runNow(performStream(stackActions));
		runNow(flatFutures(stacks).map(nextOccurrenceFrom).flatMap(sample)).subscribe(() =>
			initialized.resolve()
		);
		const finalStack = await toPromise(completed);
		await Promise.all([
			resourcesService.stop(),
			deploymentService.stop(),
			offersRuntime.stop(),
		]);
		return finalStack;
	};

	return setup()
		.catch((err) => {
			logger.error(err, 'Deployment error');
			process.exit(1);
		})
		.finally(() => {
			logger.info('Deployment terminated');
			if (!options.disableExit) process.exit(0);
		});
};
