import { call, IO, testIO } from '@funkia/io';
import { Behavior } from '@funkia/hareactive';
import * as pulumi from '@pulumi/pulumi/automation';
import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { Logger } from 'pino';
import { instance, mock } from 'ts-mockito';
import {
	deploy,
	destroy,
	emptyProgram,
	getStack,
	operations,
	pulumiCreateOrSelectStack,
	pulumiDestroy,
	pulumiSetStackConfig,
	pulumiUp,
	Stack,
} from '../src';

describe('pulumi', () => {
	const optionalArb = <A>(arb: Arbitrary<A>, freq?: number): Arbitrary<A | undefined> =>
		fc.option(arb, { nil: undefined, freq });
	const inlineProgramArgsArb: () => Arbitrary<pulumi.InlineProgramArgs> = () =>
		fc.record({
			stackName: fc.string(),
			projectName: fc.string(),
			program: fc.constant(emptyProgram),
		});
	const localWorkspaceOptionsArb: () => Arbitrary<pulumi.LocalWorkspaceOptions> = () =>
		fc.constant({});
	const configMapArb: () => Arbitrary<pulumi.ConfigMap> = () =>
		fc.dictionary(
			fc.string(),
			fc.record({
				value: fc.string(),
				secret: fc.oneof(fc.boolean(), fc.constant(undefined)),
			})
		);
	const stackArb = (stack: pulumi.Stack): Arbitrary<Stack> =>
		fc.record({
			stack: fc.constant(stack),
			isDeployed: fc.boolean(),
			isDestroyed: fc.boolean(),
		});

	const stack = instance(mock(pulumi.Stack));
	const logger = instance(mock<Logger>());

	test('getStack', () => {
		const pred = (
			progArgs: pulumi.InlineProgramArgs,
			workspaceOptions?: pulumi.LocalWorkspaceOptions,
			configMap?: pulumi.ConfigMap
		) => {
			const mocks: unknown[] = [
				// eslint-disable-next-line @typescript-eslint/no-empty-function
				[call(() => {}), undefined],
				[pulumiCreateOrSelectStack(progArgs, workspaceOptions), stack],
			];
			if (configMap) mocks.push([pulumiSetStackConfig(stack, configMap), stack]);

			testIO(getStack(progArgs, workspaceOptions, configMap, logger), mocks, {
				stack: stack,
				isDeployed: false,
				isDestroyed: false,
			});
		};

		fc.assert(
			fc.property(
				inlineProgramArgsArb(),
				optionalArb(localWorkspaceOptionsArb()),
				optionalArb(configMapArb()),
				pred
			)
		);
	});

	test('deploy', () => {
		const pred = (stack: Stack) => {
			testIO(
				deploy(stack, emptyProgram, logger),
				[
					// eslint-disable-next-line @typescript-eslint/no-empty-function
					[call(() => {}), undefined],
					[pulumiUp(stack.stack, emptyProgram, logger), {}],
				],
				{
					stack: stack.stack,
					isDeployed: true,
					isDestroyed: false,
				}
			);
		};

		fc.assert(fc.property(stackArb(stack), pred));
	});

	test('destroy', () => {
		const pred = (stack: Stack) => {
			if (stack.isDestroyed)
				expect(() => testIO(destroy(stack, logger), [], undefined)).toThrow(
					'Stack terminated already'
				);
			else
				testIO(
					destroy(stack, logger),
					[
						// eslint-disable-next-line @typescript-eslint/no-empty-function
						[call(() => {}), undefined],
						[pulumiDestroy(stack.stack, logger), {}],
					],
					{
						stack: stack.stack,
						isDeployed: false,
						isDestroyed: true,
					}
				);
		};

		fc.assert(fc.property(stackArb(stack), pred));
	});

	describe('operations', () => {
		const actions = operations(Behavior.of(emptyProgram), logger);
		test('deploy', () => {
			const pred = (stack: Stack) =>
				expect(JSON.stringify(actions('deploy')(stack))).toEqual(
					JSON.stringify(deploy(stack, emptyProgram, logger))
				);
			fc.assert(fc.property(stackArb(stack), pred));
		});
		test('terminate', () => {
			const pred = (stack: Stack) =>
				expect(actions('terminate')(stack)).toEqual(IO.of(stack));
			fc.assert(fc.property(stackArb(stack), pred));
		});
		test('destroy', () => {
			const pred = (stack: Stack) =>
				expect(JSON.stringify(actions('destroy')(stack))).toEqual(
					JSON.stringify(destroy(stack, logger))
				);
			fc.assert(fc.property(stackArb(stack), pred));
		});
	});
});
