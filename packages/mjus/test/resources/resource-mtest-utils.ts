import { LocalWorkspace, PulumiFn, Stack, UpResult } from '@pulumi/pulumi/x/automation';
import { emptyProgram, startResourcesService } from '../../src';

/* eslint-disable no-console */
export const stack = (): Promise<Stack> =>
	LocalWorkspace.createOrSelectStack(
		{
			stackName: 'testStack',
			projectName: 'testProject',
			program: emptyProgram,
		},
		{
			// Important to make dynamic resources work properly in Automation API as of Pulumi 2.20.0
			// https://github.com/pulumi/pulumi/issues/5578
			workDir: '.',
		}
	);
export const cleanupStack = (): Promise<void> =>
	stack()
		.then((stack) => stack.destroy())
		.then(() => LocalWorkspace.create({ workDir: '.' }))
		.then((workspace) => workspace.removeStack('testStack'));

export const baseResourceTest = (
	testName: string,
	program: PulumiFn,
	checkResult: (res: UpResult, resolve: () => void, reject: (err: string) => void) => void
): Promise<void> =>
	multiStepResourceTest(testName, [{ program: program, checkResult: checkResult }]);

export const multiStepResourceTest = (
	testName: string,
	steps: {
		program: PulumiFn;
		checkResult: (res: UpResult, resolve: () => void, reject: (err: string) => void) => void;
	}[]
): Promise<void> => {
	console.info('Running test: ' + testName);
	return startResourcesService('127.0.0.1', 19951)
		.then((resourcesService) =>
			stack()
				.then((stack) => runSteps(stack, steps))
				.finally(cleanupStack)
				.finally(() => resourcesService.stopService())
		)
		.then(() => console.info('Completed test: ' + testName));
};

const runSteps = async (
	stack: Stack,
	steps: {
		program: PulumiFn;
		checkResult: (res: UpResult, resolve: () => void, reject: (err: string) => void) => void;
	}[]
): Promise<void> =>
	steps.length === 0
		? Promise.resolve()
		: stack
				.up({ program: steps[0].program })
				.then(
					(res) =>
						new Promise((resolve, reject) =>
							steps[0].checkResult(res, () => resolve(undefined), reject)
						)
				)
				.then(() => runSteps(stack, steps.slice(1)));

export const runTests = (tests: Promise<unknown>): Promise<void> =>
	tests
		.then(() => console.info('All tests succeeded'))
		.catch((err) => {
			console.error('Failed tests');
			console.error(err);
			process.exit(1);
		});
