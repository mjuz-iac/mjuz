import { CustomResourceOptions, dynamic, ID, Input, Inputs, Output } from '@pulumi/pulumi';
import { deleteOffer, Offer as RsOffer, refreshOffer, updateOffer } from '../resources-service';
import { RemoteConnection } from './remote-connection';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { isDeepStrictEqual } from 'util';
import { CheckResult } from '@pulumi/pulumi/dynamic';

export type OfferProps<O> = {
	beneficiaryId: string;
	offerName: string;
	offer: O;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isOfferProps = <O>(v: any): v is OfferProps<O> =>
	typeof v === 'object' &&
	v !== null &&
	typeof v.beneficiaryId === 'string' &&
	typeof v.offerName === 'string' &&
	'offer' in v;
const toRsOffer = <O>(props: OfferProps<O>): RsOffer<O> => {
	return {
		beneficiaryId: props.beneficiaryId,
		name: props.offerName,
		offer: props.offer,
	};
};
export class OfferProvider<O> implements dynamic.ResourceProvider {
	async check(oldProps: unknown | OfferProps<O>, newProps: OfferProps<O>): Promise<CheckResult> {
		if (isOfferProps(oldProps)) await refreshOffer(toRsOffer(oldProps));
		return { inputs: newProps };
	}

	async create(props: OfferProps<O>): Promise<dynamic.CreateResult & { outs: OfferProps<O> }> {
		await updateOffer(toRsOffer(props));
		return { id: `${props.beneficiaryId}:${props.offerName}`, outs: props };
	}

	async diff(
		id: ID,
		oldProps: OfferProps<O>,
		newProps: OfferProps<O>
	): Promise<dynamic.DiffResult> {
		const replaces = ['beneficiaryId' as const, 'offerName' as const].filter(
			(field) => oldProps[field] !== newProps[field]
		);
		const offerChanged = !isDeepStrictEqual(oldProps.offer, newProps.offer);
		return {
			changes: replaces.length > 0 || offerChanged,
			replaces: replaces,
			deleteBeforeReplace: true,
		};
	}

	async update(
		id: ID,
		oldProps: OfferProps<O>,
		newProps: OfferProps<O>
	): Promise<dynamic.UpdateResult & { outs: OfferProps<O> }> {
		await updateOffer(toRsOffer(newProps));
		return { outs: newProps };
	}

	async delete(id: ID, props: OfferProps<O>): Promise<void> {
		await deleteOffer({ beneficiaryId: props.beneficiaryId, name: props.offerName });
	}
}

export type OfferArgs<O> = WrappedInputs<
	Omit<OfferProps<O>, 'beneficiaryId'> & { beneficiary: RemoteConnection }
>;
export type OfferOutputs<O> = Readonly<WrappedOutputs<OfferProps<O>>>;
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
		const [name, props, opt]: [string, Inputs, CustomResourceOptions | undefined] =
			typeof nameOrBeneficiary === 'string' && typeof argsOrOfferName !== 'string'
				? [nameOrBeneficiary, argsOrOfferName, <CustomResourceOptions>optsOrOffer]
				: [
						`${(<RemoteConnection>nameOrBeneficiary).remoteId}:${argsOrOfferName}`,
						{
							beneficiary: nameOrBeneficiary as Input<RemoteConnection>,
							offerName: argsOrOfferName as string,
							offer: <Input<O>>optsOrOffer,
						} as OfferArgs<O>,
						opts,
				  ];
		props.beneficiaryId = props.beneficiary;
		delete props.beneficiary;
		super(new OfferProvider<O>(), `offer$${name}`, props, opt);
	}

	public readonly beneficiaryId!: Output<string>;
	public readonly offerName!: Output<string>;
	public readonly offer!: Output<O>;
}
