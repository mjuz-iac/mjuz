import { deploy, destroy, emptyProgram, getStack, Stack } from '../src/pulumi';
import { runIO } from '@funkia/io';
import { LocalWorkspace } from '@pulumi/pulumi/x/automation';

describe('pulumi', () => {
	afterEach(() => {
		return LocalWorkspace.create({}).then((workspace) => workspace.removeStack('testStack'));
	});

	const getStackC = getStack({
		stackName: 'testStack',
		projectName: 'testProject',
		program: emptyProgram,
	});

	describe('get stack', () => {
		test('Create stack', () => {
			return expect(
				runIO(getStackC).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isTerminated: stack.isTerminated,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: false, isTerminated: false });
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
				runIO(destroy(<Stack>stack)).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isTerminated: stack.isTerminated,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: false, isTerminated: true });
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
				runIO(deploy(<Stack>stack, emptyProgram)).then((stack) => {
					return {
						name: stack.stack.name,
						isDeployed: stack.isDeployed,
						isTerminated: stack.isTerminated,
					};
				})
			).resolves.toEqual({ name: 'testStack', isDeployed: true, isTerminated: false });
		});
	});
});
