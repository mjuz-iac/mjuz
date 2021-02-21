import { Offer, RemoteConnection } from '../../src';
import { baseResourceTest, multiStepResourceTest, runTests } from './resource-mtest-utils';

/**
 * These tests cannot be executed inside jest due to this problem:
 * https://github.com/pulumi/pulumi/issues/3799
 */

/* eslint-disable no-console */
runTests(
	baseResourceTest(
		'void offer both constructors',
		async () => {
			const r = new RemoteConnection('testRemote', {});
			const o1 = new Offer(r, 'testOffer', undefined);
			const o2 = new Offer('directlyNamedTestOffer', {
				beneficiary: r,
				offerName: 'testOffer',
				offer: undefined,
			});
			return { o1, o2 };
		},
		(upResult, resolve, reject) => {
			console.log('Output:');
			console.log(JSON.stringify(upResult.outputs));
			JSON.stringify(upResult.outputs).match(
				'{"o1":{"value":{"beneficiary":"testRemote","error":null,"id":"testRemote:testOffer","offerName":"testOffer","urn":"' +
					'urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote:testOffer"},"secre' +
					't":false},"o2":{"value":{"beneficiary":"testRemote","error":null,"id":"testRemote:testOffer","offerName":"testOffer' +
					'","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::directlyNamedTestOff' +
					'er"},"secret":false}}'
			)
				? resolve()
				: reject('void offer: unexpected output');
		},
		async (resourcesService) => {
			resourcesService.offerWithdrawn.subscribe((p) => p[1](null));
		}
	)
		.then(() => {
			console.log('Offer update');
			// console.log(remoteConnections);
		})
		.then(() =>
			multiStepResourceTest(
				'offer update',
				[
					{
						program: async () => {
							const r = new RemoteConnection('testRemote', {});
							const o = new Offer('testOfferName', {
								beneficiary: r,
								offerName: 'testOffer',
								offer: {
									myArray: [3.4, 'test'],
									isTrue: true,
								},
							});
							return { o };
						},
						checkResult: (upResult, resolve, reject) => {
							console.log('Remote Connections');
							// console.log(remoteConnections);
							console.log('Output:');
							console.log(JSON.stringify(upResult.outputs));
							JSON.stringify(upResult.outputs) ===
							'{"o":{"value":{"beneficiary":"testRemote","error":null,"id":"testRemote:testOffer","offer":{"isTrue":true,"myArray":[3.4,"test"]},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testOfferName"},"secret":false}}'
								? resolve()
								: reject('offer udpate: unexpected output');
						},
					},
					{
						program: async () => {
							const r = new RemoteConnection('testRemote', {});
							const o = new Offer('testOfferName', {
								beneficiary: r,
								offerName: 'testOffer',
								offer: {
									myArray: [1.2, 'test'],
									isTrue: false,
								},
							});
							return { o };
						},
						checkResult: (upResult, resolve, reject) => {
							console.log('Remote Connections');
							// console.log(remoteConnections);
							console.log('Output:');
							console.log(JSON.stringify(upResult.outputs));
							JSON.stringify(upResult.outputs) ===
							'{"o":{"value":{"beneficiary":"testRemote","error":null,"id":"testRemote:testOffer","offer":{"isTrue":false,"myArray":[1.2,"test"]},"offerName":"testOffer","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testOfferName"},"secret":false}}'
								? resolve()
								: reject('offer udpate: unexpected output');
						},
					},
				],
				async (resourcesService) => {
					resourcesService.offerWithdrawn.subscribe((p) => p[1](null));
				}
			)
		)
);
