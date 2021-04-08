import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { ID } from '@pulumi/pulumi';
import { isDeepStrictEqual } from 'util';
import {
	OfferProps,
	OfferProvider,
	RemoteConnectionProps,
	RemoteConnectionProvider,
} from '../src/resources';
import * as resourcesService from '../src/resources-service';

describe('resources', () => {
	describe('offer', () => {
		const propsArb: Arbitrary<OfferProps<unknown>> = fc.record({
			beneficiaryId: fc.string(),
			offerName: fc.string(),
			offer: fc.jsonObject(),
		});

		describe('check', () => {
			test('deployed', () => {
				const pred = async (
					oldProps: OfferProps<unknown>,
					newProps: OfferProps<unknown>
				) => {
					const refreshOfferSpy = jest
						.spyOn(resourcesService, 'refreshOffer')
						.mockImplementation(async (offer) =>
							expect(offer).toStrictEqual({
								beneficiaryId: oldProps.beneficiaryId.toString(),
								name: oldProps.offerName,
								offer: oldProps.offer,
							} as resourcesService.Offer<unknown>)
						);
					const result = await new OfferProvider().check(oldProps, newProps);
					expect(result).toStrictEqual({ inputs: newProps });
					expect(refreshOfferSpy).toHaveBeenCalledTimes(1);
					refreshOfferSpy.mockRestore();
				};
				return fc.assert(fc.asyncProperty(propsArb, propsArb, pred));
			});

			test('not deployed', () => {
				const pred = async (oldProps: unknown, newProps: OfferProps<unknown>) => {
					const refreshOfferSpy = jest.spyOn(resourcesService, 'refreshOffer');
					const result = await new OfferProvider().check(oldProps, newProps);
					expect(result).toStrictEqual({ inputs: newProps });
					expect(refreshOfferSpy).toHaveBeenCalledTimes(0);
				};
				return fc.assert(fc.asyncProperty(fc.anything(), propsArb, pred));
			});
		});

		const mockUpdateOffer = (props: OfferProps<unknown>) =>
			jest.spyOn(resourcesService, 'updateOffer').mockImplementation(async (offer) =>
				expect(offer).toStrictEqual({
					beneficiaryId: props.beneficiaryId.toString(),
					name: props.offerName,
					offer: props.offer,
				} as resourcesService.Offer<unknown>)
			);

		test('create', () => {
			const pred = async (props: OfferProps<unknown>) => {
				const updateOfferSpy = mockUpdateOffer(props);
				expect(await new OfferProvider().create(props)).toEqual({
					id: props.beneficiaryId.toString() + ':' + props.offerName,
					outs: props,
				});
				expect(updateOfferSpy).toHaveBeenCalledTimes(1);
				updateOfferSpy.mockRestore();
			};
			return fc.assert(fc.asyncProperty(propsArb, pred));
		});

		test('update', () => {
			const pred = async (
				id: ID,
				oldProps: OfferProps<unknown>,
				newProps: OfferProps<unknown>
			) => {
				const updateOfferSpy = mockUpdateOffer(newProps);
				expect(await new OfferProvider().update(id, oldProps, newProps)).toEqual({
					outs: newProps,
				});
				expect(updateOfferSpy).toHaveBeenCalledTimes(1);
				updateOfferSpy.mockRestore();
			};
			return fc.assert(fc.asyncProperty(fc.string(), propsArb, propsArb, pred));
		});

		describe('diff', () => {
			test('unchanged', () => {
				const pred = async (id: ID, props: OfferProps<unknown>) => {
					const result = await new OfferProvider().diff(id, props, props);
					expect(result).toStrictEqual({
						changes: false,
						replaces: [],
						deleteBeforeReplace: true,
					});
				};
				return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
			});

			type BiOffer = [OfferProps<unknown>, OfferProps<unknown>];
			test('update', () => {
				const pred = async (id: ID, [oldProps, newProps]: BiOffer) => {
					const result = await new OfferProvider().diff(id, oldProps, newProps);
					expect(result).toStrictEqual({
						changes: true,
						replaces: [],
						deleteBeforeReplace: true,
					});
				};
				const propsArbs = fc
					.tuple(propsArb, fc.jsonObject())
					.filter(([props, offer]) => !isDeepStrictEqual(props.offer, offer))
					.map<BiOffer>(([props, offer]) => [props, { ...props, offer }]);
				return fc.assert(fc.asyncProperty(fc.string(), propsArbs, pred));
			});
			test('replace', () => {
				const pred = async (id: ID, [oldProps, newProps]: BiOffer) => {
					const results = await new OfferProvider().diff(id, oldProps, newProps);
					expect(results).toStrictEqual({
						changes: true,
						replaces:
							oldProps.beneficiaryId !== newProps.beneficiaryId
								? oldProps.offerName !== newProps.offerName
									? ['beneficiaryId', 'offerName']
									: ['beneficiaryId']
								: ['offerName'],
						deleteBeforeReplace: true,
					});
				};
				const propsArbs = fc
					.tuple(propsArb, fc.string(), fc.string())
					.filter(
						([props, beneficiaryId, offerName]) =>
							props.beneficiaryId !== beneficiaryId || props.offerName !== offerName
					)
					.map<BiOffer>(([props, beneficiaryId, offerName]) => [
						props,
						{ ...props, beneficiaryId, offerName },
					]);
				return fc.assert(fc.asyncProperty(fc.string(), propsArbs, pred));
			});
		});

		test('delete', () => {
			const pred = async (id: ID, props: OfferProps<unknown>) => {
				const deleteOfferSpy = jest
					.spyOn(resourcesService, 'deleteOffer')
					.mockImplementation(async (offer) =>
						expect(offer).toStrictEqual({
							beneficiaryId: props.beneficiaryId,
							name: props.offerName,
						} as resourcesService.Offer<unknown>)
					);
				await new OfferProvider().delete(id, props);
				expect(deleteOfferSpy).toHaveBeenCalledTimes(1);
				deleteOfferSpy.mockRestore();
			};
			return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
		});
	});

	describe('remote connection', () => {
		const propsArb: Arbitrary<RemoteConnectionProps> = fc.record({
			remoteId: fc.string(),
			host: fc.string(),
			port: fc.nat(),
		});

		describe('check', () => {
			test('deployed', () => {
				const pred = async (
					oldProps: RemoteConnectionProps,
					newProps: RemoteConnectionProps
				) => {
					const refreshRemoteSpy = jest
						.spyOn(resourcesService, 'refreshRemote')
						.mockImplementation(async (remote) =>
							expect(remote).toStrictEqual({
								id: oldProps.remoteId,
								host: oldProps.host,
								port: oldProps.port,
							} as resourcesService.Remote)
						);
					const result = await new RemoteConnectionProvider().check(oldProps, newProps);
					expect(result).toStrictEqual({ inputs: newProps });
					expect(refreshRemoteSpy).toHaveBeenCalledTimes(1);
					refreshRemoteSpy.mockRestore();
				};

				return fc.assert(fc.asyncProperty(propsArb, propsArb, pred));
			});

			test('not deployed', () => {
				const pred = async (oldProps: unknown, newProps: RemoteConnectionProps) => {
					const refreshRemoteSpy = jest.spyOn(resourcesService, 'refreshRemote');
					const result = await new RemoteConnectionProvider().check(oldProps, newProps);
					expect(result).toStrictEqual({ inputs: newProps });
					expect(refreshRemoteSpy).toHaveBeenCalledTimes(0);
				};

				return fc.assert(fc.asyncProperty(fc.anything(), propsArb, pred));
			});
		});

		const mockUpdateRemote = (props: RemoteConnectionProps) =>
			jest.spyOn(resourcesService, 'updateRemote').mockImplementation(async (remote) =>
				expect(remote).toStrictEqual({
					id: props.remoteId,
					host: props.host,
					port: props.port,
				} as resourcesService.Remote)
			);

		test('create', () => {
			const pred = async (props: RemoteConnectionProps) => {
				const updateRemoteSpy = mockUpdateRemote(props);
				expect(await new RemoteConnectionProvider().create(props)).toStrictEqual({
					id: props.remoteId,
					outs: props,
				});
				expect(updateRemoteSpy).toHaveBeenCalledTimes(1);
				updateRemoteSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(propsArb, fc.boolean(), pred));
		});

		test('update', () => {
			const pred = async (
				id: ID,
				oldProps: RemoteConnectionProps,
				newProps: RemoteConnectionProps
			) => {
				const updateRemoteSpy = mockUpdateRemote(newProps);
				const result = await new RemoteConnectionProvider().update(id, oldProps, newProps);
				expect(result).toStrictEqual({ outs: newProps });
				expect(updateRemoteSpy).toHaveBeenCalledTimes(1);
				updateRemoteSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), propsArb, propsArb, fc.boolean(), pred));
		});

		describe('diff', () => {
			test('unchanged', () => {
				const pred = async (id: ID, props: RemoteConnectionProps) => {
					const result = await new RemoteConnectionProvider().diff(id, props, props);
					expect(result).toStrictEqual({
						changes: false,
						replaces: [],
						deleteBeforeReplace: true,
					});
				};
				return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
			});

			test('update', () => {
				type BiRCP = [RemoteConnectionProps, RemoteConnectionProps];
				const pred = async (id: ID, [oldProps, newProps]: BiRCP) => {
					const res = await new RemoteConnectionProvider().diff(id, oldProps, newProps);
					expect(res).toStrictEqual({
						changes: true,
						replaces: [],
						deleteBeforeReplace: true,
					});
				};
				const propsArbs = fc
					.tuple(propsArb, fc.string(), fc.nat())
					.filter(([props, host, port]) => props.host !== host || props.port !== port)
					.map<BiRCP>(([props, host, port]) => [props, { ...props, host, port }]);
				return fc.assert(fc.asyncProperty(fc.string(), propsArbs, pred));
			});

			test('replace', () => {
				type BiRCP = [RemoteConnectionProps, RemoteConnectionProps];
				const pred = async (id: ID, [oldProps, newProps]: BiRCP) => {
					const res = await new RemoteConnectionProvider().diff(id, oldProps, newProps);
					expect(res).toStrictEqual({
						changes: true,
						replaces: ['remoteId'],
						deleteBeforeReplace: true,
					});
				};
				const propsArbs = fc
					.tuple(propsArb, fc.string())
					.filter(([props, remoteId]) => props.remoteId !== remoteId)
					.map<BiRCP>(([props, remoteId]) => [props, { ...props, remoteId }]);
				return fc.assert(fc.asyncProperty(fc.string(), propsArbs, pred));
			});
		});

		test('delete', () => {
			const pred = async (id: ID, props: RemoteConnectionProps) => {
				const deleteRemoteSpy = jest
					.spyOn(resourcesService, 'deleteRemote')
					.mockImplementation(async (remote) =>
						expect(remote).toStrictEqual({
							id: props.remoteId,
							host: props.host,
							port: props.port,
						} as resourcesService.Remote)
					);
				await new RemoteConnectionProvider().delete(id, props);
				expect(deleteRemoteSpy).toHaveBeenCalledTimes(1);
				deleteRemoteSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
		});
	});
});
