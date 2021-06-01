import { CustomResourceOptions, dynamic, ID, Output } from '@pulumi/pulumi';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { updateRemote, deleteRemote, refreshRemote, Remote } from '../resources-service';
import { CheckResult } from '@pulumi/pulumi/dynamic';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 19952;

export type RemoteConnectionProps = {
	remoteId: string;
	host: string;
	port: number;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isRemoteConnectionProps = (v: any): v is RemoteConnectionProps =>
	typeof v === 'object' &&
	v !== null &&
	typeof v.remoteId === 'string' &&
	typeof v.host === 'string' &&
	typeof v.port === 'number';
const toRemote = (props: RemoteConnectionProps): Remote => {
	return {
		id: props.remoteId,
		host: props.host,
		port: props.port,
	};
};
export class RemoteConnectionProvider implements dynamic.ResourceProvider {
	async check(
		oldProps: unknown | RemoteConnectionProps,
		newProps: RemoteConnectionProps
	): Promise<CheckResult & { inputs: RemoteConnectionProps }> {
		if (isRemoteConnectionProps(oldProps)) await refreshRemote(toRemote(oldProps));
		return { inputs: newProps };
	}

	async create(
		props: RemoteConnectionProps
	): Promise<dynamic.CreateResult & { outs: RemoteConnectionProps }> {
		await updateRemote(toRemote(props));
		return { id: props.remoteId, outs: props };
	}

	async diff(
		id: ID,
		oldProps: RemoteConnectionProps,
		newProps: RemoteConnectionProps
	): Promise<dynamic.DiffResult> {
		return {
			changes:
				['remoteId' as const, 'host' as const, 'port' as const].filter(
					(field) => oldProps[field] !== newProps[field]
				).length > 0,
			replaces: oldProps.remoteId !== newProps.remoteId ? ['remoteId'] : [],
			deleteBeforeReplace: true,
		};
	}

	async update(
		id: ID,
		oldProps: RemoteConnectionProps,
		newProps: RemoteConnectionProps
	): Promise<dynamic.UpdateResult & { outs: RemoteConnectionProps }> {
		await updateRemote(toRemote(newProps));
		return { outs: newProps };
	}

	async delete(id: ID, props: RemoteConnectionProps): Promise<void> {
		await deleteRemote(toRemote(props));
	}
}

export type RemoteConnectionArgs = Partial<
	WrappedInputs<Omit<RemoteConnectionProps, 'remoteId'>> & { remoteId: string }
>;
export type RemoteConnectionOutputs = Readonly<
	WrappedOutputs<Omit<RemoteConnectionProps, 'remoteId'>> & { remoteId: string }
>;
export class RemoteConnection extends dynamic.Resource implements RemoteConnectionOutputs {
	constructor(name: string, args: RemoteConnectionArgs, opts?: CustomResourceOptions) {
		const props: WrappedInputs<RemoteConnectionProps> = {
			remoteId: args.remoteId || name,
			host: args.host || DEFAULT_HOST,
			port: args.port || DEFAULT_PORT,
		};
		super(new RemoteConnectionProvider(), `remote-connection$${name}`, props, opts);
		this.remoteId = args.remoteId || name;
	}

	public readonly remoteId: string;
	public readonly host!: Output<string>;
	public readonly port!: Output<number>;
}
