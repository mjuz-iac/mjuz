import {
	emptyProgram,
	getStack,
	keepAlive,
	newLogger,
	nextAction,
	operations,
	reactionLoop,
	RemoteConnection,
	sigint,
	sigterm,
	Wish,
} from '@mjus/core';
import { Behavior, empty } from '@funkia/hareactive';
import { runIO } from '@funkia/io';
import * as aws from '@pulumi/aws';

const logger = newLogger('deployment');

const program = async () => {
	const bucketManager = new RemoteConnection('bucket', {});
	const bucketWish = new Wish<aws.s3.Bucket>(bucketManager, 'bucket');

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
	const index = new aws.s3.BucketObject('index', {
		bucket: bucketWish.value,
		content: content,
		contentType: 'text/html; charset=utf-8',
		key: 'index.html',
	});

	return {
		indexId: index.id,
	};
};

const initStack = () =>
	getStack(
		{
			program: emptyProgram,
			projectName: 'DecentralizedWebPageContent',
			stackName: 'DecentralizedWebPageContent',
		},
		{ workDir: '.' },
		{ 'aws:region': { value: 'us-east-1' } }
	);

const deployment = reactionLoop(
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
