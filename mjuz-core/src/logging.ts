import Pino, { Logger } from 'pino';

const rootLogger = Pino({
	prettyPrint: {
		ignore: 'hostname',
		hideObject: true,
	},
	level: 'debug',
});

export const newLogger = (name: string): Logger => {
	return rootLogger.child({ c: name });
};
