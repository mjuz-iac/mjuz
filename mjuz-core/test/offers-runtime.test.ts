import { Behavior, Stream } from '@funkia/hareactive';
import { testAt, testStreamFromArray } from '@funkia/hareactive/testing';
import * as grpc from '@grpc/grpc-js';
import { DeploymentClient } from '@mjuz/grpc-protos';
import * as fc from 'fast-check';
import { Arbitrary } from 'fast-check';
import { instance, mock, resetCalls, verify } from 'ts-mockito';
import { accumRemotes, Remote } from '../src';
import { streamArb } from './hareactive.arbs';
import { remoteArb } from './resources-service.arbs';

jest.mock('@mjuz/grpc-protos', () => ({
	...jest.requireActual('@mjuz/grpc-protos'),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mjuzProtos = require('@mjuz/grpc-protos');

// Fixes error in hareactive testing
Behavior.of('');

describe('offers runtime', () => {
	describe('accumulate remotes', () => {
		type Arbs = [number, number, Stream<Remote>, Stream<Remote>];
		it('has no remote upserted before t1, after t2, or also removed between t1 and t2', () => {
			const arbs: Arbitrary<Arbs> = fc
				.tuple(fc.integer(), fc.nat())
				.chain(([t1, deltaT2]) => {
					const t2 = t1 + deltaT2 + 0.1;
					return fc.tuple(
						fc.constant([t1, t2]),
						fc.float(),
						streamArb(remoteArb),
						streamArb(remoteArb)
					);
				})
				.chain(([[t1, t2], removeShift, upsert, remove]) => {
					const shiftedUpsert: [number, Remote][] = upsert
						.model()
						.filter(({ time }) => time >= t1 && time < t2)
						.map(({ time, value }) => [time + removeShift * (t2 - time), value]);
					const removeUpsert = testStreamFromArray(shiftedUpsert);
					return fc.constant([t1, t2, upsert, remove.combine(removeUpsert)]);
				});
			const pred = ([t1, t2, upsert, remove]: Arbs) =>
				expect(testAt(t2, testAt(t1, accumRemotes(upsert, remove)))).toStrictEqual({});
			fc.assert(fc.property(arbs, pred));
		});

		it('has all upserted remotes', () => {
			const arbs: Arbitrary<Arbs> = fc
				.tuple(fc.integer(), fc.nat())
				.chain(([t1, deltaT2]) => {
					const t2 = t1 + deltaT2 + 0.1;
					return fc.tuple(
						fc.constant([t1, t2]),
						streamArb(remoteArb, { minTime: t1, maxTime: t2 - 0.05 })
					);
				})
				.chain(([[t1, t2], upsert]) =>
					fc.tuple(
						fc.constant(t1),
						fc.constant(t2),
						fc.constant(upsert),
						streamArb(remoteArb, {
							filterEvents: ([tRemove, removeRemote]) =>
								upsert
									.model()
									.filter(
										({ time: tUpsert, value: upsertRemote }) =>
											upsertRemote.id === removeRemote.id &&
											tUpsert <= tRemove &&
											tRemove <= t2
									).length === 0,
						})
					)
				);

			const deploymentClientMock = mock<DeploymentClient>();
			const deploymentClientSpy = jest
				.spyOn(mjuzProtos, 'DeploymentClient')
				.mockReturnValue(instance(deploymentClientMock));
			const pred = ([t1, t2, upsert, remove]: Arbs) => {
				deploymentClientSpy.mockClear();
				resetCalls(deploymentClientMock);

				const remotes = testAt(t2, testAt(t1, accumRemotes(upsert, remove)));
				const noRepetitionUpsert = upsert
					.model()
					.map(({ value }) => value)
					.filter((upsert, i, model) => {
						const prevUpsert = model
							.slice(0, i)
							.reverse()
							.find((prevUpsert) => upsert.id === prevUpsert.id);
						return (
							prevUpsert === undefined ||
							prevUpsert.host !== upsert.host ||
							prevUpsert.port !== upsert.port
						);
					});
				const latestUpsert = noRepetitionUpsert.filter(
					(upsert, i, upserts) =>
						upserts.slice(i + 1).find((laterUpsert) => laterUpsert.id === upsert.id) ===
						undefined
				);
				// List of remotes correct
				expect(Object.keys(remotes).sort()).toEqual(
					latestUpsert.map((remote) => remote.id).sort()
				);
				// Each remote with has latest configuration
				Object.entries(remotes).forEach(([remoteId, [remote]]) =>
					expect(remote).toBe(latestUpsert.find((upsert) => upsert.id === remoteId))
				);
				// Deployment client setup for each non-repeated upsert
				expect(deploymentClientSpy).toBeCalledTimes(noRepetitionUpsert.length);
				noRepetitionUpsert.forEach((remote, i) =>
					expect(deploymentClientSpy).nthCalledWith(
						i + 1,
						`${remote.host}:${remote.port}`,
						grpc.credentials.createInsecure()
					)
				);
				// Close all unregistered clients
				const closedClients = noRepetitionUpsert.length - latestUpsert.length;
				verify(deploymentClientMock.close()).times(closedClients);
			};
			fc.assert(fc.property(arbs, pred));
			deploymentClientSpy.mockRestore();
		});
	});
});
