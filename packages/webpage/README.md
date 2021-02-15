# `webpage`

Example of a S3 hosted webpage.

Assumes `ts-node` and `pino-pretty` to be installed:

```
npm i -g ts-node pino-pretty
```

## Central µs

Everything in a single stack managed by µs.

### Deploy

Start with empty Pulumi config passphrase and pretty printed logging.

```
cd src/central-mjus
PULUMI_CONFIG_PASSPHRASE= ts-node index.ts | pino-pretty -c -l
```

### Terminate

Stop deployment safely, but do not undeploy resources by `SIGINT` interrupt (Ctrl + C or `kill -SIGINT`).

### Terminate

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

## Decentral Reference

Bucket and content are in separate stacks, connected using Pulumi's stack references.

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

