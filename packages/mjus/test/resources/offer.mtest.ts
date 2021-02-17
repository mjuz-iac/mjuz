import { Offer, Remote } from '../../src';
import { baseResourceTest, runTests } from './resource-mtest-utils';

/**
 * These tests cannot be executed inside jest due to this problem:
 * https://github.com/pulumi/pulumi/issues/3799
 */

/* eslint-disable no-console */
runTests(
	baseResourceTest(
		'void offer both constructors',
		async () => {
			const r = new Remote('testRemote', {});
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
				'{"o1":{"value":{"beneficiary":"testRemote","id":"testRemote:testOffer","offerName":"testOffer","urn":"' +
					'urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote:testOffer"},"secre' +
					't":false},"o2":{"value":{"beneficiary":"testRemote","id":"testRemote:testOffer","offerName":"testOffer' +
					'","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::directlyNamedTestOff' +
					'er"},"secret":false}}'
			)
				? resolve()
				: reject('void offer: unexpected output');
		}
	)
);
