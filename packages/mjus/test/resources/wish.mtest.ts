import { Wish, RemoteConnection } from '../../src';
import { baseResourceTest, runTests } from './resource-mtest-utils';

/**
 * These tests cannot be executed inside jest due to this problem:
 * https://github.com/pulumi/pulumi/issues/3799
 */

/* eslint-disable no-console */
runTests(
	baseResourceTest(
		'unsatisfied wish both constructors',
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
			JSON.stringify(upResult.outputs) ===
			'{"w1":{"value":{"error":null,"id":"testRemote:testWish","isSatisfied":false,"offer":null,"offerName":"te' +
				'stWish","target":"testRemote","urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::' +
				'testRemote:testWish"},"secret":false},"w2":{"value":{"error":null,"id":"testRemote:testWish","isSatisfie' +
				'd":false,"offer":null,"offerName":"testWish","target":"testRemote","urn":"urn:pulumi:testStack::testProj' +
				'ect::pulumi-nodejs:dynamic:Resource::directlyNamedTestWish"},"secret":false}}'
				? resolve()
				: reject('unsatisfied wish both constructors: unexpected outputs');
		}
	)
);
