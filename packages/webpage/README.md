# `webpage`

Example of a S3 hosted webpage.

## Central Reference

Everything in a single stack.

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

Bucket and content are in separate stacks, connceted using Pulumi's stack references.

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

