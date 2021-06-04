# WebPage Example

This project contains multiple versions of a deployment of a simple static webpage that is hosted on AWS S3.
It is based on a [Pulumi Automation API example](https://github.com/pulumi/automation-api-examples/tree/main/nodejs/inlineProgram-ts).

Under `./src` we provide the following deployments:

```
├── central-mjuz        Single, centralized µs deployment, reactively updating the page content every 20 seconds.
├── central-reference   Centralized Pulumi deployment of a static page.
├── decentral-mjuz      Decentralized µs deployment (automated coordination).
│   ├── bucket          The S3 bucket.
│   └── content         The index.html in the bucket.
└── decentral-reference Decentralized Pulumi deployment using stack references (manual coordination).
    ├── bucket          The S3 bucket.
    └── content         The index.html in the bucket.
```

## Usage

All examples can be executed in interactive bash sessions in the [mjuz/mjuz](https://hub.docker.com/r/mjuz/mjuz) Docker image;
please refer to [its documentation](../README.md#docker), especially the [interactive usage guide](../README.md#interactive-usage).
For the decentralized examples,
run both deployments in separate bash sessions on the same container.
In the case of µs, this is required to enable the network communication between the deployments
(Alternatively, the deployment's TCP/IP ports could be exposed to connect deployment in separate containers; however,
we skip this here for simplicity).
For Pulumi stack references, this is required to access the deployment state of the bucket deployment in the content deployment.

All examples require setting up AWS Resource management, as explained [here](../README.md#managing-aws-resources).

All examples exclusively deploy AWS S3 resources in the region `us-east-1`.
You can log into the [AWS Management Console](https://console.aws.amazon.com/) in your webbrowser with your AWS account
to see the created resources.
To see that the website's bucket was created or removed,
look at the [AWS S3 Buckets Dashboard](https://s3.console.aws.amazon.com/s3/home?region=us-east-1).
To see that the content document was created, click on the Bucket name in the dashboard (e.g., website-75227c5),
showing you a list of the objects in the bucket.
If you see an `index.html` object here, the content is deployed.
Alternatively, have a look at the console output of the bucket deployment,
where the S3 Bucket URL should be printed when the bucket is deployed, e.g., `website-1b2bce9.s3-website-us-east-1.amazonaws.com`.
Open this URL in your web browser:

* If you see a page stating "Hello World!", the bucket and content are successfully deployed.
* If you see an error 404 page stating "Code: NoSuchBucket", the bucket is not deployed.
* If you see an error 404 page stating "Code: NoSuchKey", the bucket is deployed, but not the content.

The µs examples below are executed with `-v trace`.
This parameter only increases the verbosity of the logging, showing you what µs is doing.
It is not necessary, but as this is an example, we assume that you are interested in finding out what is going on.
Also, you do not need to be afraid by "trace". µs' logging is not very chatty. 

## Central µs

Everything in a single stack managed by µs.
The content is reactively updated every 20 seconds.
This example deployment showcases how to leverage µs' reactive engine to update deployments automatically
based on external events.

### Deploy

```bash
cd src/central-mjuz
ts-node . -v trace
```

After the initial deploy, the deployment automatically re-executes every 20 seconds to update the page content.

### Terminate

Stop deployments safely, but do not undeploy resources by `SIGQUIT` interrupt (Ctrl + \ or `kill -3 [PROCESS ID]`).

### Destroy

Stop deployments safely after undeploying all resources by `SIGINT` interrupt (Ctrl + C or `kill -2 [PROCESS ID]`).

## Central Reference

Everything in a single stack managed by Pulumi.

### Setup/Deploy

```bash
cd src/central-reference

# Create stack and configure
pulumi stack init CentralReference
pulumi config set aws:region us-east-1

# Deploy
pulumi up -y
```

### Destroy/Undeploy

```bash
cd src/central-reference

# Undeploy
pulumi destroy -y

# Delete stack
pulumi stack rm CentralReference
```

## Decentral µs

Bucket and content are in separate stacks managed by separate µs deployments.
The stacks are connected using an offer and a wish: the bucket is offered to the content deployment.
The deployment order coordination is automated, the stacks can be safely deployed and destroyed in any order.
Run each deployment in a separate bash and start the deployments, stop them without undeploying (terminate),
and stop them with undeployment (destroy) in different orders to explore µs' automated coordination.
Note that for the undeployment of the bucket, the content deployment must be available.
This is due to µs only deleting offers when it knows no other deployment has resources deployed anymore that depend on them.
If the content deployment is not available,
undeploying the bucket deployment will wait indefinitely for the content deployment to connect and release the deployment.
You can observe that the content deployment automatically and only deploys `index.html` when the bucket is deployed
and always undeploys the object before the bucket is undeployed.

### Deploy

Start deployments.

#### Bucket

```bash
cd src/decentral-mjuz/bucket
ts-node . -v trace
```

#### Content

```bash
cd src/decentral-mjuz/content
ts-node . -v trace
```

### Terminate

Stop deployments safely, but do not undeploy resources by `SIGQUIT` interrupt (Ctrl + \ or `kill -3 [PROCESS ID]`).

### Destroy

Stop deployments safely after undeploying all resources by `SIGINT` interrupt (Ctrl + C or `kill -2 [PROCESS ID]`).

## Decentral Reference

Bucket and content are in separate stacks managed by Pulumi.
They are connected using Pulumi's [stack references](https://www.pulumi.com/docs/intro/concepts/stack/#stackreferences). This requires manual coordination:
The bucket stack must be deployed before the content stack, and the content stack must be destroyed before  the bucket
stack.

### Setup/Deploy

#### Bucket

```bash
cd src/decentral-reference/bucket

# Create stack and configure
pulumi stack init PulumiBucket
pulumi config set aws:region us-east-1

# Deploy
pulumi up -y
```

#### Content

```bash
cd src/decentral-reference/content

# Create stack and configure
pulumi stack init PulumiContent
pulumi config set aws:region us-east-1
pulumi config set bucketStack PulumiBucket

# Deploy
pulumi up -y
```

### Destroy/Undeploy

#### Bucket

```bash
cd src/decentral-reference/bucket

# Undeploy
pulumi destroy -y

# Delete stack
pulumi stack rm PulumiBucket
```

#### Content

```bash
cd src/decentral-reference/content

# Undeploy
pulumi destroy -y

# Delete stack
pulumi stack rm PulumiContent
```

