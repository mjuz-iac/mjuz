import { deploy, destroy, emptyProgram, getStack, Stack } from '../src/pulumi';
import { runIO } from '@funkia/io';
import { LocalWorkspace } from '@pulumi/pulumi/automation';
import { Logger } from 'pino';
import { instance, mock } from 'ts-mockito';

describe('pulumi', () => {
	const logger = instance(mock<Logger>());

	const getStackC = getStack(
		{
			stackName: 'testStack',
			projectName: 'testProject',
			program: emptyProgram,
		},
		{},
		{},
		logger
	);

	afterEach(() => {
		return LocalWorkspace.create({}).then((workspace) => workspace.removeStack('testStack'));
	});

	describe('get stack', () => {
		test('Create stack', () => {
			return expect(
				runIO(getStackC).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isDestroyed: stack.isDestroyed,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: false, isDestroyed: false });
		});
	});

	describe('destroy', () => {
		let stack: Stack | undefined = undefined;
		beforeEach(() => {
			return runIO(getStackC).then((s) => {
				stack = s;
				return s.stack.up({ program: emptyProgram });
			});
		});

		test('Destroy stack', () => {
			return expect(
				runIO(destroy(<Stack>stack, logger)).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isDestroyed: stack.isDestroyed,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: false, isDestroyed: true });
		});
	});

	describe('deploy', () => {
		let stack: Stack | undefined = undefined;
		beforeEach(() => {
			return runIO(getStackC).then((s) => (stack = s));
		});
		afterEach(() => {
			return (<Stack>stack).stack.destroy();
		});

		test('Deploy stack', () => {
			return expect(
				runIO(deploy(<Stack>stack, emptyProgram, logger)).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isDestroyed: stack.isDestroyed,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: true, isDestroyed: false });
		});
	});
});
