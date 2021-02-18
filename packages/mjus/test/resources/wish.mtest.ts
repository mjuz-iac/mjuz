import { Wish, RemoteConnection } from '../../src';
import { baseResourceTest, runTests } from './resource-mtest-utils';

/**
 * These tests cannot be executed inside jest due to this problem:
 * https://github.com/pulumi/pulumi/issues/3799
 */

/* eslint-disable no-console */
runTests(
	baseResourceTest(
		'void wish both constructors',
		async () => {
			const r = new RemoteConnection('testRemote', {});
			const w1 = new Wish(r, 'testWish', undefined);
			const w2 = new Wish('directlyNamedTestWish', {
				offerName: 'testWish',
				target: r,
			});
			return { w1, w2 };
		},
		(upResult, resolve, reject) => {
			console.log('Output:');
			console.log(JSON.stringify(upResult.outputs));
			JSON.stringify(upResult.outputs).match(
				'{"w1":{"value":{"id":"testRemote:testWish","offerName":"testWish","target":"testRemote","urn":' +
					'"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote:testWish","value' +
					'":"website-40eae63"},"secret":false},"w2":{"value":{"id":"testRemote:testWish","offerName":"tes' +
					'tWish","target":"testRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Re' +
					'source::directlyNamedTestWish","value":"website-40eae63"},"secret":false}}'
			)
				? resolve()
				: reject('void wish: unexpected output');
		}
	)
);
