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
	correctUpResult: (res: UpResult, resolve: () => void, reject: (err: string) => void) => void
): Promise<void> => {
	console.info('Running test: ' + testName);
	return startResourcesService()
		.then((stopResourcesService) =>
			stack()
				.then((stack) => stack.up({ program: program }))
				.then(
					(res) =>
						new Promise((resolve, reject) =>
							correctUpResult(res, () => resolve(undefined), reject)
						)
				)
				.then(cleanupStack)
				.then(() => stopResourcesService())
		)
		.then(() => console.info('Completed test: ' + testName));
};

export const runTests = (tests: Promise<unknown>): Promise<void> =>
	tests
		.then(() => console.info('All tests succeeded'))
		.catch((err) => {
			console.error('Failed tests');
			console.error(err);
			process.exit(1);
		});
