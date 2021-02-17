import { Input, Output } from '@pulumi/pulumi';

export type WrappedInputs<T> = {
	[P in keyof T]: Input<T[P]>;
};
export type WrappedOutputs<T> = {
	[P in keyof T]: Output<T[P]>;
};

// Exclude key type K from T
export type Without<T, K> = Pick<T, Exclude<keyof T, K>>;
