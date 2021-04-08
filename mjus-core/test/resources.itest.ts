import { LocalWorkspace, PulumiFn, Stack } from '@pulumi/pulumi/x/automation';
import { Offer, RemoteConnection, Wish } from '../src/resources';
import { emptyProgram, ResourcesService, startResourcesService, toRpcWish } from '../src';

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

	const expectOutput = async (program: PulumiFn, expectedOutput: string) => {
		const { outputs } = await stack.up({ program });
		expect(JSON.stringify(outputs)).toBe(expectedOutput);
	};

	describe('remote connection', () => {
		test('deploy, replace, update, unchanged', async () => {
			const remoteUpdatedCb = jest.fn();
			resourcesService.remoteUpdated.subscribe(remoteUpdatedCb);
			const remoteRefreshedCb = jest.fn();
			resourcesService.remoteRefreshed.subscribe(remoteRefreshedCb);
			const remoteDeletedCb = jest.fn();
			resourcesService.remoteDeleted.subscribe(remoteDeletedCb);
			const expectActions = (updated: number, refreshed: number, deleted: number) => {
				expect(remoteUpdatedCb.mock.calls.length).toBe(updated);
				expect(remoteRefreshedCb.mock.calls.length).toBe(refreshed);
				expect(remoteDeletedCb.mock.calls.length).toBe(deleted);
			};

			// deploy
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', {});
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote","port":19952,"remoteId":"testRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}');
			expectActions(1, 0, 0);

			// replace
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', { remoteId: 'testRemote2' });
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":19952,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}');
			expectActions(2, 1, 1);

			// update
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', {
					remoteId: 'testRemote2',
					port: 123,
				});
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":123,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}');
			expectActions(3, 2, 1);

			// no update
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', {
					remoteId: 'testRemote2',
					port: 123,
				});
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":123,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}');
			expectActions(3, 3, 1);
		});
	});

	describe('offer', () => {
		test('deploy void offers', async () => {
			const program: PulumiFn = async () => {
				const r = new RemoteConnection('testRemote', {});
				const o1 = new Offer(r, 'testOffer', undefined);
				const o2 = new Offer('directlyNamedTestOffer', {
					beneficiary: r,
					offerName: 'testOffer',
					offer: undefined,
				});
				return { o1, o2 };
			};
			// Confirm withdrawals
			resourcesService.offerWithdrawn.subscribe((p) => p[1](null));

			const { outputs } = await stack.up({ program });
			expect(JSON.stringify(outputs)).toBe(
				'{"o1":{"value":{"beneficiaryId":"testRemote","id":"testRemote:testOffer","offerName":"testOffer","urn":"' +
					'urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote:testOffer"},"secre' +
					't":false},"o2":{"value":{"beneficiaryId":"testRemote","id":"testRemote:testOffer","offerName":"testOffer' +
					'","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::directlyNamedTestOff' +
					'er"},"secret":false}}'
			);
		});

		test('deploy and update', async () => {
			const program = <T>(offer: T): PulumiFn => async () => {
				const r = new RemoteConnection('testRemote', {});
				const o = new Offer('testOfferName', {
					beneficiary: r,
					offerName: 'testOffer',
					offer,
				});
				return { o };
			};
			// Confirm withdrawals
			resourcesService.offerWithdrawn.subscribe((p) => p[1](null));

			{
				const { outputs } = await stack.up({
					program: program({ myArray: [3.4, 'test'], isTrue: true }),
				});
				expect(JSON.stringify(outputs)).toBe(
					'{"o":{"value":{"beneficiaryId":"testRemote","id":"testRemote:testOffer","offer":{"isTrue":true,"myArray":[3.4,"test"]},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testOfferName"},"secret":false}}'
				);
			}

			{
				const { outputs } = await stack.up({
					program: program({
						myArray: [1.2, 'test'],
						isTrue: false,
						newField: 5,
					}),
				});
				expect(JSON.stringify(outputs)).toBe(
					'{"o":{"value":{"beneficiaryId":"testRemote","id":"testRemote:testOffer","offer":{"isTrue":false,"myArray":[1.2,"test"],"newField":5},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testOfferName"},"secret":false}}'
				);
			}
		});
	});

	describe('wish', () => {
		test('deploy unsatisfied wishes', async () => {
			const program: PulumiFn = async () => {
				const r = new RemoteConnection('testRemote', {});
				const w1 = new Wish(r, 'testWish', undefined);
				const w2 = new Wish('directlyNamedTestWish', {
					offerName: 'testWish',
					target: r,
				});
				return { w1, w2 };
			};
			// Respond that wishes are unsatisfied on poll
			resourcesService.wishPolled.subscribe((p) => p[1](null, toRpcWish(p[0])));

			const { outputs } = await stack.up({ program });
			expect(JSON.stringify(outputs)).toBe(
				'{"w1":{"value":{"error":null,"id":"testRemote:testWish","isSatisfied":false,"offer":null,"offerName":"te' +
					'stWish","target":"testRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::' +
					'testRemote:testWish"},"secret":false},"w2":{"value":{"error":null,"id":"testRemote:testWish","isSatisfie' +
					'd":false,"offer":null,"offerName":"testWish","target":"testRemote","urn":"urn:pulumi:testStack::testProj' +
					'ect::pulumi-nodejs:dynamic:Resource::directlyNamedTestWish"},"secret":false}}'
			);
		});
	});
});
