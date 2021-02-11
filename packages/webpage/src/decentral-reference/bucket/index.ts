import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

/**
 * Based on inline program ts pulumi automation API example: https://github.com/pulumi/automation-api-examples/tree/main/nodejs/inlineProgram-ts
 */

// Create a bucket and expose a website index document
const bucket = new aws.s3.Bucket('website', {
	website: {
		indexDocument: 'index.html',
	},
});
export const bucketId = bucket.id;

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
export const url = bucket.websiteEndpoint;
