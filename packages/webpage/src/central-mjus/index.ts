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
import { empty } from '@funkia/hareactive';
import { runIO } from '@funkia/io';

const logger = newLogger('deployment');

const program = emptyProgram;

const initStack = () =>
	getStack({
		program: program,
		projectName: 'CentralizedWebPage',
		stackName: 'CentralizedWebPage',
	});

const deployment = loop(initStack, operations(program), nextAction(empty, sigint, sigterm));

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
