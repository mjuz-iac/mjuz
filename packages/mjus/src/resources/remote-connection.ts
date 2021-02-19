import { CustomResourceOptions, dynamic, ID, Output } from '@pulumi/pulumi';
import * as rpc from '@mjus/grpc-protos';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { createRemote, deleteRemote } from '../runtime-offers';

/**
 * Name and id of `RemoteConnection resources equal.
 */

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 19952;

type RemoteConnectionInputs = {
	name: string;
	host: string;
	port: number;
	error: string | null; // Workaround to indicate error in resource provider
};

const remoteConnectionProvider: dynamic.ResourceProvider = {
	// Problem: If this method fails Pulumi exits with promise leak errors, even though this actually should mean
	// the deployment did not run through. For now: make sure this function won't reject. For debugging, we use an error
	// input property.
	async create(
		inputs: RemoteConnectionInputs
	): Promise<dynamic.CreateResult & { outs: RemoteConnectionInputs }> {
		try {
			const remote = new rpc.Remote()
				.setId(inputs.name)
				.setHost(inputs.host)
				.setPort(inputs.port);
			await createRemote(remote);

			return { id: inputs.name, outs: inputs };
		} catch (e) {
			return { id: inputs.name, outs: { ...inputs, error: e.message } };
		}
	},

	async delete(id: ID): Promise<void> {
		const remote = new rpc.Remote().setId(id);
		await deleteRemote(remote);
	},
};

export type RemoteConnectionArgs = Partial<
	WrappedInputs<Omit<RemoteConnectionInputs, 'name' | 'error'>>
>;
type RemoteConnectionProps = Readonly<WrappedOutputs<Omit<RemoteConnectionInputs, 'name'>>>;
export class RemoteConnection extends dynamic.Resource implements RemoteConnectionProps {
	constructor(name: string, args: RemoteConnectionArgs, opts?: CustomResourceOptions) {
		if (!args.host) args.host = DEFAULT_HOST;
		if (!args.port) args.port = DEFAULT_PORT;
		super(remoteConnectionProvider, name, { ...args, name: name, error: null }, opts);
		this.name = name;
	}

	public readonly name: string;
	public readonly host!: Output<string>;
	public readonly port!: Output<number>;
	public readonly error!: Output<null | string>;
}
