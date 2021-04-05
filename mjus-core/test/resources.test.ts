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
	describe('remote connection', () => {
		const propsArb: Arbitrary<RemoteConnectionProps> = fc
			.tuple(fc.string(), fc.string(), fc.nat(), fc.option(fc.string()))
			.map(([name, host, port, error]) => {
				return { name, host, port, error };
			});

		const testCreateRemoteConnection = async (
			subject: () => Promise<dynamic.CreateResult | dynamic.UpdateResult>,
			inputs: RemoteConnectionProps,
			fails: boolean
		) => {
			const createRemoteSpy = jest
				.spyOn(resourcesService, 'createRemote')
				.mockImplementation(async (remote) => {
					const refRemote = new rpc.Remote()
						.setId(inputs.name)
						.setHost(inputs.host)
						.setPort(inputs.port);
					expect(Message.equals(refRemote, remote)).toBe(true);

					if (fails) throw new Error('Test error');
					return new Empty();
				});
			expect(await subject()).toEqual({
				id: inputs.name,
				outs: { ...inputs, error: fails ? 'Test error' : null },
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

		const mockDeleteRemote = (id: ID) =>
			jest.spyOn(resourcesService, 'deleteRemote').mockImplementation(async (remote) => {
				const refRemote = new rpc.Remote().setId(id);
				expect(Message.equals(refRemote, remote)).toBe(true);
				return new Empty();
			});

		test('delete', () => {
			const pred = async (id: ID) => {
				const deleteRemoteSpy = mockDeleteRemote(id);
				await new RemoteConnectionProvider().delete(id);

				expect(deleteRemoteSpy).toHaveBeenCalledTimes(1);
				deleteRemoteSpy.mockRestore();
			};

			return fc.assert(fc.asyncProperty(fc.string(), pred));
		});
	});
});
