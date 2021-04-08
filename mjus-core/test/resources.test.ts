import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { Message } from 'google-protobuf';
import { JavaScriptValue, Value } from 'google-protobuf/google/protobuf/struct_pb';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { ID } from '@pulumi/pulumi';
import { mock } from 'ts-mockito';
import { isDeepStrictEqual } from 'util';
import {
	OfferProps,
	OfferProvider,
	RemoteConnection,
	RemoteConnectionProps,
	RemoteConnectionProvider,
} from '../src/resources';
import * as resourcesService from '../src/resources-service';

describe('resources', () => {
	describe('offer', () => {
		const propsArb: Arbitrary<OfferProps<unknown>> = fc
			.tuple(
				fc.oneof(fc.clonedConstant(mock<RemoteConnection>())),
				fc.string(),
				fc.option(fc.jsonObject(), { nil: undefined }),
				fc.option(fc.string())
			)
			.map(([beneficiary, offerName, offer, error]) => {
				return { beneficiary, offerName, offer, error };
			});

		const mockUpdateOffer = (props: OfferProps<unknown>, fails: boolean) =>
			jest.spyOn(resourcesService, 'updateOffer').mockImplementation(async (offer) => {
				const refOffer = new rpc.Offer()
					.setName(props.offerName)
					.setBeneficiaryid(props.beneficiary.toString())
					.setOffer(
						Value.fromJavaScript(
							props.offer === undefined ? null : (props.offer as JavaScriptValue)
						)
					);
				expect(Message.equals(refOffer, offer)).toBe(true);

				if (fails) throw new Error('Test error');
				return new Empty();
			});

		test('create', () => {
			const pred = async (props: OfferProps<unknown>, fails: boolean) => {
				const updateOfferSpy = mockUpdateOffer(props, fails);
				const result = await new OfferProvider().create(props);

				expect(result).toEqual({
					id: `${props.beneficiary}:${props.offerName}`,
					outs: { ...props, error: fails ? 'Test error' : null },
				});
				expect(updateOfferSpy).toHaveBeenCalledTimes(1);
				updateOfferSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(propsArb, fc.boolean(), pred));
		});

		test('update', () => {
			const pred = async (
				id: ID,
				oldProps: OfferProps<unknown>,
				newProps: OfferProps<unknown>,
				fails: boolean
			) => {
				const updateOfferSpy = mockUpdateOffer(newProps, fails);
				const result = await new OfferProvider().update(id, oldProps, newProps);

				expect(result).toEqual({
					outs: fails
						? { ...oldProps, error: 'Test error' }
						: { ...newProps, error: null },
				});
				expect(updateOfferSpy).toHaveBeenCalledTimes(1);
				updateOfferSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), propsArb, propsArb, fc.boolean(), pred));
		});

		const mockRefreshOffer = (props: OfferProps<unknown>) =>
			jest.spyOn(resourcesService, 'refreshOffer').mockImplementation(async (offer) => {
				const refOffer = new rpc.Offer()
					.setName(props.offerName)
					.setBeneficiaryid(props.beneficiary.toString())
					.setOffer(
						Value.fromJavaScript(
							props.offer === undefined ? null : (props.offer as JavaScriptValue)
						)
					);
				expect(Message.equals(refOffer, offer)).toBe(true);
				return new Empty();
			});

		test('diff', () => {
			const pred = async (
				id: ID,
				oldProps: OfferProps<unknown>,
				newProps: OfferProps<unknown>,
				sameBeneficiary: boolean
			) => {
				const refreshOfferSpy = mockRefreshOffer(oldProps);
				if (sameBeneficiary) newProps.beneficiary = oldProps.beneficiary;
				const result = await new OfferProvider().diff(id, oldProps, newProps);

				expect(result).toEqual({
					changes:
						!isDeepStrictEqual(oldProps, { ...newProps, error: oldProps.error }) ||
						oldProps.beneficiary !== newProps.beneficiary,
					replaces: [
						...(oldProps.beneficiary !== newProps.beneficiary ? ['beneficiary'] : []),
						...(oldProps.offerName !== newProps.offerName ? ['offerName'] : []),
					],
					deleteBeforeReplace: true,
				});
				expect(refreshOfferSpy).toHaveBeenCalledTimes(1);
				refreshOfferSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), propsArb, propsArb, fc.boolean(), pred));
		});

		const mockDeleteOffer = (props: OfferProps<unknown>) =>
			jest.spyOn(resourcesService, 'deleteOffer').mockImplementation(async (offer) => {
				const refOffer = new rpc.Offer()
					.setName(props.offerName)
					.setBeneficiaryid(`${props.beneficiary}`)
					.setOffer(
						Value.fromJavaScript(
							props.offer === undefined ? null : (props.offer as JavaScriptValue)
						)
					);
				expect(Message.equals(refOffer, offer)).toBe(true);
				return new Empty();
			});

		test('delete', () => {
			const pred = async (id: ID, props: OfferProps<unknown>) => {
				const deleteOfferSpy = mockDeleteOffer(props);
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
