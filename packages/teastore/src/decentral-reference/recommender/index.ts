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
	registryStack.requireOutput('vpcPrivateSubnetIds') as pulumi.Output<string[]>,
	registryStack.requireOutput('vpcPublicSubnetIds') as pulumi.Output<string[]>,
	registryStack.requireOutput('clusterName'),
	registryStack.requireOutput('registrySGId'),
	registryStack.requireOutput('registryPort'),
	registryStack.requireOutput('registryDnsName'),
	persistenceStack.requireOutput('persistenceSGId'),
	persistenceStack.requireOutput('persistencePort'),
];

function deployment([
	vpcId,
	privateSubnetIds,
	publicSubnetIds,
	clusterName,
	registrySGId,
	registryPort,
	registryDnsName,
	persistenceSGId,
	persistencePort,
]: pulumi.Unwrap<typeof stackInputs>) {
	const vpc = awsx.ec2.Vpc.fromExistingIds('vpc', {
		vpcId: vpcId,
		privateSubnetIds: privateSubnetIds,
		publicSubnetIds: publicSubnetIds,
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

	/***********************************************************************************************************************
	 * RECOMMENDER
	 **********************************************************************************************************************/

	const recommenderPort = 8080;
	const recommenderSG = new awsx.ec2.SecurityGroup('recommender', {
		vpc: vpc,
		egress: [allTcpEgressArgs],
	});
	registrySG.createIngressRule('recommenderSG-inbound-recommender', {
		location: { sourceSecurityGroupId: recommenderSG.id },
		ports: new awsx.ec2.TcpPorts(registryPort),
	});
	persistenceSG.createIngressRule('persistence-inbound-recommender', {
		location: { sourceSecurityGroupId: recommenderSG.id },
		ports: new awsx.ec2.TcpPorts(persistencePort),
	});

	new awsx.ecs.FargateService(
		'recommender',
		{
			assignPublicIp: false,
			cluster: cluster,
			subnets: vpc.getSubnetsIds('private'),
			taskDefinitionArgs: {
				container: {
					image: awsx.ecs.Image.fromPath(
						'recommender',
						'../../../../../../TeaStore/services/tools.descartes.teastore.recommender'
					),
					cpu: 512 /*10% of 1024*/,
					memory: 1024 /*MB*/,
					portMappings: [{ containerPort: recommenderPort }],
					environment: [
						{ name: 'USE_POD_IP', value: 'true' },
						{ name: 'REGISTRY_HOST', value: registryDnsName },
						{ name: 'REGISTRY_PORT', value: `${registryPort}` },
					],
				},
			},
			desiredCount: 1,
			securityGroups: [recommenderSG],
		}
		//{ dependsOn: [registry, persistence] }
	);
	return {
		recommenderSGId: recommenderSG.id,
		recommenderPort: recommenderPort,
	};
}

module.exports = pulumi.all(stackInputs).apply(deployment);
