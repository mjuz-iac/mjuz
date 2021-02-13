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
	readonly isTerminated: boolean;
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
			return { stack: stack, isDeployed: false, isTerminated: false };
		});
};

const pulumiUp = withEffectsP((stack: pulumi.Stack, program: PulumiFn, logger: Logger) =>
	stack.up({
		program: program,
		onOutput: (m) => logger.debug(m),
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
				isTerminated: false,
			};
		});
};

const pulumiDestroy = withEffectsP((stack: pulumi.Stack, logger: Logger) =>
	stack.destroy({ onOutput: (m) => logger.debug(m) })
);

export const destroy = (stack: Stack): IO<Stack> => {
	if (stack.isTerminated) return throwE('Stack terminated already');
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
				isTerminated: true,
			};
		});
};
