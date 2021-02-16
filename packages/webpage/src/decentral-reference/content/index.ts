import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';

const config = new pulumi.Config();
const bucketStackName = config.require('bucketStack');
const bucketStack = new pulumi.StackReference(bucketStackName);
const bucketId = bucketStack.getOutput('bucketId');

const content = `<html>
	<head>
		<title>Hello World! 👋🌍</title>
		<meta charset="UTF-8">
	</head>
	<body>
		<p>Hello World! 👋🌍</p>
	</body>
</html>`;
// write our index.html into the site bucket
new aws.s3.BucketObject('index', {
	bucket: bucketId,
	content: content,
	contentType: 'text/html; charset=utf-8',
	key: 'index.html',
});
