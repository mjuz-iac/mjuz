import {
	emptyProgram,
	getStack,
	keepAlive,
	loop,
	newLogger,
	nextAction,
	operations,
	sigint,
	sigterm,
} from '@mjus/core';
import { at, changes, sinkBehavior } from '@funkia/hareactive';
import { runIO } from '@funkia/io';
import * as aws from '@pulumi/aws';
import { PulumiFn } from '@pulumi/pulumi/x/automation';
import { isDeepStrictEqual } from 'util';

const logger = newLogger('deployment');

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

const program = (state: State): PulumiFn => async () => {
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

const initStack = () =>
	getStack(
		{
			program: emptyProgram,
			projectName: 'CentralizedWebPage',
			stackName: 'CentralizedWebPage',
		},
		undefined,
		{ 'aws:region': { value: 'us-east-1' } }
	);

const deployment = loop(
	initStack,
	operations(programState.map(program)),
	nextAction(changes(programState, isDeepStrictEqual), sigint(), sigterm())
);

runIO(deployment)
	.catch((err) => {
		logger.error(err, 'Deployment error');
		process.exit(1);
	})
	.finally(() => {
		logger.info('Deployment terminated');
		process.exit(0);
	});
keepAlive();
