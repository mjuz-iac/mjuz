import { CustomResourceOptions, dynamic, Input, Output } from '@pulumi/pulumi';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { RemoteConnection } from '..';

type WishInputs<O> = {
	offerName: string;
	target: RemoteConnection;
	value: O;
};

class WishProvider<O> implements dynamic.ResourceProvider {
	async create(
		inputs: WishInputs<O> // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: WishInputs<O> }> {
		const offer: unknown = 'website-40eae63';
		return { id: `${inputs.target}:${inputs.offerName}`, outs: { ...inputs, value: <O>offer } };
	}
}

export type WishArgs = WrappedInputs<Omit<WishInputs<unknown>, 'value'>>;
type WishProps<O> = Readonly<WrappedOutputs<WishInputs<O>>>;
export class Wish<O> extends dynamic.Resource implements WishProps<O> {
	constructor(target: Input<RemoteConnection>, offerName: string, opts?: CustomResourceOptions);
	constructor(name: string, props: WishArgs, opts?: CustomResourceOptions);
	constructor(
		nameOrTarget: string | Input<RemoteConnection>,
		argsOrOfferName: WishArgs | string,
		opts?: CustomResourceOptions
	) {
		const [name, args]: [string, WrappedInputs<WishInputs<null>> | undefined] =
			typeof nameOrTarget === 'string' && typeof argsOrOfferName !== 'string'
				? [nameOrTarget, { ...argsOrOfferName, value: null }]
				: nameOrTarget !== 'string' && typeof argsOrOfferName === 'string'
				? [
						`${(<RemoteConnection>nameOrTarget).name}:${argsOrOfferName}`,
						{
							offerName: argsOrOfferName,
							target: <Input<RemoteConnection>>nameOrTarget,
							value: null,
						},
				  ]
				: ['invalid wish configuration', undefined];
		if (!args) throw new Error('Unsupported wish configuration');
		super(new WishProvider<O>(), name, args, opts);
	}

	public readonly offerName!: Output<string>;
	public readonly target!: Output<RemoteConnection>;
	public readonly value!: Output<O>;
}
