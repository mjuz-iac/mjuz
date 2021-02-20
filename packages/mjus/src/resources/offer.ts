import { CustomResourceOptions, dynamic, ID, Input, Output } from '@pulumi/pulumi';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';
import * as rpc from '@mjus/grpc-protos';
import { deleteOffer, updateOffer } from '../runtime-offers';
import { RemoteConnection } from './remote-connection';
import { WrappedInputs, WrappedOutputs } from '../type-utils';

type OfferInputs<O> = {
	beneficiary: RemoteConnection;
	offerName: string;
	offer: O;
	error: string | null; // Workaround to indicate error in resource provider
};

class OfferProvider<O> implements dynamic.ResourceProvider {
	// Problem: If this method fails Pulumi exits with promise leak errors, even though this actually should mean
	// the deployment did not run through. For now: make sure this function won't reject. For debugging, we use an error
	// input property.
	async create(
		inputs: OfferInputs<O> // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: OfferInputs<O> }> {
		try {
			const offer = new rpc.Offer()
				.setName(inputs.offerName)
				.setBeneficiaryid(`${inputs.beneficiary}`)
				.setOffer(Value.fromJavaScript(inputs.offer || null));
			await updateOffer(offer);

			return { id: `${inputs.beneficiary}:${inputs.offerName}`, outs: inputs };
		} catch (e) {
			return {
				id: `${inputs.beneficiary}:${inputs.offerName}`,
				outs: { ...inputs, error: e.message },
			};
		}
	}

	async delete(id: ID, inputs: OfferInputs<O>): Promise<void> {
		const offer = new rpc.Offer()
			.setName(inputs.offerName)
			.setBeneficiaryid(`${inputs.beneficiary}`);
		await deleteOffer(offer);
	}
}

type OfferArgs<O> = WrappedInputs<Omit<OfferInputs<O>, 'error'>>;
type OfferProps<O> = Readonly<WrappedOutputs<OfferInputs<O>>>;
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
		const [name, args, opt]: [
			string,
			OfferArgs<O> | undefined,
			CustomResourceOptions | undefined
		] =
			typeof nameOrBeneficiary === 'string' && typeof argsOrOfferName !== 'string'
				? [nameOrBeneficiary, argsOrOfferName, <CustomResourceOptions>optsOrOffer]
				: typeof nameOrBeneficiary !== 'string' && typeof argsOrOfferName === 'string'
				? [
						`${(<RemoteConnection>nameOrBeneficiary).name}:${argsOrOfferName}`,
						{
							beneficiary: nameOrBeneficiary,
							offerName: argsOrOfferName,
							offer: <Input<O>>optsOrOffer,
						},
						opts,
				  ]
				: ['invalid offer configuration', undefined, undefined];
		if (!args) throw new Error('Unsupported offer configuration');
		super(new OfferProvider<O>(), name, { ...args, error: null }, opt);
	}

	public readonly beneficiary!: Output<RemoteConnection>;
	public readonly offerName!: Output<string>;
	public readonly offer!: Output<O>;
	public readonly error!: Output<string | null>;
}
