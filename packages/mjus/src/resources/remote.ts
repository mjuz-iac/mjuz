import { CustomResourceOptions, dynamic } from '@pulumi/pulumi';
import { Without, WrappedInputs, WrappedOutputs } from '../type-utils';

/**
 * Name and id of Remote resources equal.
 */

type RemoteInputs = {
	name: string;
};
type RemoteOutputs = RemoteInputs;

const remoteProvider: dynamic.ResourceProvider = {
	async create(inputs: RemoteInputs): Promise<dynamic.CreateResult & { outs: RemoteOutputs }> {
		return { id: inputs.name, outs: inputs };
	},
};

type RemoteArgs = WrappedInputs<Without<RemoteInputs, 'name'>>;
type RemoteProps = Readonly<WrappedOutputs<Without<RemoteOutputs, 'name'>>>;
export class Remote extends dynamic.Resource implements RemoteProps {
	constructor(public readonly name: string, args: RemoteArgs, opts?: CustomResourceOptions) {
		super(remoteProvider, name, { ...args, name: name }, opts);
	}
}
