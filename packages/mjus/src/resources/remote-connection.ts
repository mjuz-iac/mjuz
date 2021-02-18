import { CustomResourceOptions, dynamic } from '@pulumi/pulumi';
import { WrappedInputs, WrappedOutputs } from '../type-utils';

/**
 * Name and id of `RemoteConnection resources equal.
 */

type RemoteConnectionInputs = {
	name: string;
};
type RemoteConnectionOutputs = RemoteConnectionInputs;

const remoteConnectionProvider: dynamic.ResourceProvider = {
	async create(
		inputs: RemoteConnectionInputs
	): Promise<dynamic.CreateResult & { outs: RemoteConnectionOutputs }> {
		return { id: inputs.name, outs: inputs };
	},
};

export type RemoteConnectionArgs = WrappedInputs<Omit<RemoteConnectionInputs, 'name'>>;
type RemoteConnectionProps = Readonly<WrappedOutputs<Omit<RemoteConnectionOutputs, 'name'>>>;
export class RemoteConnection extends dynamic.Resource implements RemoteConnectionProps {
	constructor(
		public readonly name: string,
		args: RemoteConnectionArgs,
		opts?: CustomResourceOptions
	) {
		super(remoteConnectionProvider, name, { ...args, name: name }, opts);
	}
}
