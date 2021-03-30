import { sinkStream, Stream } from '@funkia/hareactive';
import * as grpc from '@grpc/grpc-js';
import { sendUnaryData } from '@grpc/grpc-js/build/src/server-call';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import * as rpc from '@mjus/grpc-protos';
import { newLogger } from './logging';
import { startService } from './service-utils';
import { Typify } from './type-utils';
import { Value } from 'google-protobuf/google/protobuf/struct_pb';

const logger = newLogger('resources service');

export const toRpcWish = <O>(wish: Wish<O>): rpc.Wish => {
	const w = new rpc.Wish()
		.setTargetid(wish.targetid)
		.setName(wish.name)
		.setIswithdrawn(wish.iswithdrawn);
	if (wish.offer) w.setOffer(Value.fromJavaScript(wish.offer));
	return w;
};
export const toOffer = <O>(offer: rpc.Offer): Offer<O> => {
	return {
		beneficiaryid: offer.getBeneficiaryid(),
		name: offer.getName(),
		offer: offer.getOffer()?.toJavaScript() as O,
	};
};
export const toWish = <O>(wish: rpc.Wish): Wish<O> => {
	return {
		targetid: wish.getTargetid(),
		name: wish.getName(),
		iswithdrawn: wish.getIswithdrawn(),
		offer: wish.getOffer()?.toJavaScript() as O,
	};
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
export const createRemote = (remote: rpc.Remote): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.createRemote(remote, cb));
export const deleteRemote = (remote: rpc.Remote): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.deleteRemote(remote, cb));
export const refreshOffer = (offer: rpc.Offer): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.refreshOffer(offer, cb));
export const updateOffer = (offer: rpc.Offer): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.updateOffer(offer, cb));
export const deleteOffer = (offer: rpc.Offer): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.deleteOffer(offer, cb));
export const getWish = (wish: rpc.Wish): Promise<rpc.Wish> =>
	resourcesClientRpc((client, cb) => client.getWish(wish, cb));
export const wishDeleted = (wish: rpc.Wish): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.wishDeleted(wish, cb));

const resourceService = (): Omit<ResourcesService, 'stop'> & { server: rpc.IResourcesServer } => {
	class ResourcesServer implements rpc.IResourcesServer {
		[name: string]: grpc.UntypedHandleCall;

		createRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote created');
			remoteCreated.push(remote.toObject());
			cb(null, new Empty());
		}

		deleteRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote deleted');
			remoteDeleted.push(remote.toObject());
			cb(null, new Empty());
		}

		refreshOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer refreshed');
			offerRefreshed.push(toOffer(offer));
			cb(null, new Empty());
		}

		updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer updated');
			offerUpdated.push(toOffer(offer));
			cb(null, new Empty());
		}

		deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Withdrawing offer');
			offerWithdrawn.push([toOffer(offer), (error) => cb(error, new Empty())]);
		}

		getWish(call: grpc.ServerUnaryCall<rpc.Wish, rpc.Wish>, cb: sendUnaryData<rpc.Wish>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Polling remote offer');
			wishPolled.push([toWish(wish), cb]);
		}

		wishDeleted(call: grpc.ServerUnaryCall<rpc.Wish, Empty>, cb: sendUnaryData<Empty>): void {
			const wish = call.request as rpc.Wish;
			logger.info(wish, 'Wish deleted');
			wishDeleted.push(toWish(wish));
			cb(null, new Empty());
		}
	}

	const remoteCreated = sinkStream<Remote>();
	const remoteDeleted = sinkStream<Remote>();
	const offerRefreshed = sinkStream<Offer<unknown>>();
	const offerUpdated = sinkStream<Offer<unknown>>();
	const offerWithdrawn = sinkStream<[Offer<unknown>, (error: Error | null) => void]>();
	const wishPolled = sinkStream<
		[Wish<unknown>, (error: Error | null, wish: rpc.Wish | null) => void]
	>();
	const wishDeleted = sinkStream<Wish<unknown>>();

	return {
		server: new ResourcesServer(),
		remoteCreated,
		remoteDeleted,
		offerRefreshed,
		offerUpdated,
		offerWithdrawn,
		wishPolled,
		wishDeleted,
	};
};

export type Remote = rpc.Remote.AsObject;
export type Offer<O> = Omit<rpc.Offer.AsObject, 'offer'> & { offer?: O };
export type Wish<O> = Omit<rpc.Wish.AsObject, 'offer'> & { offer?: O };
export type ResourcesService = {
	remoteCreated: Stream<Remote>;
	remoteDeleted: Stream<Remote>;
	offerRefreshed: Stream<Offer<unknown>>;
	offerUpdated: Stream<Offer<unknown>>;
	offerWithdrawn: Stream<[Offer<unknown>, (error: Error | null) => void]>;
	wishPolled: Stream<[Wish<unknown>, (error: Error | null, wish: rpc.Wish | null) => void]>;
	wishDeleted: Stream<Wish<unknown>>;
	stop: () => Promise<void>;
};
export const startResourcesService = async (
	host: string,
	port: number
): Promise<ResourcesService> => {
	resourcesClientHost = host;
	resourcesClientPort = port;
	const service = resourceService();
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
