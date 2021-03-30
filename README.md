# Decentralized Deployments

Decentralized Deployments IaC using Pulumi and TypeScript.

## Structure

`├── mjus-core` µs core SDK and runtime\
`├── mjus-grpc-protos` µs GRPC prototype definitions\
`├── patches` manual patches applied to dependencies (mostly quick-fixes)\
`├── teastore` TeaStore Case Study\
`└── webpage` Webpage Case Study

## Development Setup

Setup, link all dependencies and apply patches for development:

```
yarn install
```

# Problems (and Solution)

## Pulumi Automation API broken

Make sure that everything links against the same package installation. If µs and the using NPM package use different copies of the pulumi packages, RPCs with the CLI may break.

## Pulumi CLI halts on handled interrupts

If the µs program handles interrupts (e.g., SIGINT) they still get forwarded to the Pulumi CLI, if it is running.
This causes the CLI to abort its action.
To avoid the CLI from receiving the interrupt it needs to be executed in detached mode, requiring a patch of the pulumi package.
In this monorepo this patch is automatically performed by patch-package during `npm install` in the root directory.
More details on this issue: https://github.com/pulumi/pulumi/issues/6334

## Pulumi fails to load module

The automation API by default runs the inline program in a tmp directory.
This breaks the resolution of modules which are required, e.g., for dynamic resources as used by µs.
This can be solved by setting the workspace's work directory to the cwd (`.`).
More details on this issue: https://github.com/pulumi/pulumi/issues/5578

## Jest tests fail if using Pulumi's closure serialization

This is required for dynamic resources (as used by µs) and more.
The current workaround is not to use jest for such integration tests.
More details on this issue: https://github.com/pulumi/pulumi/issues/3799

This problem is solved by [PR6648](https://github.com/pulumi/pulumi/pull/6648).
The patch is applied to this repository using patch-package.
It be removed once [PR6648](https://github.com/pulumi/pulumi/pull/6648) is in the used Pulumi release.

## GRPC fail in dynamic resource

The Pulumi resource serialization breaks generated gRPC code.
To solve this issue, the generated gRPC source is outsourced to `@mjus/grpc-protos`
(because Pulumi does not serialize external packages but loads them directly).
However, Pulumi serializes external package, if it is not plainly installed to node_modules, but only symlinked.
Thus, for development, `@mjus/grpc-protos` must be copied into `@mjus/core`'s dependencies and cannot only be linked.
This is implemented in `npm install` in the repo root.
