import {
	emptyProgram,
	getStack,
	nextAction,
	operations,
	runDeployment,
	sigint,
	sigquit,
} from '@mjuz/core';
import { at, changes, combine, sinkBehavior } from '@funkia/hareactive';
import * as aws from '@pulumi/aws';
import { PulumiFn } from '@pulumi/pulumi/automation';
import { isDeepStrictEqual } from 'util';

type State = { counter: number };
const programState = sinkBehavior<State>({ counter: 0 });
// Counter changes every 20 seconds, even though it is updated every second
setInterval(
	() =>
		programState.push({
			counter: at(programState).counter + (Date.now() % 20000 < 1000 ? 1 : 0),
		}),
	1000
);

const program =
	(state: State): PulumiFn =>
	async () => {
		// Create a bucket and expose a website index document
		const bucket = new aws.s3.Bucket('website', {
			website: {
				indexDocument: 'index.html',
			},
		});

		const content = `<html>
	<head>
		<title>Hello World! 👋🌍</title>
		<meta charset="UTF-8">
	</head>
	<body>
		<p>Hello World! 👋🌍</p>
		<p>Counter: ${state.counter}</p>
	</body>
</html>`;

		// write our index.html into the site bucket
		new aws.s3.BucketObject('index', {
			bucket: bucket,
			content: content,
			contentType: 'text/html; charset=utf-8',
			key: 'index.html',
		});

		// Configure bucket policy to allow public access
		function publicReadPolicyForBucket(bucketArn: string): aws.iam.PolicyDocument {
			return {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Principal: '*',
						Action: ['s3:GetObject'],
						Resource: [`${bucketArn}/*`],
					},
				],
			};
		}

		// Register bucket policy
		new aws.s3.BucketPolicy('bucket-contents-policy', {
			bucket: bucket.bucket,
			policy: bucket.arn.apply(publicReadPolicyForBucket),
		});

		// Export the Internet address for the service.
		return {
			url: bucket.websiteEndpoint,
		};
	};

const initStack = getStack(
	{
		program: emptyProgram,
		projectName: 'CentralizedWebPage',
		stackName: 'CentralizedWebPage',
	},
	undefined,
	{ 'aws:region': { value: 'us-east-1' } }
);

runDeployment(initStack, operations(programState.map(program)), (offerUpdates) =>
	nextAction(
		combine(offerUpdates, changes(programState, isDeepStrictEqual).mapTo(undefined)),
		sigquit(),
		sigint()
	)
);
