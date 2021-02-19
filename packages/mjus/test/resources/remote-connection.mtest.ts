import { RemoteConnection } from '../../src';
import { baseResourceTest, runTests } from './resource-mtest-utils';

/**
 * These tests cannot be executed inside jest due to this problem:
 * https://github.com/pulumi/pulumi/issues/3799
 */

/* eslint-disable no-console */
runTests(
	baseResourceTest(
		'remote connection',
		async () => {
			const r = new RemoteConnection('testRemote', {});
			return { r };
		},
		(upResult, resolve, reject) => {
			console.log('Output:');
			console.log(JSON.stringify(upResult.outputs));
			JSON.stringify(upResult.outputs).match(
				'{"r":{"value":{"error":null,"host":"127.0.0.1","id":"testRemote","name":"testRemote","port":19952,"urn":"urn:pulumi:testStack::testProject::pulumi-nodejs:dynamic:Resource::testRemote"},"secret":false}}'
			)
				? resolve()
				: reject('remote connection: unexpected remote connection');
		}
	)
);
