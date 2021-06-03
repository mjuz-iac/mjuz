import { sinkStream, Stream } from '@funkia/hareactive';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjuz/grpc-protos';
import { startService } from './service-utils';
import { Typify } from './type-utils';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';
import { Logger } from 'pino';

export type Remote = rpc.Remote.AsObject;
export const fromRpcRemote = (remote: rpc.Remote): Remote => remote.toObject();
export const toRpcRemote = (remote: Remote): rpc.Remote =>
	new rpc.Remote().setId(remote.id).setHost(remote.host).setPort(remote.port);

export type Offer<O> = Omit<rpc.Offer.AsObject, 'beneficiaryid' | 'offer'> & {
	beneficiaryId: string;
	offer?: O;
};
export const fromRpcOffer = <O>(offer: rpc.Offer): Offer<O> => {
	return {
		name: offer.getName(),
		beneficiaryId: offer.getBeneficiaryid(),
		offer: offer.getOffer()?.toJavaScript() as O,
	};
};
export const toRpcOffer = <O>(offer: Offer<O>): rpc.Offer => {
	const o = new rpc.Offer().setName(offer.name).setBeneficiaryid(offer.beneficiaryId);
	if (offer.offer !== undefined) o.setOffer(Value.fromJavaScript(offer.offer));
	return o;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Wish<O> = { name: string; targetId: string; isDeployed: boolean };
export const fromRpcWish = <O>(wish: rpc.Wish): Wish<O> => {
	return {
		targetId: wish.getTargetid(),
		name: wish.getName(),
		isDeployed: wish.getIsdeployed(),
	};
};
export const toRpcWish = <O>(wish: Wish<O>): rpc.Wish =>
	new rpc.Wish().setTargetid(wish.targetId).setName(wish.name).setIsdeployed(wish.isDeployed);

// Is satisfied if offer not undefined. If satisfied, isWithdrawn must be false.
export type RemoteOffer<O> = { isWithdrawn: boolean; offer?: O };
export const fromRpcRemoteOffer = <O>(remoteOffer: rpc.RemoteOffer): RemoteOffer<O> => {
	return {
		isWithdrawn: remoteOffer.getIswithdrawn(),
		offer: remoteOffer.getOffer()?.toJavaScript() as O,
	};
};
export const toRpcRemoteOffer = <O>(remoteOffer: RemoteOffer<O>): rpc.RemoteOffer => {
	const ro = new rpc.RemoteOffer().setIswithdrawn(remoteOffer.isWithdrawn);
	if (remoteOffer.offer !== undefined) ro.setOffer(Value.fromJavaScript(remoteOffer.offer));
	return ro;
};

let resourcesClientHost: string;
let resourcesClientPort: number;
const resourcesClientRpc = <R>(
	callFunction: (
		client: rpc.ResourcesClient,
		cb: (error: grpc.ServiceError | null, res: R) => void
	) => grpc.ClientUnaryCall
): Promise<R> =>
	new Promise((resolve, reject) => {
		const client = new rpc.ResourcesClient(
			`${resourcesClientHost}:${resourcesClientPort}`,
			grpc.credentials.createInsecure()
		);
		callFunction(client, (error, res) => {
			client.close();
			error ? reject(error) : resolve(res);
		});
	});
export const updateRemote = (remote: Remote): Promise<void> =>
	resourcesClientRpc((client, cb) => client.updateRemote(toRpcRemote(remote), (err) => cb(err)));
export const refreshRemote = (remote: Remote): Promise<void> =>
	resourcesClientRpc((client, cb) => client.refreshRemote(toRpcRemote(remote), (err) => cb(err)));
export const deleteRemote = (remote: Remote): Promise<void> =>
	resourcesClientRpc((client, cb) => client.deleteRemote(toRpcRemote(remote), (err) => cb(err)));
export const updateOffer = <O>(offer: Offer<O>): Promise<void> =>
	resourcesClientRpc((client, cb) => client.updateOffer(toRpcOffer(offer), (err) => cb(err)));
export const refreshOffer = <O>(offer: Offer<O>): Promise<void> =>
	resourcesClientRpc((client, cb) => client.refreshOffer(toRpcOffer(offer), (err) => cb(err)));
export const deleteOffer = <O>(offer: Offer<O>): Promise<void> =>
	resourcesClientRpc((client, cb) => client.deleteOffer(toRpcOffer(offer), (err) => cb(err)));
export const getWish = <O>(wish: Wish<O>): Promise<RemoteOffer<O>> =>
	resourcesClientRpc((client, cb) =>
		client.getWish(toRpcWish(wish), (err, ro) => cb(err, fromRpcRemoteOffer(ro)))
	);
export const wishDeleted = <O>(wish: Wish<O>): Promise<void> =>
	resourcesClientRpc((client, cb) => client.wishDeleted(toRpcWish(wish), (err) => cb(err)));

const resourceService = (
	logger: Logger
): Omit<ResourcesService, 'stop'> & { server: rpc.IResourcesServer } => {
	class ResourcesServer implements rpc.IResourcesServer {
		[name: string]: grpc.UntypedHandleCall;

		updateRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, `Remote '${remote.getId()}' created`);
			remoteUpdated.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		refreshRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, `Remote '${remote.getId()}' refreshed`);
			remoteRefreshed.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		deleteRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, `Remote '${remote.getId()}' deleted`);
			remoteDeleted.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(
				offer,
				`Offer '${offer.getName()}' to remote '${offer.getBeneficiaryid()}' updated`
			);
			offerUpdated.push(fromRpcOffer(offer));
			cb(null, new Empty());
		}

		refreshOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(
				offer,
				`Offer '${offer.getName()}' to remote '${offer.getBeneficiaryid()}' refreshed`
			);
			offerRefreshed.push(fromRpcOffer(offer));
			cb(null, new Empty());
		}

		deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(
				offer,
				`Withdrawing offer '${offer.getName()}' to remote '${offer.getBeneficiaryid()}'`
			);
			offerWithdrawn.push([fromRpcOffer(offer), (error) => cb(error, new Empty())]);
		}

		getWish(
			call: grpc.ServerUnaryCall<rpc.Wish, rpc.RemoteOffer>,
			cb: sendUnaryData<rpc.RemoteOffer>
		): void {
			const wish = call.request as rpc.Wish;
			logger.info(
				wish,
				`Polling wish for offer '${wish.getName()}' from remote '${wish.getTargetid()}'`
			);
			wishPolled.push([fromRpcWish(wish), (err, ro) => cb(err, toRpcRemoteOffer(ro))]);
		}

		wishDeleted(call: grpc.ServerUnaryCall<rpc.Wish, Empty>, cb: sendUnaryData<Empty>): void {
			const wish = call.request as rpc.Wish;
			logger.info(
				wish,
				`Wish  for offer '${wish.getName()}' from remote '${wish.getTargetid()}' deleted`
			);
			wishDeleted.push(fromRpcWish(wish));
			cb(null, new Empty());
		}
	}

	const remoteUpdated = sinkStream<Remote>();
	const remoteRefreshed = sinkStream<Remote>();
	const remoteDeleted = sinkStream<Remote>();
	const offerUpdated = sinkStream<Offer<unknown>>();
	const offerRefreshed = sinkStream<Offer<unknown>>();
	const offerWithdrawn = sinkStream<[Offer<unknown>, (error: Error | null) => void]>();
	const wishPolled =
		sinkStream<
			[Wish<unknown>, (error: Error | null, remoteOffer: RemoteOffer<unknown>) => void]
		>();
	const wishDeleted = sinkStream<Wish<unknown>>();

	return {
		server: new ResourcesServer(),
		remoteUpdated,
		remoteRefreshed,
		remoteDeleted,
		offerUpdated,
		offerRefreshed,
		offerWithdrawn,
		wishPolled,
		wishDeleted,
	};
};

export type ResourcesService = {
	remoteUpdated: Stream<Remote>;
	remoteRefreshed: Stream<Remote>;
	remoteDeleted: Stream<Remote>;
	offerUpdated: Stream<Offer<unknown>>;
	offerRefreshed: Stream<Offer<unknown>>;
	offerWithdrawn: Stream<[Offer<unknown>, (error: Error | null) => void]>;
	wishPolled: Stream<
		[Wish<unknown>, (error: Error | null, remoteOffer: RemoteOffer<unknown>) => void]
	>;
	wishDeleted: Stream<Wish<unknown>>;
	stop: () => Promise<void>;
};
export const startResourcesService = async (
	host: string,
	port: number,
	logger: Logger
): Promise<ResourcesService> => {
	resourcesClientHost = host;
	resourcesClientPort = port;
	const service = resourceService(logger);
	const stopService = await startService(
		'resources',
		rpc.ResourcesService as Typify<rpc.IResourcesService>,
		service.server,
		host,
		port,
		logger
	);
	return {
		...service,
		stop: stopService,
	};
};
