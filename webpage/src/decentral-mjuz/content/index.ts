import {
	emptyProgram,
	getStack,
	nextAction,
	operations,
	runDeployment,
	sigint,
	sigquit,
} from '@mjuz/core';
import { RemoteConnection, Wish } from '@mjuz/core/resources';
import { Behavior } from '@funkia/hareactive';
import * as aws from '@pulumi/aws';

const program = async () => {
	const bucketManager = new RemoteConnection('bucket', { port: 19952 });
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
		bucket: bucketWish.offer,
		content: content,
		contentType: 'text/html; charset=utf-8',
		key: 'index.html',
	});

	return {
		indexId: index.id,
	};
};

const initStack = getStack(
	{
		program: emptyProgram,
		projectName: 'DecentralizedWebPageContent',
		stackName: 'DecentralizedWebPageContent',
	},
	{ workDir: '.' },
	{ 'aws:region': { value: 'us-east-1' } }
);

runDeployment(
	initStack,
	operations(Behavior.of(program)),
	(offerUpdates) => nextAction(offerUpdates, sigquit(), sigint()),
	{ deploymentName: 'content', resourcesPort: 19953, deploymentPort: 19954 }
);
