import {
	emptyProgram,
	getStack,
	nextAction,
	operations,
	RemoteConnection,
	runDeployment,
	sigint,
	sigterm,
	Wish,
} from '@mjus/core';
import { Behavior, empty } from '@funkia/hareactive';
import * as aws from '@pulumi/aws';

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

runDeployment(initStack, operations(Behavior.of(program)), nextAction(empty, sigint(), sigterm()));
