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

# Problems & Soluation

## Pulumi Automation API broken

Make sure that everything links against the same package installation. If µs and the using NPM package use different copies of the pulumi packages, RPCs with the CLI may break.

## Pulumi CLI halts on handled interrupts

If the µs program handles interrupts (e.g., SIGINT) they still get forwarded to the Pulumi CLI, if it is running.
This causes the CLI to abort its action.
To avoid the CLI from receiving the interrupt it needs to be executed in detached mode, requiring a patch of the pulumi package.
In this monorepo this patch is automatically performed by patch-package during `npm install` in the root directory.
