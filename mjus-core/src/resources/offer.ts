import { CustomResourceOptions, dynamic, ID, Input, Output } from '@pulumi/pulumi';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';
import * as rpc from '@mjus/grpc-protos';
import { deleteOffer, refreshOffer, updateOffer } from '../resources-service';
import { RemoteConnection } from './remote-connection';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { isDeepStrictEqual } from 'util';

export type OfferProps<O> = {
	beneficiary: RemoteConnection;
	offerName: string;
	offer: O;
	error: string | null; // Workaround to indicate error in resource provider
};

export class OfferProvider<O> implements dynamic.ResourceProvider {
	private static offerToValue = <O>(offer: O): Value =>
		Value.fromJavaScript(offer === undefined ? null : offer);

	// Problem: If this method fails Pulumi exits with promise leak errors, even though this actually should mean
	// the deployment did not run through. For now: make sure this function won't reject. For debugging, we use an error
	// input property.
	async create(
		inputs: OfferProps<O> // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: OfferProps<O> }> {
		try {
			const offer = new rpc.Offer()
				.setName(inputs.offerName)
				.setBeneficiaryid(`${inputs.beneficiary}`)
				.setOffer(OfferProvider.offerToValue(inputs.offer));
			await updateOffer(offer);

			const outProps: OfferProps<O> = {
				...inputs,
				error: null,
			};
			return { id: `${inputs.beneficiary}:${inputs.offerName}`, outs: outProps };
		} catch (e) {
			return {
				id: `${inputs.beneficiary}:${inputs.offerName}`,
				outs: { ...inputs, error: e.message },
			};
		}
	}

	async diff(
		id: ID,
		oldProps: OfferProps<O>,
		newProps: OfferProps<O>
	): Promise<dynamic.DiffResult> {
		const offer = new rpc.Offer()
			.setName(oldProps.offerName)
			.setBeneficiaryid(`${oldProps.beneficiary}`)
			.setOffer(OfferProvider.offerToValue(oldProps.offer));
		await refreshOffer(offer);
		const replaces = [
			...(oldProps.beneficiary !== newProps.beneficiary ? ['beneficiary'] : []),
			...(oldProps.offerName !== newProps.offerName ? ['offerName'] : []),
		];
		const offerChanged = !isDeepStrictEqual(oldProps.offer, newProps.offer);

		return {
			changes: replaces.length > 0 || offerChanged,
			replaces,
			deleteBeforeReplace: true,
		};
	}

	async update(
		id: ID,
		oldProps: OfferProps<O>,
		newProps: OfferProps<O>
	): Promise<dynamic.UpdateResult> {
		try {
			const offer = new rpc.Offer()
				.setName(newProps.offerName)
				.setBeneficiaryid(`${newProps.beneficiary}`)
				.setOffer(OfferProvider.offerToValue(newProps.offer));
			await updateOffer(offer);

			const outProps: OfferProps<O> = {
				...newProps,
				error: null,
			};
			return { outs: outProps };
		} catch (e) {
			return { outs: { ...oldProps, error: e.message } };
		}
	}

	async delete(id: ID, inputs: OfferProps<O>): Promise<void> {
		const offer = new rpc.Offer()
			.setName(inputs.offerName)
			.setBeneficiaryid(`${inputs.beneficiary}`)
			.setOffer(OfferProvider.offerToValue(inputs.offer));
		await deleteOffer(offer);
	}
}

type OfferArgs<O> = WrappedInputs<Omit<OfferProps<O>, 'error'>>;
type OfferOutputs<O> = Readonly<WrappedOutputs<OfferProps<O>>>;
export class Offer<O> extends dynamic.Resource implements OfferOutputs<O> {
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
				: [
						`${(<RemoteConnection>nameOrBeneficiary).name}:${argsOrOfferName}`,
						{
							beneficiary: nameOrBeneficiary as Input<RemoteConnection>,
							offerName: argsOrOfferName as string,
							offer: <Input<O>>optsOrOffer,
						},
						opts,
				  ];
		const props: WrappedInputs<OfferProps<O>> = {
			...args,
			error: null,
		};
		super(new OfferProvider<O>(), name, props, opt);
	}

	public readonly beneficiary!: Output<RemoteConnection>;
	public readonly offerName!: Output<string>;
	public readonly offer!: Output<O>;
	public readonly error!: Output<string | null>;
}
