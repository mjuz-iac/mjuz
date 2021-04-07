import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { Message } from 'google-protobuf';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import { JavaScriptValue, Value } from 'google-protobuf/google/protobuf/struct_pb';
import * as rpc from '@mjus/grpc-protos';
import { dynamic, ID } from '@pulumi/pulumi';
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
		const propsArb: Arbitrary<RemoteConnectionProps> = fc
			.tuple(fc.string(), fc.string(), fc.nat(), fc.option(fc.string()))
			.map(([name, host, port, error]) => {
				return { name, host, port, error };
			});

		const testCreateRemoteConnection = async (
			subject: () => Promise<dynamic.CreateResult | dynamic.UpdateResult>,
			props: RemoteConnectionProps,
			fails: boolean
		) => {
			const createRemoteSpy = jest
				.spyOn(resourcesService, 'updateRemote')
				.mockImplementation(async (remote) => {
					expect(remote).toStrictEqual({
						id: props.name,
						host: props.host,
						port: props.port,
					} as resourcesService.Remote);
					if (fails) throw new Error('Test error');
				});
			expect(await subject()).toStrictEqual({
				id: props.name,
				outs: { ...props, error: fails ? 'Test error' : null },
			});
			expect(createRemoteSpy).toHaveBeenCalledTimes(1);
			createRemoteSpy.mockRestore();
		};

		test('create', () => {
			const pred = async (inputs: RemoteConnectionProps, fails: boolean) =>
				testCreateRemoteConnection(
					() => new RemoteConnectionProvider().create(inputs),
					inputs,
					fails
				);

			return fc.assert(fc.asyncProperty(propsArb, fc.boolean(), pred));
		});

		test('update', () => {
			const pred = async (
				id: string,
				oldProps: RemoteConnectionProps,
				newProps: RemoteConnectionProps,
				fails: boolean
			) =>
				testCreateRemoteConnection(
					() => new RemoteConnectionProvider().update(id, oldProps, newProps),
					newProps,
					fails
				);
			return fc.assert(fc.asyncProperty(fc.string(), propsArb, propsArb, fc.boolean(), pred));
		});

		describe('diff', () => {
			test('unchanged', () => {
				const pred = async (id: ID, props: RemoteConnectionProps) => {
					expect(await new RemoteConnectionProvider().diff(id, props, props)).toEqual({
						changes: true,
						replaces: [],
						deleteBeforeReplace: true,
					});
				};

				return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
			});
			test('changed', () => {
				const differentPropsArb = fc
					.tuple(propsArb, fc.string())
					.filter(([props, name]) => props.name !== name)
					.map(([props, name]) => {
						const propsB = { ...props, name };
						return [props, propsB] as [RemoteConnectionProps, RemoteConnectionProps];
					});
				const pred = async (
					id: ID,
					[propsA, propsB]: [RemoteConnectionProps, RemoteConnectionProps]
				) => {
					expect(await new RemoteConnectionProvider().diff(id, propsA, propsB)).toEqual({
						changes: true,
						replaces: ['name'],
						deleteBeforeReplace: true,
					});
				};

				return fc.assert(fc.asyncProperty(fc.string(), differentPropsArb, pred));
			});
		});

		const mockDeleteRemote = (props: RemoteConnectionProps) =>
			jest.spyOn(resourcesService, 'deleteRemote').mockImplementation(async (remote) =>
				expect(remote).toStrictEqual({
					id: props.name,
					host: props.host,
					port: props.port,
				} as resourcesService.Remote)
			);

		test('delete', () => {
			const pred = async (id: ID, props: RemoteConnectionProps) => {
				const deleteRemoteSpy = mockDeleteRemote(props);
				await new RemoteConnectionProvider().delete(id, props);

				expect(deleteRemoteSpy).toHaveBeenCalledTimes(1);
				deleteRemoteSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), propsArb, pred));
		});
	});
});
