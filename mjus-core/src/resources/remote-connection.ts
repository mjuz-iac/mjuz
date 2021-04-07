import { CustomResourceOptions, dynamic, ID, Output } from '@pulumi/pulumi';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { updateRemote, deleteRemote } from '../resources-service';

/**
 * Name and id of `RemoteConnection resources equal.
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 19952;

export type RemoteConnectionProps = {
	name: string;
	host: string;
	port: number;
	error: string | null; // Workaround to indicate error in resource provider
};

export class RemoteConnectionProvider implements dynamic.ResourceProvider {
	// Problem: If this method fails Pulumi exits with promise leak errors, even though this actually should mean
	// the deployment did not run through. For now: make sure this function won't reject. For debugging, we use an error
	// input property.

	async create(
		props: RemoteConnectionProps
	): Promise<dynamic.CreateResult & { outs: RemoteConnectionProps }> {
		try {
			await updateRemote({ id: props.name, host: props.host, port: props.port });

			const outProps: RemoteConnectionProps = {
				...props,
				error: null,
			};
			return { id: props.name, outs: outProps };
		} catch (e) {
			return { id: props.name, outs: { ...props, error: e.message } };
		}
	}

	async diff(
		id: ID,
		oldProps: RemoteConnectionProps,
		newProps: RemoteConnectionProps
	): Promise<dynamic.DiffResult> {
		return {
			changes: true, // always trigger update
			replaces: [oldProps.name !== newProps.name ? 'name' : null].filter(
				(v) => v !== null
			) as string[],
			deleteBeforeReplace: true,
		};
	}

	async update(
		id: ID,
		oldProps: RemoteConnectionProps,
		newProps: RemoteConnectionProps
	): Promise<dynamic.UpdateResult> {
		return this.create(newProps);
	}

	async delete(id: ID, props: RemoteConnectionProps): Promise<void> {
		await deleteRemote({ id: props.name, host: props.host, port: props.port });
	}
}

export type RemoteConnectionArgs = Partial<
	WrappedInputs<Omit<RemoteConnectionProps, 'name' | 'error'>>
>;
type RemoteConnectionOutputs = Readonly<WrappedOutputs<Omit<RemoteConnectionProps, 'name'>>>;
export class RemoteConnection extends dynamic.Resource implements RemoteConnectionOutputs {
	constructor(name: string, args: RemoteConnectionArgs, opts?: CustomResourceOptions) {
		const props: WrappedInputs<RemoteConnectionProps> = {
			...args,
			host: args.host || DEFAULT_HOST,
			port: args.port || DEFAULT_PORT,
			name: name,
			error: null,
		};
		super(new RemoteConnectionProvider(), name, props, opts);
		this.name = name;
	}

	public readonly name: string;
	public readonly host!: Output<string>;
	public readonly port!: Output<number>;
	public readonly error!: Output<null | string>;
}
