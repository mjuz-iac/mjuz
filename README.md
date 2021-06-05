[![DOI](https://zenodo.org/badge/373524328.svg)](https://zenodo.org/badge/latestdoi/373524328)
[![GitHub version](https://badge.fury.io/gh/mjuz-iac%2Fmjuz.svg)](https://badge.fury.io/gh/mjuz-iac%2Fmjuz)
[![npm version](https://badge.fury.io/js/%40mjuz%2Fcore.svg)](https://badge.fury.io/js/%40mjuz%2Fcore)

# µs Infrastructure as Code

[µs](https://mjuz.rocks) is a modern, declarative infrastructure as code (IaC) solution based on [Pulumi](https://pulumi.com) and Typescript.
It enables safe deployments in DevOps organizations with cross-functional teams
by inventing decentralized automated deployment coordination.

With µs, teams independently specify their deployments – similar to AWS CDK or Pulumi.
In contrast to these solutions, however,
µs provides a mechanism to satisfy dependencies across deployments
without manual coordination via, e.g., mail, chat, or phone.
Developers define a *wish* from another deployment,
and make the deployment of their resources dependent on its satisfaction.
The other deployments satisfy these wishes
by defining a corresponding *offer*.
To automate deployment coordination,
the deployments are continuously running processes of the  µs runtime and not – as common today – one-off tasks.
The deployments communicate and ensure that resources depending on wishes are
only deployed when the wishes are satisfied by corresponding offers.
µs guarantees the correct deployment and undeployment order
for dependencies across deployments of different teams without introducing a central authority
nor requiring  manual coordination.
Learn more on the [website](https://mjuz.rocks) and in the [paper](https://mjuz.rocks/assets/pdf/papers/2021_Automating-Serverless-Deployments-for-DevOps-Organizations.pdf).

## Repository Structure

```
├── mjuz-core        µs SDK and runtime.
├── mjuz-grpc-protos µs GRPC prototype definitions.
├── patches          Manual patches applied to dependencies (mostly quick-fixes).
└── webpage          Simple example project, showcasing µs in various versions and comparing it to Pulumi.
```

## Getting Started

µs is a TypeScript library and an altered version of the Pulumi CLI.
Using it is similar to Pulumi TypeScript:
You develop an IaC program with the µs library and run it together with the deployment engine shipped in the CLI.

1. Setup the TypeScript project for your deployment.
	
	* Add `@mjuz/core` and its peer dependencies to the dependencies of your project.
	  All µs packages are available on NPM.
	* Write your IaC program as an async function as you do it with [Pulumi](https://pulumi.com). 
	  You can use all Pulumi TypeScript resources and providers in addition to the remote connection, offer,
	  and wish resources provided by µs.
	* Run your IaC program in µs' `runDeployment` function: the heart of the deployment's runtime.
	* *For reference, take a look at our [webpage example](webpage),
	  configuring a µs [package.json](webpage/package.json),
	  a [centralized µs deployment](webpage/src/central-mjuz/index.ts),
	  and a decentralized µs deployment,
	  where two deployments ([1](webpage/src/decentral-mjuz/bucket/index.ts), [2](webpage/src/decentral-mjuz/content/index.ts)) are connected.*
	
2. Install the [Pulumi for µs](https://github.com/mjuz-iac/pulumi) CLI as drop-in replacement for the official Pulumi CLI.

	* Follow the instruction in the [CLI's repository](https://github.com/mjuz-iac/pulumi)
	  or use the provided Docker container. The `pulumi` command must be available when running a µs deployment.
	  This can be checked by running `pulumi version` before starting µs. The command should only print the CLI version,
	  which must contain the string `-mjuz`.
	* µs uses its own versioning scheme, requiring that the CLI version validation in the underlying Pulumi API
	  is disabled. Do so by setting the environment variable `PULUMI_AUTOMATION_API_SKIP_VERSION_CHECK` when
	  executing µs.
	
## Docker

We provide a Docker image of this repository on Docker Hub as [mjuz/mjuz](https://hub.docker.com/r/mjuz/mjuz).
It contains preinstalled all dependencies and this repository's content in `/var/mjuz`,
including the setup of the required [Pulumi for µs](https://github.com/mjuz-iac/pulumi) CLI (the image is based on [mjuz/pulumi](https://hub.docker.com/r/mjuz/mjuz)).
To simplify testing, it is preconfigured to store deployment state on the local filesystem inside the container,
instead of the Pulumi Cloud (`pulumi login --local`).
As passphrase for all operations on the state files "PASS" is preconfigured (environment variable default: `PULUMI_CONFIG_PASSPHRASE=PASS`).
If you want to use the container for more than testing purposes,
replace the passphrase and configure Pulumi's backend to persist the deployment state in a durable storage outside the container,
e.g., the Pulumi Cloud, AWS S3, or a persistent filesystem (cf. [Pulumi's Backends](https://www.pulumi.com/docs/intro/concepts/state/)).
For more details on the container setup,
look at the images build definition [Dockerfile](Dockerfile).

### Interactive Usage

Start an interactive bash session in a transient container that automatically is disposed on exit:

```bash
docker run --rm -ti mjuz/mjuz
```

Run multiple, separate interactive bash sessions in a named durable container
(replace `<NAME>` with a unique container name):

```bash
# Start an indefinitely running container.
docker run -d --name <NAME> mjuz/mjuz tail -f /dev/null

# Start an interactive bash session in the container (do this multiple times in parallel).
# Exiting such a session will not stop nor dispose the container.
docker exec -ti <NAME> bash

# Stop the container
docker kill <NAME>
# Restart the container
docker start <NAME>
# Dispose the container (after stopping)
docker rm <NAME>
```

## Managing AWS Resources

To manage AWS resources, you need to provide credentials for your AWS account to the [Pulumi for µs](https://github.com/mjuz-iac/pulumi) CLI.
The Pulumi documentation provides a [detailed manual](https://pulumi.io/install/aws.html) for this.

There are two simple ways to use AWS with the [mjuz/mjuz](https://hub.docker.com/r/mjuz/mjuz) Docker image:

1. Provide the credentials as environment variables to the container.

	* Set the environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the run command of the container by adding:
	  ```bash
	  -e AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY_ID> -e AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_ACCESS_KEY>
	  ```
	* This can be applied to all `docker run` commands shown [above](#interactive-usage). For example:
	  ```bash
	  docker run --rm -ti -e AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY_ID> -e AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_ACCESS_KEY> mjuz/mjuz
	  ```
	
2. Share a local credentials file with the container, e.g., created by logging into the AWS CLI.

	* For an explanation of the file format and how it can be generated using the AWS CLI, please look at the [Pulumi's documentation on it](https://pulumi.io/install/aws.html).
	* Add a bind mount to your `docker run` command mounting the credentials file at `/home/user/.aws/credentials`.
	  E.g., if your credentials file is at `$HOME/.aws/credentials` (default of the AWS CLI), add:
	  ```bash
	  -v $HOME/.aws/credentials:/home/user/.aws/credentials
	  ```
      *Make sure to use absolute paths as Docker's bind mounts do not support relative paths.*
	* This can be applied to all `docker run` commands shown [above](#interactive-usage). For example:
	  ```bash
	  docker run --rm -ti -v $HOME/.aws/credentials:/home/user/.aws/credentials mjuz/mjuz
	  ```

## Development Setup

To develop in this repository you need a global installation of Yarn (install by `npm install -g yarn`).
To execute TypeScript projects directly, installing `ts-node` can be handy (`npm install -g ts-node`).
To setup the projects in this repository, link all dependencies and apply patches for development
you only need to run:

```bash
yarn install
```

The projects in this repo provide at least the following commands:

* `yarn build`: Build the project
* `yarn clean`: Delete the project built
* `yarn lint`: Run the linter on the project
* `yarn test`: Run the project's tests

Executing `yarn build`, `yarn clean` or `yarn lint` in the repository's root
runs the corresponding action on each project.

## Known Problems (and Solution)

### Pulumi Automation API broken

Make sure that everything links against the same package installation. If µs and the using NPM package use different copies of the pulumi packages, RPCs with the CLI may break.

### Pulumi CLI halts on handled interrupts

If the µs program handles interrupts (e.g., SIGINT) they still get forwarded to the Pulumi CLI, if it is running.
This causes the CLI to abort its action.
To avoid the CLI from receiving the interrupt it needs to be executed in detached mode, requiring a patch of the pulumi package.
In this monorepo this patch is automatically performed by patch-package in the postinstall hook of this repo's root and is automatically executed with `yarn install`.
More details on this issue: https://github.com/pulumi/pulumi/issues/6334

### Pulumi fails to load module

The automation API by default runs the inline program in a tmp directory.
This breaks the resolution of modules which are required, e.g., for dynamic resources as used by µs.
This can be solved by setting the workspace's work directory to the cwd (`.`).
More details on this issue: https://github.com/pulumi/pulumi/issues/5578

### gRPC fails in dynamic resource

The Pulumi resource serialization breaks generated gRPC code.
To solve this issue, the generated gRPC source is outsourced to `@mjuz/grpc-protos`
(because Pulumi does not serialize external packages but loads them directly).
However, Pulumi serializes an external package, if it is not plainly installed to `node_modules`, but only symlinked.
Thus, for development, `@mjuz/grpc-protos` must be copied into `@mjuz/core`'s dependencies and cannot only be linked.
This is implemented in the postinstall hook of this repo's root and is automatically executed with `yarn install`.
