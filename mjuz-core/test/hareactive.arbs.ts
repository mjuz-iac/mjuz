import { Future, never, Stream, Time } from '@funkia/hareactive';
import { testFuture, testStreamFromArray } from '@funkia/hareactive/testing';
import * as fc from 'fast-check';

export type OccurringFutureArbConstraints = {
	minTime?: number;
	maxTime?: number;
};
export const occurringFutureArb = <T>(
	valueArb: fc.Arbitrary<T>,
	constraints: OccurringFutureArbConstraints = {}
): fc.Arbitrary<Future<T>> => {
	const time = fc.double({
		next: true,
		min: constraints.minTime,
		max: constraints.maxTime,
		noNaN: true,
	});
	return fc.tuple(time, valueArb).map((t) => testFuture(...t));
};

export type FutureArbConstraints = OccurringFutureArbConstraints & {
	// Probability to return never future is 1/freq. If false, future always occurs. Defaults to 5 (20%).
	freq?: number | false;
};
export const futureArb = <T>(
	value: fc.Arbitrary<T>,
	constraints: FutureArbConstraints = {}
): fc.Arbitrary<Future<T>> =>
	constraints.freq === false
		? occurringFutureArb(value, constraints)
		: fc.option(occurringFutureArb(value, constraints), {
				freq: constraints.freq,
				nil: never,
		  });

export type StreamArbConstraints<T> = {
	minEvents?: number;
	maxEvents?: number;
	minTime?: number;
	maxTime?: number;
	filterEvents?: ([t, v]: [Time, T]) => boolean;
};
export const streamArb = <T>(
	valueArb: fc.Arbitrary<T>,
	constraints: StreamArbConstraints<T> = {}
): fc.Arbitrary<Stream<T>> => {
	const eventArb = fc
		.tuple(
			fc.double({
				next: true,
				min: constraints.minTime,
				max: constraints.maxTime,
				noNaN: true,
			}),
			valueArb
		)
		.filter(constraints.filterEvents || (() => true));
	return fc
		.array(eventArb, {
			minLength: constraints.minEvents,
			maxLength: constraints.maxEvents,
		}) // Stream array must be sorted for correct semantics
		.map((s) => s.sort((a, b) => a[0] - b[0]))
		.map(testStreamFromArray);
};
