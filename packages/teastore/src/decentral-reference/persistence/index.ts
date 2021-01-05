import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const allTcpEgressArgs = awsx.ec2.SecurityGroupRule.egressArgs(
	new awsx.ec2.AnyIPv4Location(),
	new awsx.ec2.AllTcpPorts()
);

const config = new pulumi.Config();
const registryStack = new pulumi.StackReference(config.require('registryStack'));
const stackInputs = [
	registryStack.requireOutput('vpcId'),
	registryStack.requireOutput('vpcPrivateSubnetsIds') as pulumi.Output<string[]>,
	registryStack.requireOutput('clusterName'),
	registryStack.requireOutput('registrySGId'),
	registryStack.requireOutput('registryPort'),
	registryStack.requireOutput('registryDnsName'),
];

function deployment([
	vpcId,
	privateSubnetsIds,
	clusterName,
	registrySGId,
	registryPort,
	registryDnsName,
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

	/*******************************************************************************************************************
	 * PERSISTENCE
	 ******************************************************************************************************************/

	const persistencePort = 8080;
	const persistenceSG = new awsx.ec2.SecurityGroup('persistence', {
		vpc: vpc,
		ingress: [{ self: true, protocol: 'tcp', fromPort: 0, toPort: 65535 }],
		egress: [allTcpEgressArgs],
	});
	registrySG.createIngressRule('registry-inbound-persistence', {
		location: { sourceSecurityGroupId: persistenceSG.id },
		ports: new awsx.ec2.TcpPorts(registryPort),
	});
	const dbPort = 3306;
	const dbSG = new awsx.ec2.SecurityGroup('db', {
		vpc: vpc,
		ingress: [
			awsx.ec2.SecurityGroupRule.ingressArgs(
				{ sourceSecurityGroupId: persistenceSG.id },
				new awsx.ec2.TcpPorts(dbPort)
			),
		],
	});

	const dbSubnetGroup = new aws.rds.SubnetGroup('db-subnets', {
		subnetIds: vpc.getSubnetsIds('private'),
	});
	const db = new aws.rds.Cluster('db-cluster', {
		engine: 'aurora-mysql',
		engineMode: 'serverless',
		engineVersion: '5.7.mysql_aurora.2.07.1',
		databaseName: 'teadb',
		masterUsername: 'teauser',
		masterPassword: 'teapassword',
		port: dbPort,
		dbSubnetGroupName: dbSubnetGroup.name,
		skipFinalSnapshot: true,
		vpcSecurityGroupIds: [dbSG.id],
	});

	new awsx.ecs.FargateService(
		'persistence',
		{
			assignPublicIp: false,
			cluster: cluster,
			subnets: vpc.getSubnetsIds('private'),
			taskDefinitionArgs: {
				container: {
					image: awsx.ecs.Image.fromPath(
						'persistence',
						'../../../../../../TeaStore/services/tools.descartes.teastore.persistence'
					),
					cpu: 512 /*10% of 1024*/,
					memory: 1024 /*MB*/,
					portMappings: [{ containerPort: persistencePort }],
					environment: [
						{ name: 'USE_POD_IP', value: 'true' },
						{ name: 'DB_HOST', value: db.endpoint },
						{ name: 'DB_PORT', value: pulumi.interpolate`${db.port}` },
						{ name: 'REGISTRY_HOST', value: registryDnsName },
						{ name: 'REGISTRY_PORT', value: `${registryPort}` },
					],
				},
			},
			desiredCount: 1,
			securityGroups: [persistenceSG],
		},
		{ dependsOn: [db /*, registry*/] }
	);

	return {
		persistenceSGId: persistenceSG.id,
		persistencePort: persistencePort,
	};
}

module.exports = pulumi.all(stackInputs).apply(deployment);
