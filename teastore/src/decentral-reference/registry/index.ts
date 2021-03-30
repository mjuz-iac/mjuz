import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const allTcpIngressArgs = awsx.ec2.SecurityGroupRule.ingressArgs(
	new awsx.ec2.AnyIPv4Location(),
	new awsx.ec2.AllTcpPorts()
);
const allTcpEgressArgs = awsx.ec2.SecurityGroupRule.egressArgs(
	new awsx.ec2.AnyIPv4Location(),
	new awsx.ec2.AllTcpPorts()
);

/***********************************************************************************************************************
 * NETWORK
 **********************************************************************************************************************/

const vpc = new awsx.ec2.Vpc('vpc', {
	numberOfAvailabilityZones: 2,
	numberOfNatGateways: 0, // 0 prohibits internet access from private subnets; defaults to numberOfAvailabilityZones
});

// Required to pull container images
const containerRegistrySG = new awsx.ec2.SecurityGroup('container-registry', {
	vpc: vpc,
	ingress: [allTcpIngressArgs],
});
const ecrEndpoint = new aws.ec2.VpcEndpoint('ecr', {
	vpcId: vpc.id,
	serviceName: `com.amazonaws.${aws.config.region}.ecr.dkr`,
	vpcEndpointType: 'Interface',
	securityGroupIds: [containerRegistrySG.id],
	subnetIds: vpc.privateSubnetIds,
	privateDnsEnabled: true,
});
const s3Endpoint = new aws.ec2.VpcEndpoint('s3', {
	vpcId: vpc.id,
	serviceName: `com.amazonaws.${aws.config.region}.s3`,
	routeTableIds: vpc.privateSubnets.then(
		(subnets) =>
			subnets
				.map((subnet) => subnet.routeTable?.id)
				.filter((routeTableId) => routeTableId !== undefined) as pulumi.Output<string>[]
	),
});

// Required for container logging (startup fails if not accessible)
const loggingSG = new awsx.ec2.SecurityGroup('logging', {
	vpc: vpc,
	ingress: [allTcpIngressArgs],
});
const loggingEndpoint = new aws.ec2.VpcEndpoint('logging', {
	vpcId: vpc.id,
	serviceName: `com.amazonaws.${aws.config.region}.logs`,
	vpcEndpointType: 'Interface',
	securityGroupIds: [loggingSG.id],
	subnetIds: vpc.privateSubnetIds,
	privateDnsEnabled: true,
});

const cluster = new awsx.ecs.Cluster(
	'cluster',
	{
		vpc: vpc,
		securityGroups: [], // Defaults to a default SG, empty array avoids that
	},
	{ dependsOn: [ecrEndpoint, s3Endpoint, loggingEndpoint] } // Requirements for any container in private subnets
);

/***********************************************************************************************************************
 * REGISTRY
 **********************************************************************************************************************/

const registryPort = 8080;
const registrySG = new awsx.ec2.SecurityGroup('registry', {
	vpc: vpc,
	egress: [allTcpEgressArgs],
});

const dnsNamespace = new aws.servicediscovery.PrivateDnsNamespace('teastore', { vpc: vpc.id });
const registryDiscovery = new aws.servicediscovery.Service('registry', {
	dnsConfig: {
		namespaceId: dnsNamespace.id,
		dnsRecords: [{ ttl: 10, type: 'A' }],
	},
});
new awsx.ecs.FargateService('registry', {
	assignPublicIp: false,
	cluster: cluster,
	subnets: vpc.privateSubnetIds,
	serviceRegistries: { registryArn: registryDiscovery.arn },
	taskDefinitionArgs: {
		container: {
			image: awsx.ecs.Image.fromPath(
				'registry',
				'../../../../../../TeaStore/services/tools.descartes.teastore.registry'
			),
			cpu: 512 /*10% of 1024*/,
			memory: 1024 /*MB*/,
			portMappings: [{ containerPort: registryPort }],
			environment: [{ name: 'USE_POD_IP', value: 'true' }],
		},
	},
	securityGroups: [registrySG],
	desiredCount: 1,
});

module.exports = {
	vpcId: vpc.id,
	vpcPrivateSubnetIds: vpc.privateSubnetIds,
	vpcPublicSubnetIds: vpc.publicSubnetIds,
	clusterName: cluster.cluster.name,
	registrySGId: registrySG.id,
	registryPort: registryPort,
	registryDnsName: pulumi.interpolate`${registryDiscovery.name}.${dnsNamespace.name}`,
};
