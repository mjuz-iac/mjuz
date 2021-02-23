import {
	Action,
	emptyProgram,
	getStack,
	reactionLoop,
	nextAction,
	operations,
	Stack,
} from '../src';
import { runIO } from '@funkia/io';
import { Behavior, empty, sinkFuture, sinkStream } from '@funkia/hareactive';
import { LocalWorkspace } from '@pulumi/pulumi/x/automation';

describe('reaction runtime and pulumi integration', () => {
	const initOperation = () =>
		getStack({
			stackName: 'testStack',
			projectName: 'testProject',
			program: emptyProgram,
		});
	const simplifyStack = (stack: Stack) => {
		return {
			name: stack.stack.name,
			isDeployed: stack.isDeployed,
			isDestroyed: stack.isDestroyed,
		};
	};

	afterEach(() => {
		return runIO(initOperation())
			.then((stack) => stack.stack.destroy())
			.then(() => LocalWorkspace.create({}))
			.then((workspace) => workspace.removeStack('testStack'));
	});

	test('init and terminate', () => {
		let ops = 0;
		const terminate = sinkFuture();
		const l = reactionLoop<Stack>(
			initOperation,
			(action: Action) => {
				ops++;
				if (ops === 1) terminate.resolve(true);
				return operations(Behavior.of(emptyProgram))(action);
			},
			nextAction(empty, terminate, sinkFuture())
		)[0];
		return expect(runIO(l.map(simplifyStack)))
			.resolves.toEqual({ name: 'testStack', isDeployed: true, isDestroyed: false })
			.then(() => expect(ops).toBe(2));
	});

	test('init, deploy twice and terminate', () => {
		let ops = 0;
		const stateChanges = sinkStream();
		const terminate = sinkFuture();
		const l = reactionLoop<Stack>(
			initOperation,
			(action: Action) => {
				ops++;
				if (ops < 3) stateChanges.push(true);
				if (ops === 3) terminate.resolve(true);
				return operations(Behavior.of(emptyProgram))(action);
			},
			nextAction(stateChanges, terminate, sinkFuture())
		)[0];
		return expect(runIO(l.map(simplifyStack)))
			.resolves.toEqual({ name: 'testStack', isDeployed: true, isDestroyed: false })
			.then(() => expect(ops).toBe(4));
	});

	test('init and destroy', () => {
		let ops = 0;
		const destroy = sinkFuture();
		const l = reactionLoop<Stack>(
			initOperation,
			(action: Action) => {
				ops++;
				if (ops === 1) destroy.resolve(true);
				return operations(Behavior.of(emptyProgram))(action);
			},
			nextAction(empty, sinkFuture(), destroy)
		)[0];
		return expect(runIO(l.map(simplifyStack)))
			.resolves.toEqual({ name: 'testStack', isDeployed: false, isDestroyed: true })
			.then(() => expect(ops).toBe(2));
	});

	test('init, deploy twice and destroy', () => {
		let ops = 0;
		const stateChanges = sinkStream();
		const destroy = sinkFuture();
		const l = reactionLoop<Stack>(
			initOperation,
			(action: Action) => {
				ops++;
				if (ops < 3) stateChanges.push(true);
				if (ops === 3) destroy.resolve(true);
				return operations(Behavior.of(emptyProgram))(action);
			},
			nextAction(stateChanges, sinkFuture(), destroy)
		)[0];
		return expect(runIO(l.map(simplifyStack)))
			.resolves.toEqual({ name: 'testStack', isDeployed: false, isDestroyed: true })
			.then(() => expect(ops).toBe(4));
	});
});
