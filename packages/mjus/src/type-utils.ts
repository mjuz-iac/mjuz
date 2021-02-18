import { Input, Output } from '@pulumi/pulumi';

export type WrappedInputs<T> = {
	[P in keyof T]: Input<T[P]>;
};
export type WrappedOutputs<T> = {
	[P in keyof T]: Output<T[P]>;
};
