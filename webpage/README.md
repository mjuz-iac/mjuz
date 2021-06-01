# WebPage Case Study

Example of a S3 hosted webpage. Based on inline program ts pulumi automation API example: https://github.com/pulumi/automation-api-examples/tree/main/nodejs/inlineProgram-ts

In the following, we assume `ts-node` and `pino-pretty` are installed:

```
npm i -g ts-node pino-pretty
```

## Central µs

Everything in a single stack managed by µs. Page content is reactively updated every 20 seconds.

### Deploy

Start with empty Pulumi config passphrase and pretty printed logging.

```
cd src/central-mjuz
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l -i pid,hostname -H
```

### Terminate

Stop deployment safely, but do not undeploy resources by `SIGINT` interrupt (Ctrl + C or `kill -SIGINT`).

### Destroy

Stop deployment safely after undeploying all resources by `SIGTERM` interrupt (`kill`).

## Central Reference

Everything in a single stack managed by Pulumi.

### Setup/Deploy

```
cd src/central-reference

# Create stack and configure
pulumi stack init demo
pulumi config set aws:region us-east-1

# Deploy
pulumi up
```

### Destroy/Undeploy

```
cd src/central-reference

# Undeploy
pulumi destroy

# Delete stack
pulumi stack rm demo
```

## Decentral µs

Bucket and content are in separate stacks managed by separate µs programs. The stacks are connected using an offer and a
wish. The deployment order coordination is automated, the stacks can be safely deployed and destroyed in any order.

### Deploy

Start with empty Pulumi config passphrase and pretty printed logging.

#### Bucket

```
cd src/decentral-mjuz/bucket
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l -i pid,hostname -H
```

#### Content

```
cd src/decentral-mjuz/content
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l -i pid,hostname -H
```

### Terminate

Stop deployment safely, but do not undeploy resources by `SIGINT` interrupt (Ctrl + C or `kill -SIGINT`).

### Destroy

Stop deployment safely after undeploying all resources by `SIGTERM` interrupt (`kill`).

## Decentral µs Stack Reference

Bucket and content are in separate stacks managed by separate µs programs. The stacks are connected using Pulumi's stack
references (like in Decentral Reference) and *not* with an offer and a wish (like in Decentral µs). This requires manual
coordination: The bucket stack must be deployed before the content stack, and the content stack must be destroyed before
the bucket stack.

### Deploy

Start with empty Pulumi config passphrase and pretty printed logging.

```
cd src/decentral-mjuz-stackref

# Start bucket stack
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l -i pid,hostname -H

# Start content stack (in parallel to the bucket, e.g., in another terminal)
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l -i pid,hostname -H
```

### Terminate

Stop deployments safely, but do not undeploy resources by `SIGINT` interrupt (Ctrl + C or `kill -SIGINT`).

### Destroy

Stop deployments safely after undeploying all resources by `SIGTERM` interrupt (`kill`).

## Decentral Reference

Bucket and content are in separate stacks, connected using Pulumi's stack references. This requires manual coordination:
The bucket stack must be deployed before the content stack, and the content stack must be destroyed before  the bucket
stack.

### Setup/Deploy

#### Bucket
```
cd src/decentral-reference/bucket

# Create stack and configure
pulumi stack init demo-bucket
pulumi config set aws:region us-east-1

# Deploy
pulumi up
```

#### Content
```
cd src/decentral-reference/content

# Create stack and configure
pulumi stack init demo-conent
pulumi config set aws:region us-east-1
pulumi config set bucketStack demo-bucket

# Deploy
pulumi up
```

### Destroy/Undeploy

#### Content
```
cd src/decentral-reference/content

# Undeploy
pulumi destroy

# Delete stack
pulumi stack rm demo-content
```

#### Bucket
```
cd src/decentral-reference/bucket

# Undeploy
pulumi destroy

# Delete stack
pulumi stack rm demo-bucket
```

