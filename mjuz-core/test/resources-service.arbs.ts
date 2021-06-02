import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { Offer, Remote, RemoteOffer, Wish } from '../src';

export const remoteArb: Arbitrary<Remote> = fc.record({
	id: fc.string(),
	host: fc.string(),
	port: fc.nat(),
});

export const offerArb: Arbitrary<Offer<unknown>> = fc.record({
	beneficiaryId: fc.string(),
	name: fc.string(),
	offer: fc.option(fc.jsonObject(), { nil: undefined }),
});

export const wishArb: Arbitrary<Wish<unknown>> = fc.record({
	targetId: fc.string(),
	name: fc.string(),
	isDeployed: fc.boolean(),
});

export const remoteOfferArb: Arbitrary<RemoteOffer<unknown>> = fc
	.record({
		isWithdrawn: fc.boolean(),
		offer: fc.option(fc.jsonObject(), { nil: undefined }),
	})
	.filter(({ isWithdrawn, offer }) => offer === undefined || !isWithdrawn);
