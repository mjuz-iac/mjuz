# Decentralized Deployments

Decentralized Deployments IaC using Pulumi and TypeScript.

## Structure

`└─ packages`\
`   └─ mjus` µs\
`   └─ teastore` TeaStore Case Study\
`   └─ webpage` Webpage Case Study\

## Development Setup

Setup and link all dependencies for development:

```
npm install
```

Remove all dependencies

```
npm run clean
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
