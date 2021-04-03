import { LocalWorkspace, PulumiFn, Stack } from '@pulumi/pulumi/x/automation';
import { RemoteConnection } from '../../src/resources';
import { emptyProgram, ResourcesService, startResourcesService } from '../../src';

describe('resources', () => {
	let stack: Stack;
	beforeAll(
		async () =>
			(stack = await LocalWorkspace.createOrSelectStack(
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
			))
	);
	afterAll(() => stack.workspace.removeStack('testStack'));

	let resourcesService: ResourcesService;
	beforeEach(async () => (resourcesService = await startResourcesService('127.0.0.1', 19951)));
	afterEach(async () => {
		await stack.destroy();
		await resourcesService.stop();
	});

	describe('remote connection', () => {
		test('deploy', async () => {
			const program: PulumiFn = async () => {
				const r = new RemoteConnection('testRemote', {});
				return { r };
			};

			const { outputs } = await stack.up({ program });
			expect(JSON.stringify(outputs)).toBe(
				'{"r":{"value":{"error":null,"host":"127.0.0.1","id":"testRemote","name":"testRemote","port":19952,"urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}'
			);
		});
	});
});
