import Pino, { Level, Logger } from 'pino';

const rootLogger = Pino({
	prettyPrint: {
		ignore: 'hostname',
		hideObject: true,
	},
	level: 'info',
});
const childLoggers: Logger[] = [];

export const newLogger = (name: string): Logger => {
	const logger = rootLogger.child({ c: name });
	childLoggers.push(logger);
	return logger;
};

export const setLogLevel = (level: Level): void => {
	rootLogger.level = level;
	childLoggers.forEach((logger) => (logger.level = level));
};
