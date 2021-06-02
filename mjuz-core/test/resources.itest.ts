import { LocalWorkspace, PulumiFn, Stack } from '@pulumi/pulumi/automation';
import { Offer, RemoteConnection, Wish } from '../src/resources';
import { emptyProgram, RemoteOffer, ResourcesService, startResourcesService } from '../src';
import { instance, mock } from 'ts-mockito';
import { Logger } from 'pino';

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
	beforeEach(
		async () =>
			(resourcesService = await startResourcesService(
				'127.0.0.1',
				19951,
				instance(mock<Logger>())
			))
	);
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
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote","port":19952,"remoteId":"testRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::remote-connection$testRemote"},"secret":false}}');
			expectActions(1, 0, 0);

			// replace
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', { remoteId: 'testRemote2' });
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":19952,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::remote-connection$testRemote"},"secret":false}}');
			expectActions(2, 1, 1);

			// update
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', {
					remoteId: 'testRemote2',
					port: 123,
				});
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":123,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::remote-connection$testRemote"},"secret":false}}');
			expectActions(3, 2, 1);

			// no update
			await expectOutput(async () => {
				const r = new RemoteConnection('testRemote', {
					remoteId: 'testRemote2',
					port: 123,
				});
				return { r };
			}, '{"r":{"value":{"host":"127.0.0.1","id":"testRemote2","port":123,"remoteId":"testRemote2","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::remote-connection$testRemote"},"secret":false}}');
			expectActions(3, 3, 1);
		});
	});

	describe('offer', () => {
		test('deploy, replace, unchanged, update', async () => {
			const offerUpdatedCb = jest.fn();
			resourcesService.offerUpdated.subscribe(offerUpdatedCb);
			const offerRefreshedCb = jest.fn();
			resourcesService.offerRefreshed.subscribe(offerRefreshedCb);
			const offerDeletedCb = jest.fn().mockImplementation(async ([, cb]) => cb(null));
			resourcesService.offerWithdrawn.subscribe(offerDeletedCb);
			const expectActions = (updated: number, refreshed: number, deleted: number) => {
				expect(offerUpdatedCb.mock.calls.length).toBe(updated);
				expect(offerRefreshedCb.mock.calls.length).toBe(refreshed);
				expect(offerDeletedCb.mock.calls.length).toBe(deleted);
			};

			// deploy
			await expectOutput(async () => {
				const r = new RemoteConnection('1stRemote', {});
				const o = new Offer('2ndRemote:testOffer', {
					beneficiary: r,
					offerName: 'testOffer',
					offer: { a: 1 },
				});
				return { o };
			}, '{"o":{"value":{"beneficiaryId":"1stRemote","id":"1stRemote:testOffer","offer":{"a":1},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::offer$2ndRemote:testOffer"},"secret":false}}');
			expectActions(1, 0, 0);

			// replace
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const o = new Offer('2ndRemote:testOffer', {
					beneficiary: r,
					offerName: 'testOffer',
					offer: { a: 1 },
				});
				return { o };
			}, '{"o":{"value":{"beneficiaryId":"2ndRemote","id":"2ndRemote:testOffer","offer":{"a":1},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::offer$2ndRemote:testOffer"},"secret":false}}');
			expectActions(2, 1, 1);

			// no update with alternative constructor
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const o = new Offer(r, 'testOffer', { a: 1 });
				return { o };
			}, '{"o":{"value":{"beneficiaryId":"2ndRemote","id":"2ndRemote:testOffer","offer":{"a":1},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::offer$2ndRemote:testOffer"},"secret":false}}');
			expectActions(2, 2, 1);

			// update
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const o = new Offer(r, 'testOffer', { a: [true, 'b'] });
				return { o };
			}, '{"o":{"value":{"beneficiaryId":"2ndRemote","id":"2ndRemote:testOffer","offer":{"a":[true,"b"]},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::offer$2ndRemote:testOffer"},"secret":false}}');
			expectActions(3, 3, 1);
		});
	});

	describe('wish', () => {
		const wishPolledCb = jest.fn();
		const wishDeletedCb = jest.fn();
		const expectActions = (polled: number, deleted: number) => {
			expect(wishPolledCb.mock.calls.length).toBe(polled);
			expect(wishDeletedCb.mock.calls.length).toBe(deleted);
		};

		beforeEach(() => {
			wishPolledCb.mockClear();
			resourcesService.wishPolled.subscribe(wishPolledCb);
			wishDeletedCb.mockClear();
			resourcesService.wishDeleted.subscribe(wishDeletedCb);
		});

		test('deploy satisfied wish, replace, unchanged, update', async () => {
			let offerValue = { a: 1 } as unknown;
			wishPolledCb.mockImplementation(async ([, cb]) =>
				cb(null, { isWithdrawn: false, offer: offerValue })
			);
			// deploy
			await expectOutput(async () => {
				const r = new RemoteConnection('1stRemote', {});
				const w = new Wish('2ndRemote:testWish', {
					target: r,
					offerName: 'testWish',
				});
				return { w };
			}, '{"w":{"value":{"id":"1stRemote:testWish","isSatisfied":true,"offer":{"a":1},"offerName":"testWish","targetId":"1stRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$2ndRemote:testWish"},"secret":false}}');
			expectActions(1, 0);

			// replace
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const w = new Wish('2ndRemote:testWish', {
					target: r,
					offerName: 'testWish',
				});
				return { w };
			}, '{"w":{"value":{"id":"2ndRemote:testWish","isSatisfied":true,"offer":{"a":1},"offerName":"testWish","targetId":"2ndRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$2ndRemote:testWish"},"secret":false}}');
			expectActions(3, 1);

			// no update with alternative constructor
			offerValue = undefined;
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const w = new Wish(r, 'testWish');
				return { w };
			}, '{"w":{"value":{"id":"2ndRemote:testWish","isSatisfied":true,"offer":{"a":1},"offerName":"testWish","targetId":"2ndRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$2ndRemote:testWish"},"secret":false}}');
			expectActions(4, 1);

			// update
			offerValue = { a: [true, 'b'] };
			await expectOutput(async () => {
				const r = new RemoteConnection('2ndRemote', {});
				const w = new Wish(r, 'testWish');
				return { w };
			}, '{"w":{"value":{"id":"2ndRemote:testWish","isSatisfied":true,"offer":{"a":[true,"b"]},"offerName":"testWish","targetId":"2ndRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$2ndRemote:testWish"},"secret":false}}');
			expectActions(5, 1);
		});

		test('unsatisfied wish, unchanged, satisfied, unsatisfied', async () => {
			const offer: RemoteOffer<unknown> = { isWithdrawn: false };
			wishPolledCb.mockImplementation(async ([, cb]) => cb(null, offer));
			const program = async () => {
				const r = new RemoteConnection('remote', {});
				const w = new Wish(r, 'testWish');
				return { w };
			};

			// unsatisfied
			await expectOutput(
				program,
				'{"w":{"value":{"id":"remote:testWish","isSatisfied":false,"offer":null,"offerName":"testWish","targetId":"remote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$remote:testWish"},"secret":false}}'
			);
			expectActions(1, 0);

			// unchanged
			offer.isWithdrawn = true;
			await expectOutput(
				program,
				'{"w":{"value":{"id":"remote:testWish","isSatisfied":false,"offer":null,"offerName":"testWish","targetId":"remote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$remote:testWish"},"secret":false}}'
			);
			expectActions(2, 0);

			// satisfied
			offer.offer = { a: 1 };
			await expectOutput(
				program,
				'{"w":{"value":{"id":"remote:testWish","isSatisfied":true,"offer":{"a":1},"offerName":"testWish","targetId":"remote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$remote:testWish"},"secret":false}}'
			);
			expectActions(4, 0);

			// unsatisfied
			delete offer.offer;
			await expectOutput(
				program,
				'{"w":{"value":{"id":"remote:testWish","isSatisfied":false,"offer":null,"offerName":"testWish","targetId":"remote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::wish$remote:testWish"},"secret":false}}'
			);
			expectActions(6, 1);
		});
	});
});
