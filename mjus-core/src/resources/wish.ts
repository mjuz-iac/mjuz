import { CustomResourceOptions, dynamic, ID, Input, Output } from '@pulumi/pulumi';
import { isDeepStrictEqual } from 'util';
import { WrappedInputs, WrappedOutputs } from '../type-utils';
import { RemoteConnection } from './remote-connection';
import { getWish, Wish as RsWish, wishDeleted } from '../resources-service';

type WishProps<O> = {
	offerName: string;
	target: RemoteConnection;
	offer: O | null;
	isSatisfied: boolean;
	error: string | null; // Workaround to indicate error in resource provider
};

const toRsWish = <O>(wish: WishProps<O>): RsWish<O> => {
	return {
		targetId: `${wish.target}`,
		name: wish.offerName,
	};
};
class WishProvider<O> implements dynamic.ResourceProvider {
	// Problem: If this method fails Pulumi exits with promise leak errors, even though this actually should mean
	// the deployment did not run through. For now: make sure this function won't reject. For debugging, we use an error
	// input property.

	async create(
		props: WishProps<O> // Due to serialization all `Resource` values reduced to their id
	): Promise<dynamic.CreateResult & { outs: WishProps<O> }> {
		try {
			const remoteOffer = await getWish(toRsWish(props));

			const outProps: WishProps<O> = {
				...props,
				isSatisfied: remoteOffer.offer !== undefined,
				offer: remoteOffer.offer !== undefined ? remoteOffer.offer : null,
				error: null,
			};
			return {
				id: `${props.target}:${props.offerName}`,
				outs: outProps,
			};
		} catch (e) {
			return {
				id: `${props.target}:${props.offerName}`,
				outs: { ...props, error: e.message },
			};
		}
	}

	async check(oldProps: WishProps<O>, newProps: WishProps<O>): Promise<dynamic.CheckResult> {
		return {
			inputs: newProps,
			failures: [
				oldProps.target && oldProps.target !== newProps.target
					? { property: 'target', reason: 'Target deployment may not change' }
					: null,
				oldProps.offerName && oldProps.offerName !== newProps.offerName
					? { property: 'offerName', reason: 'Offer name may not change' }
					: null,
			].filter((v) => v !== null) as dynamic.CheckFailure[],
		};
	}

	async diff(
		id: ID,
		oldProps: WishProps<O>,
		newProps: WishProps<O>
	): Promise<dynamic.DiffResult> {
		const wish = await getWish(toRsWish(newProps));
		const satisfactionChanged =
			// Unsatisfied wish became satisfied
			(!oldProps.isSatisfied && wish.offer !== undefined) ||
			// Satisfied wish was withdrawn
			(oldProps.isSatisfied && wish.offer === undefined && wish.isWithdrawn);
		const offerChanged =
			satisfactionChanged ||
			// Satisfied wish' value changed
			(oldProps.isSatisfied &&
				wish.offer !== undefined &&
				!isDeepStrictEqual(oldProps.offer, wish.offer));

		return {
			changes: offerChanged,
			replaces: [oldProps.isSatisfied !== satisfactionChanged ? 'isSatisfied' : null].filter(
				(v) => v !== null
			) as string[],
			stables: ['target', 'offerName'],
			deleteBeforeReplace: true,
		};
	}

	async update(
		id: ID,
		oldProps: WishProps<O>,
		newProps: WishProps<O>
	): Promise<dynamic.UpdateResult> {
		try {
			const wish = await getWish(toRsWish(newProps));

			if (!oldProps.isSatisfied || wish.offer === undefined)
				throw new Error('Wish can only be updated if satisfied before and afterwards');

			const outProps: WishProps<O> = {
				...newProps,
				offer: wish.offer as O,
				error: null,
			};
			return { outs: outProps };
		} catch (e) {
			return { outs: { ...oldProps, error: e.message } };
		}
	}

	async delete(id: ID, props: WishProps<O>): Promise<void> {
		if (props.isSatisfied) {
			await wishDeleted(toRsWish(props));
		}
	}
}

export type WishInputs = WrappedInputs<Omit<WishProps<unknown>, 'isSatisfied' | 'offer' | 'error'>>;
// Exclude null from offer for easier syntax
// (idea behind: whenever a resource depending on the offer is deployed, the offer will be satisfied)
type WishOutputs<O> = Readonly<WrappedOutputs<WishProps<O> & { offer: O }>>;
export class Wish<O> extends dynamic.Resource implements WishOutputs<O> {
	constructor(target: Input<RemoteConnection>, offerName: string, opts?: CustomResourceOptions);
	constructor(name: string, props: WishInputs, opts?: CustomResourceOptions);
	constructor(
		nameOrTarget: string | Input<RemoteConnection>,
		argsOrOfferName: WishInputs | string,
		opts?: CustomResourceOptions
	) {
		const [name, args]: [string, WishInputs | undefined] =
			typeof nameOrTarget === 'string' && typeof argsOrOfferName !== 'string'
				? [nameOrTarget, argsOrOfferName]
				: nameOrTarget !== 'string' && typeof argsOrOfferName === 'string'
				? [
						`${(<RemoteConnection>nameOrTarget).remoteId}:${argsOrOfferName}`,
						{
							offerName: argsOrOfferName,
							target: <Input<RemoteConnection>>nameOrTarget,
						},
				  ]
				: ['invalid wish configuration', undefined];
		if (!args) throw new Error('Unsupported wish configuration');
		const props: WrappedInputs<WishProps<O>> = {
			...args,
			isSatisfied: false,
			offer: null,
			error: null,
		};
		super(new WishProvider<O>(), name, props, opts);
	}

	public readonly offerName!: Output<string>;
	public readonly target!: Output<RemoteConnection>;
	public readonly isSatisfied!: Output<boolean>;
	public readonly offer!: Output<O>;
	public readonly error!: Output<null | string>;
}
