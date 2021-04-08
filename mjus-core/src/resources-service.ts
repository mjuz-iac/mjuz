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

export const toRpcWish = <O>(wish: Wish<O>): rpc.Wish => {
	const w = new rpc.Wish()
		.setTargetid(wish.targetid)
		.setName(wish.name)
		.setIswithdrawn(wish.iswithdrawn);
	if (wish.offer) w.setOffer(Value.fromJavaScript(wish.offer));
	return w;
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
export const getWish = (wish: rpc.Wish): Promise<rpc.Wish> =>
	resourcesClientRpc((client, cb) => client.getWish(wish, cb));
export const wishDeleted = (wish: rpc.Wish): Promise<Empty> =>
	resourcesClientRpc((client, cb) => client.wishDeleted(wish, cb));

const resourceService = (): Omit<ResourcesService, 'stop'> & { server: rpc.IResourcesServer } => {
	class ResourcesServer implements rpc.IResourcesServer {
		[name: string]: grpc.UntypedHandleCall;

		updateRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote created');
			remoteUpdated.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		refreshRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote refreshed');
			remoteRefreshed.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		deleteRemote(
			call: grpc.ServerUnaryCall<rpc.Remote, Empty>,
			cb: sendUnaryData<Empty>
		): void {
			const remote = call.request as rpc.Remote;
			logger.info(remote, 'Remote deleted');
			remoteDeleted.push(fromRpcRemote(remote));
			cb(null, new Empty());
		}

		updateOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer updated');
			offerUpdated.push(fromRpcOffer(offer));
			cb(null, new Empty());
		}

		refreshOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Offer refreshed');
			offerRefreshed.push(fromRpcOffer(offer));
			cb(null, new Empty());
		}

		deleteOffer(call: grpc.ServerUnaryCall<rpc.Offer, Empty>, cb: sendUnaryData<Empty>): void {
			const offer = call.request as rpc.Offer;
			logger.info(offer, 'Withdrawing offer');
			offerWithdrawn.push([fromRpcOffer(offer), (error) => cb(error, new Empty())]);
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

	const remoteUpdated = sinkStream<Remote>();
	const remoteRefreshed = sinkStream<Remote>();
	const remoteDeleted = sinkStream<Remote>();
	const offerUpdated = sinkStream<Offer<unknown>>();
	const offerRefreshed = sinkStream<Offer<unknown>>();
	const offerWithdrawn = sinkStream<[Offer<unknown>, (error: Error | null) => void]>();
	const wishPolled = sinkStream<
		[Wish<unknown>, (error: Error | null, wish: rpc.Wish | null) => void]
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

export type Wish<O> = Omit<rpc.Wish.AsObject, 'offer'> & { offer?: O };
export type ResourcesService = {
	remoteUpdated: Stream<Remote>;
	remoteRefreshed: Stream<Remote>;
	remoteDeleted: Stream<Remote>;
	offerUpdated: Stream<Offer<unknown>>;
	offerRefreshed: Stream<Offer<unknown>>;
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
