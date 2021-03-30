import { Future, sinkFuture } from '@funkia/hareactive';
import Timeout = NodeJS.Timeout;

export const sigint: () => Future<void> = () => {
	const f = sinkFuture<void>();
	process.on('SIGINT', () => f.resolve());
	return f;
};

export const sigterm: () => Future<void> = () => {
	const f = sinkFuture<void>();
	process.on('SIGTERM', () => f.resolve());
	return f;
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const keepAlive = (): Timeout => setInterval(() => {}, 2147483647);
