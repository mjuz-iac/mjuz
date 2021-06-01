import Pino, { Logger } from 'pino';

const rootLogger = Pino({
	level: 'debug',
});

export const newLogger = (name: string): Logger => {
	return rootLogger.child({ c: name });
};
