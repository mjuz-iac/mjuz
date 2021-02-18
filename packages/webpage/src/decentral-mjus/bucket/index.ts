import {
	emptyProgram,
	getStack,
	nextAction,
	Offer,
	operations,
	RemoteConnection,
	runDeployment,
	sigint,
	sigterm,
} from '@mjus/core';
import { Behavior, empty } from '@funkia/hareactive';
import * as aws from '@pulumi/aws';

const program = async () => {
	// Create a bucket and expose a website index document
	const bucket = new aws.s3.Bucket('website', {
		website: {
			indexDocument: 'index.html',
		},
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

	const contentManager = new RemoteConnection('content', {});
	new Offer(contentManager, 'bucket', bucket);

	// Export the Internet address for the service.
	return {
		url: bucket.websiteEndpoint,
	};
};

const initStack = () =>
	getStack(
		{
			program: emptyProgram,
			projectName: 'DecentralizedWebPageBucket',
			stackName: 'DecentralizedWebPageBucket',
		},
		{ workDir: '.' },
		{ 'aws:region': { value: 'us-east-1' } }
	);

runDeployment(initStack, operations(Behavior.of(program)), nextAction(empty, sigint(), sigterm()));
