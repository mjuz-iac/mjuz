import { Behavior, runNow, sample } from '@funkia/hareactive';
import { call, IO, throwE, withEffectsP } from '@funkia/io';
import * as pulumi from '@pulumi/pulumi/automation';
import {
	ConfigMap,
	InlineProgramArgs,
	LocalWorkspace,
	LocalWorkspaceOptions,
	PulumiFn,
} from '@pulumi/pulumi/automation';
import { Logger } from 'pino';
import { Action, newLogger } from '.';

export const emptyProgram: PulumiFn = async () => {
	// Empty program
};

export type Stack = {
	readonly stack: pulumi.Stack;
	readonly isDeployed: boolean;
	readonly isDestroyed: boolean;
};

export const pulumiCreateOrSelectStack = withEffectsP(
	(args: InlineProgramArgs, workspaceOptions?: LocalWorkspaceOptions) =>
		LocalWorkspace.createOrSelectStack(args, workspaceOptions)
);
export const pulumiSetStackConfig = withEffectsP((stack: pulumi.Stack, config: ConfigMap) =>
	stack.setAllConfig(config)
);

export const getStack = (
	args: InlineProgramArgs,
	workspaceOptions?: LocalWorkspaceOptions,
	config?: ConfigMap,
	logger: Logger = newLogger('pulumi')
): IO<Stack> =>
	call(() => logger.debug(`Getting stack ${args.stackName}`))
		.flatMap(() => pulumiCreateOrSelectStack(args, workspaceOptions))
		.flatMap((stack: pulumi.Stack) =>
			config ? pulumiSetStackConfig(stack, config).map(() => stack) : IO.of(stack)
		)
		.map((stack) => {
			logger.debug(`Completed getting stack ${stack.name}`);
			return { stack: stack, isDeployed: false, isDestroyed: false };
		});

export const pulumiUp = withEffectsP((stack: pulumi.Stack, program: PulumiFn, logger: Logger) =>
	stack.up({
		program: program,
		onOutput: (m) => logger.trace(m.replace(/[\n\r]\s*$/g, '')),
	})
);

export const deploy = (stack: Stack, targetState: PulumiFn, logger: Logger): IO<Stack> =>
	call(() => logger.debug('Deploying stack'))
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

export const pulumiDestroy = withEffectsP((stack: pulumi.Stack, logger: Logger) =>
	stack.destroy({ onOutput: (m) => logger.trace(m.replace(/[\n\r]\s*$/g, '')) })
);

export const destroy = (stack: Stack, logger: Logger): IO<Stack> =>
	stack.isDestroyed
		? throwE('Stack terminated already')
		: call(() => logger.debug('Destroying stack'))
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

export const operations =
	(program: Behavior<PulumiFn>, logger: Logger = newLogger('pulumi')) =>
	(action: Action): ((stack: Stack) => IO<Stack>) => {
		const actionLogger = logger.child({
			action: action,
			id: Math.floor(Math.random() * 10000),
		});
		switch (action) {
			case 'deploy':
				return (stack: Stack) => deploy(stack, runNow(sample(program)), actionLogger);
			case 'terminate':
				return (stack: Stack) => IO.of(stack);
			case 'destroy':
				return (stack: Stack) => destroy(stack, actionLogger);
		}
	};
