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
import { Behavior, empty } from '@funkia/hareactive';
import { runIO } from '@funkia/io';
import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

const logger = newLogger('deployment');

const program = async () => {
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
};

const initStack = () =>
	getStack(
		{
			program: emptyProgram,
			projectName: 'DecentralizedWebPageContent',
			stackName: 'DecentralizedWebPageContent',
		},
		undefined,
		{
			'aws:region': { value: 'us-east-1' },
			bucketStack: { value: 'DecentralizedWebPageBucket' },
		}
	);

const deployment = loop(
	initStack,
	operations(Behavior.of(program)),
	nextAction(empty, sigint(), sigterm())
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
