import { CustomResourceOptions, dynamic, ID, Input, Inputs, Output } from '@pulumi/pulumi';
import { isDeepStrictEqual } from 'util';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { RemoteConnection } from './remote-connection';
import { getWish, RemoteOffer, Wish as RsWish, wishDeleted } from '../resources-service';

export type WishProps<O> = {
	targetId: string;
	offerName: string;
	isSatisfied: boolean;
	offer?: O; // undefined when isSatisfied is false, otherwise not undefined
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isWishProps = <O>(v: any): v is WishProps<O> =>
	typeof v === 'object' &&
	v !== null &&
	typeof v.targetId === 'string' &&
	typeof v.offerName === 'string' &&
	typeof v.isSatisfied === 'boolean';
const toRsWish = <O>(props: WishProps<O>): RsWish<O> => {
	return {
		targetId: props.targetId,
		name: props.offerName,
	};
};
export class WishProvider<O> implements dynamic.ResourceProvider {
	async check(
		oldProps: unknown | WishProps<O>,
		newProps: WishProps<O>
	): Promise<dynamic.CheckResult & { inputs: WishProps<O> }> {
		const props: WishProps<O> = {
			targetId: newProps.targetId,
			offerName: newProps.offerName,
			isSatisfied: false,
		};
		if (isWishProps(oldProps) && oldProps.isSatisfied) {
			props.isSatisfied = true;
			props.offer = oldProps.offer as O;
		}

		const currentOffer: RemoteOffer<O> = await getWish(toRsWish(newProps));
		if (currentOffer.offer !== undefined) {
			props.isSatisfied = true;
			props.offer = currentOffer.offer;
		} else if (currentOffer.isWithdrawn) {
			props.isSatisfied = false;
			delete props.offer;
		}
		return { inputs: props };
	}

	async create(props: WishProps<O>): Promise<dynamic.CreateResult & { outs: WishProps<O> }> {
		return {
			id: `${props.targetId}:${props.offerName}`,
			outs: props,
		};
	}

	async diff(
		id: ID,
		oldProps: WishProps<O>,
		newProps: WishProps<O>
	): Promise<dynamic.DiffResult> {
		const replaces = ['targetId' as const, 'offerName' as const, 'isSatisfied' as const].filter(
			(field) => oldProps[field] !== newProps[field]
		);
		const offerChanged =
			oldProps.isSatisfied &&
			newProps.isSatisfied &&
			!isDeepStrictEqual(oldProps.offer, newProps.offer);

		return {
			changes: replaces.length > 0 || offerChanged,
			replaces,
			deleteBeforeReplace: true,
		};
	}

	async delete(id: ID, props: WishProps<O>): Promise<void> {
		await wishDeleted(toRsWish(props));
	}
}

export type WishArgs = WrappedInputs<{
	target: RemoteConnection;
	offerName: string;
}>;
export type WishOutputs<O> = Readonly<WrappedOutputs<WishProps<O>>>;
export class Wish<O> extends dynamic.Resource implements WishOutputs<O> {
	constructor(target: Input<RemoteConnection>, offerName: string, opts?: CustomResourceOptions);
	constructor(name: string, props: WishArgs, opts?: CustomResourceOptions);
	constructor(
		nameOrTarget: string | Input<RemoteConnection>,
		argsOrOfferName: WishArgs | string,
		opts?: CustomResourceOptions
	) {
		const [name, props]: [string, Inputs] =
			typeof nameOrTarget === 'string' && typeof argsOrOfferName !== 'string'
				? [nameOrTarget, argsOrOfferName]
				: [
						`${(<RemoteConnection>nameOrTarget).remoteId}:${argsOrOfferName}`,
						{
							target: nameOrTarget as Input<RemoteConnection>,
							offerName: argsOrOfferName as string,
						},
				  ];
		props.targetId = props.target;
		delete props.target;
		super(new WishProvider<O>(), name, props, opts);
	}

	public readonly targetId!: Output<string>;
	public readonly offerName!: Output<string>;
	public readonly isSatisfied!: Output<boolean>;
	public readonly offer!: Output<O | undefined>;
}
