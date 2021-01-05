import * as pulumi from '@pulumi/pulumi';
import * as awsx from '@pulumi/awsx';

const allTcpEgressArgs = awsx.ec2.SecurityGroupRule.egressArgs(
	new awsx.ec2.AnyIPv4Location(),
	new awsx.ec2.AllTcpPorts()
);

const config = new pulumi.Config();
const registryStack = new pulumi.StackReference(config.require('registryStack'));
const persistenceStack = new pulumi.StackReference(config.require('persistenceStack'));
const stackInputs = [
	registryStack.requireOutput('vpcId'),
	registryStack.requireOutput('vpcPrivateSubnetsIds') as pulumi.Output<string[]>,
	registryStack.requireOutput('clusterName'),
	registryStack.requireOutput('registrySGId'),
	registryStack.requireOutput('registryPort'),
	registryStack.requireOutput('registryDnsName'),
	persistenceStack.requireOutput('persistenceSGId'),
	persistenceStack.requireOutput('persistencePort'),
];

function deployment([
	vpcId,
	privateSubnetsIds,
	clusterName,
	registrySGId,
	registryPort,
	registryDnsName,
	persistenceSGId,
	persistencePort,
]: pulumi.Unwrap<typeof stackInputs>) {
	const vpc = awsx.ec2.Vpc.fromExistingIds('vpc', {
		vpcId: vpcId,
		privateSubnetIds: privateSubnetsIds,
	});
	const cluster = new awsx.ecs.Cluster('cluster', {
		vpc: vpc,
		cluster: clusterName,
		securityGroups: [],
	});
	const registrySG = awsx.ec2.SecurityGroup.fromExistingId('registry', registrySGId, {
		vpc: vpc,
	});
	const persistenceSG = awsx.ec2.SecurityGroup.fromExistingId('persistence', persistenceSGId, {
		vpc: vpc,
	});

	/*******************************************************************************************************************
	 * IMAGE
	 ******************************************************************************************************************/

	const imagePort = 8080;
	const imageSG = new awsx.ec2.SecurityGroup('image', {
		vpc: vpc,
		egress: [allTcpEgressArgs],
	});
	registrySG.createIngressRule('registry-inbound-image', {
		location: { sourceSecurityGroupId: imageSG.id },
		ports: new awsx.ec2.TcpPorts(registryPort),
	});
	persistenceSG.createIngressRule('persistence-inbound-image', {
		location: { sourceSecurityGroupId: imageSG.id },
		ports: new awsx.ec2.TcpPorts(persistencePort),
	});

	new awsx.ecs.FargateService(
		'image',
		{
			assignPublicIp: false,
			cluster: cluster,
			subnets: vpc.getSubnetsIds('private'),
			taskDefinitionArgs: {
				container: {
					image: awsx.ecs.Image.fromPath(
						'image',
						'../../../../../../TeaStore/services/tools.descartes.teastore.image'
					),
					cpu: 512 /*10% of 1024*/,
					memory: 1024 /*MB*/,
					portMappings: [{ containerPort: imagePort }],
					environment: [
						{ name: 'USE_POD_IP', value: 'true' },
						{ name: 'REGISTRY_HOST', value: registryDnsName },
						{ name: 'REGISTRY_PORT', value: `${registryPort}` },
					],
				},
			},
			desiredCount: 1,
			securityGroups: [imageSG],
		}
		//{ dependsOn: [registry, persistence] }
	);
	return {
		imageSGId: imageSG.id,
		imagePort: imagePort,
	};
}

module.exports = pulumi.all(stackInputs).apply(deployment);
