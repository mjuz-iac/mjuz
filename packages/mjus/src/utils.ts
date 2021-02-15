import { Future, sinkFuture } from '@funkia/hareactive';
import Timeout = NodeJS.Timeout;

export const sigint: Future<void> = sinkFuture();
process.on('SIGINT', () => sigint.resolve());

export const sigterm: Future<void> = sinkFuture();
process.on('SIGTERM', () => sigterm.resolve());

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const keepAlive = (): Timeout => setInterval(() => {}, 2147483647);
