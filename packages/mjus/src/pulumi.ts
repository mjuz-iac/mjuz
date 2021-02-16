import { call, callP, IO, throwE, withEffectsP } from '@funkia/io';
import * as pulumi from '@pulumi/pulumi/x/automation';
import { newLogger } from './logging';
import { Logger } from 'pino';
import {
	ConfigMap,
	InlineProgramArgs,
	LocalWorkspace,
	LocalWorkspaceOptions,
	PulumiFn,
} from '@pulumi/pulumi/x/automation';
import { Action } from './runtime';
import { Behavior, runNow, sample } from '@funkia/hareactive';

export const emptyProgram: PulumiFn = async () => {
	// Empty program
};

type PulumiAction = 'deploy' | 'destroy' | 'getStack';

const logger = newLogger('pulumi');
const newActionLogger = (action: PulumiAction): Logger =>
	logger.child({ action: action, id: Math.floor(Math.random() * 10000) });

export type Stack = {
	readonly stack: pulumi.Stack;
	readonly isDeployed: boolean;
	readonly isDestroyed: boolean;
};

const pulumiCreateOrSelectStack = withEffectsP(
	(args: InlineProgramArgs, workspaceOptions?: LocalWorkspaceOptions) =>
		LocalWorkspace.createOrSelectStack(args, workspaceOptions)
);

export const getStack = (
	args: InlineProgramArgs,
	workspaceOptions?: LocalWorkspaceOptions,
	config?: ConfigMap
): IO<Stack> => {
	const logger = newActionLogger('getStack');
	return call(() => logger.debug(`Getting stack ${args.stackName}`))
		.flatMap(() => pulumiCreateOrSelectStack(args, workspaceOptions))
		.flatMap((stack: pulumi.Stack) =>
			config ? callP(() => stack.setAllConfig(config)).map(() => stack) : IO.of(stack)
		)
		.map((stack) => {
			logger.debug(`Completed getting stack ${stack.name}`);
			return { stack: stack, isDeployed: false, isDestroyed: false };
		});
};

const pulumiUp = withEffectsP((stack: pulumi.Stack, program: PulumiFn, logger: Logger) =>
	stack.up({
		program: program,
		onOutput: (m) => logger.debug(m.replace(/[\n\r]/g, '')),
	})
);

export const deploy = (stack: Stack, targetState: PulumiFn): IO<Stack> => {
	const logger = newActionLogger('deploy');
	return call(() => logger.debug('Deploying stack'))
		.flatMap(() => pulumiUp(stack.stack, targetState, logger))
		.map((res) => {
			logger.debug('Completed deploying stack', {
				summary: res.summary,
				outputs: res.outputs,
			});
			return {
				stack: stack.stack,
				isDeployed: true,
				isDestroyed: false,
			};
		});
};

const pulumiDestroy = withEffectsP((stack: pulumi.Stack, logger: Logger) =>
	stack.destroy({ onOutput: (m) => logger.debug(m.replace(/[\n\r]/g, '')) })
);

export const destroy = (stack: Stack): IO<Stack> => {
	if (stack.isDestroyed) return throwE('Stack terminated already');
	const logger = newActionLogger('destroy');
	return call(() => logger.debug('Destroying stack'))
		.flatMap(() => pulumiDestroy(stack.stack, logger))
		.map((res) => {
			logger.debug('Completed destroying stack', {
				summary: res.summary,
			});
			return {
				stack: stack.stack,
				isDeployed: false,
				isDestroyed: true,
			};
		});
};

export const operations = (program: Behavior<PulumiFn>) => (
	action: Action
): ((stack: Stack) => IO<Stack>) => {
	switch (action) {
		case 'deploy':
			return (stack: Stack) => deploy(stack, runNow(sample(program)));
		case 'terminate':
			return (stack: Stack) => IO.of(stack);
		case 'destroy':
			return (stack: Stack) => destroy(stack);
	}
};
