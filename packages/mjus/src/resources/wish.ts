import { CustomResourceOptions, dynamic, Input, Output } from '@pulumi/pulumi';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { RemoteConnection } from '..';

type WishInputs = {
	offerName: string;
	target: RemoteConnection;
};
type WishOutputs<O> = WishInputs & {
	value: O;
};

class WishProvider<O> implements dynamic.ResourceProvider {
	async create(
		inputs: WishInputs // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: WishOutputs<O> }> {
		const offer: unknown = 'offer';
		return { id: `${inputs.target}:${inputs.offerName}`, outs: { ...inputs, value: <O>offer } };
	}
}

export type WishArgs = WrappedInputs<WishInputs>;
type WishProps<O> = Readonly<WrappedOutputs<WishOutputs<O>>>;
export class Wish<O> extends dynamic.Resource implements WishProps<O> {
	constructor(target: Input<RemoteConnection>, offerName: string, opts?: CustomResourceOptions);
	constructor(name: string, props: WishArgs, opts?: CustomResourceOptions);
	constructor(
		nameOrTarget: string | Input<RemoteConnection>,
		argsOrOfferName: WishArgs | string,
		opts?: CustomResourceOptions
	) {
		if (typeof nameOrTarget === 'string' && typeof argsOrOfferName !== 'string')
			super(new WishProvider<O>(), nameOrTarget, argsOrOfferName, opts);
		else if (typeof nameOrTarget !== 'string' && typeof argsOrOfferName === 'string')
			super(
				new WishProvider<O>(),
				`${(<RemoteConnection>nameOrTarget).name}:${argsOrOfferName}`,
				{
					offerName: argsOrOfferName,
					target: nameOrTarget,
				},
				opts
			);
		else throw new Error('Unsupported wish configuration');
	}

	public readonly offerName!: Output<string>;
	public readonly target!: Output<RemoteConnection>;
	public readonly value!: Output<O>;
}
