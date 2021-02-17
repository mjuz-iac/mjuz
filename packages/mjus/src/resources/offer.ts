import { CustomResourceOptions, dynamic, Input, Output } from '@pulumi/pulumi';
import { Remote, WrappedInputs, WrappedOutputs } from '..';

type OfferInputs<O> = {
	beneficiary: Remote;
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
		beneficiary: Input<Remote>,
		offerName: string,
		offer: Input<O>,
		opts?: CustomResourceOptions
	);
	constructor(name: string, props: OfferArgs<O>, opts?: CustomResourceOptions);
	constructor(
		nameOrBeneficiary: string | Input<Remote>,
		propsOrOfferName: OfferArgs<O> | string,
		optsOrOffer: CustomResourceOptions | Input<O>,
		opts?: CustomResourceOptions
	) {
		if (typeof nameOrBeneficiary === 'string' && typeof propsOrOfferName !== 'string')
			super(
				new OfferProvider<O>(),
				nameOrBeneficiary,
				propsOrOfferName,
				<CustomResourceOptions>optsOrOffer
			);
		else if (typeof nameOrBeneficiary !== 'string' && typeof propsOrOfferName === 'string')
			super(
				new OfferProvider<O>(),
				`${(<Remote>nameOrBeneficiary).name}:${propsOrOfferName}`,
				{
					beneficiary: nameOrBeneficiary,
					offerName: propsOrOfferName,
					offer: optsOrOffer,
				},
				opts
			);
		else throw new Error('Unsupported offer configuration');
	}

	public readonly beneficiary!: Output<Remote>;
	public readonly offerName!: Output<string>;
	public readonly offer!: Output<O>;
}
