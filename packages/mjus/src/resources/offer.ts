import { CustomResourceOptions, dynamic, Input, Output } from '@pulumi/pulumi';
import { RemoteConnection, WrappedInputs, WrappedOutputs } from '..';

type OfferInputs<O> = {
	beneficiary: RemoteConnection;
	offerName: string;
	offer: O;
};
type OfferOutputs<O> = OfferInputs<O>;

class OfferProvider<O> implements dynamic.ResourceProvider {
	async create(
		inputs: OfferInputs<O> // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: OfferOutputs<O> }> {
		return { id: `${inputs.beneficiary}:${inputs.offerName}`, outs: inputs };
	}
}

type OfferArgs<O> = WrappedInputs<OfferInputs<O>>;
type OfferProps<O> = Readonly<WrappedOutputs<OfferOutputs<O>>>;
export class Offer<O> extends dynamic.Resource implements OfferProps<O> {
	constructor(
		beneficiary: Input<RemoteConnection>,
		offerName: string,
		offer: Input<O>,
		opts?: CustomResourceOptions
	);
	constructor(name: string, props: OfferArgs<O>, opts?: CustomResourceOptions);
	constructor(
		nameOrBeneficiary: string | Input<RemoteConnection>,
		argsOrOfferName: OfferArgs<O> | string,
		optsOrOffer: CustomResourceOptions | Input<O>,
		opts?: CustomResourceOptions
	) {
		if (typeof nameOrBeneficiary === 'string' && typeof argsOrOfferName !== 'string')
			super(
				new OfferProvider<O>(),
				nameOrBeneficiary,
				argsOrOfferName,
				<CustomResourceOptions>optsOrOffer
			);
		else if (typeof nameOrBeneficiary !== 'string' && typeof argsOrOfferName === 'string')
			super(
				new OfferProvider<O>(),
				`${(<RemoteConnection>nameOrBeneficiary).name}:${argsOrOfferName}`,
				{
					beneficiary: nameOrBeneficiary,
					offerName: argsOrOfferName,
					offer: optsOrOffer,
				},
				opts
			);
		else throw new Error('Unsupported offer configuration');
	}

	public readonly beneficiary!: Output<RemoteConnection>;
	public readonly offerName!: Output<string>;
	public readonly offer!: Output<O>;
}
