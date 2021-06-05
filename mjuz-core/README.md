[![GitHub version](https://badge.fury.io/gh/mjuz-iac%2Fmjuz.svg)](https://badge.fury.io/gh/mjuz-iac%2Fmjuz)
[![npm version](https://badge.fury.io/js/%40mjuz%2Fcore.svg)](https://badge.fury.io/js/%40mjuz%2Fcore)

# µs Runtime and Resource Provider

[µs](https://mjuz.rocks) is a modern, declarative infrastructure as code (IaC) solution based on [Pulumi](https://pulumi.com) and Typescript.
It enables safe deployments in DevOps organizations with cross-functional teams
by inventing decentralized automated deployment coordination.

This package provides the runtime implementation for µs.
Moreover, it implements the Pulumi resources `Offer`, `Wish`, and `RemoteConnection`,
used to define coordination interfaces between separate deployments.
Learn more about µs on the [website](https://mjuz.rocks) and in the [paper](https://mjuz.rocks/assets/pdf/papers/2021_Automating-Serverless-Deployments-for-DevOps-Organizations.pdf).

## Usage

To get started with µs, look at our [getting started guide](../README.md#getting-started).

This is a template for a simple µs deployment:

```ts
import { emptyProgram, getStack, nextAction, operations,	runDeployment, sigint, sigquit } from '@mjuz/core';
import { PulumiFn } from '@pulumi/pulumi/automation';

const program =	(): PulumiFn => {
	// Your deployment, implemented like a Pulumi TypeScript program

	/* ... */
}

const initStack = getStack(
	{
		program: emptyProgram,
		projectName: 'MyProject',
		stackName: 'MyStack',
	},
	{ workDir: '.' },
	{ 'this-is': 'my-configuration' }
);

runDeployment(initStack, operations(programState.map(program)), (offerUpdates) =>
	nextAction(offerUpdates, sigquit(),	sigint())
);
```

## Defining Wishes

In your program, you define wishes from other deployments that are connected and identified by a remote connection:

```ts
import { RemoteConnection, Wish } from '@mjuz/core/resources';
import * as aws from '@pulumi/aws';

/* ... */

const bucketManager = new RemoteConnection('bucket', { port: 19952 });
const bucketWish = new Wish<aws.s3.Bucket>(bucketManager, 'bucket');
const index = new aws.s3.BucketObject('index', {
	bucket: bucketWish.offer,
	/* ... */
});
```

## Defining Offers

In your program, you define offers to other deployments that are connected and identified by a remote connection:

```ts
import { Offer, RemoteConnection } from '@mjuz/core/resources';
import * as aws from '@pulumi/aws';

/* ... */

const bucket = new aws.s3.Bucket('website', {
	website: { indexDocument: 'index.html' },
});
const contentManager = new RemoteConnection('content', { port: 19954 });
new Offer(contentManager, 'bucket', bucket);
```
