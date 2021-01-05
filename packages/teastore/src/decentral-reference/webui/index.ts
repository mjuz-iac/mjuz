import * as pulumi from '@pulumi/pulumi';
import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';

const allTcpEgressArgs = awsx.ec2.SecurityGroupRule.egressArgs(
	new awsx.ec2.AnyIPv4Location(),
	new awsx.ec2.AllTcpPorts()
);

const config = new pulumi.Config();
const registryStack = new pulumi.StackReference(config.require('registryStack'));
const persistenceStack = new pulumi.StackReference(config.require('persistenceStack'));
const authStack = new pulumi.StackReference(config.require('authStack'));
const imageStack = new pulumi.StackReference(config.require('imageStack'));
const recommenderStack = new pulumi.StackReference(config.require('recommenderStack'));
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
	authStack.requireOutput('authSGId'),
	authStack.requireOutput('authPort'),
	imageStack.requireOutput('imageSGId'),
	imageStack.requireOutput('imagePort'),
	recommenderStack.requireOutput('recommenderSGId'),
	recommenderStack.requireOutput('recommenderPort'),
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
	authSGId,
	authPort,
	imageSGId,
	imagePort,
	recommenderSGId,
	recommenderPort,
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
	const authSG = awsx.ec2.SecurityGroup.fromExistingId('auth', authSGId, {
		vpc: vpc,
	});
	const imageSG = awsx.ec2.SecurityGroup.fromExistingId('image', imageSGId, {
		vpc: vpc,
	});
	const recommenderSG = awsx.ec2.SecurityGroup.fromExistingId('recommedner', recommenderSGId, {
		vpc: vpc,
	});

	/*******************************************************************************************************************
	 * WEB UI
	 ******************************************************************************************************************/

	const loadBalancerPort = 80;
	const loadBalancerSG = new awsx.ec2.SecurityGroup('load-balancer', {
		vpc: vpc,
		// ingress and egress for alb automatically configured
	});
	// Required for application loadbalancer health checks
	const elbEndpoint = new aws.ec2.VpcEndpoint('elb', {
		vpcId: vpc.id,
		serviceName: `com.amazonaws.${aws.config.region}.elasticloadbalancing`,
		vpcEndpointType: 'Interface',
		securityGroupIds: [loadBalancerSG.id],
		subnetIds: vpc.privateSubnetIds,
		privateDnsEnabled: true,
	});

	const webuiPort = 8080;
	const webuiSG = new awsx.ec2.SecurityGroup('webui', {
		vpc: vpc,
		ingress: [
			awsx.ec2.SecurityGroupRule.ingressArgs(
				{ sourceSecurityGroupId: loadBalancerSG.id },
				new awsx.ec2.TcpPorts(webuiPort)
			),
		],
		egress: [allTcpEgressArgs],
	});
	registrySG.createIngressRule('recommenderSG-inbound-webui', {
		location: { sourceSecurityGroupId: webuiSG.id },
		ports: new awsx.ec2.TcpPorts(registryPort),
	});
	persistenceSG.createIngressRule('persistence-inbound-webui', {
		location: { sourceSecurityGroupId: webuiSG.id },
		ports: new awsx.ec2.TcpPorts(persistencePort),
	});
	authSG.createIngressRule('auth-inbound-webui', {
		location: { sourceSecurityGroupId: webuiSG.id },
		ports: new awsx.ec2.TcpPorts(authPort),
	});
	imageSG.createIngressRule('image-inbound-webui', {
		location: { sourceSecurityGroupId: webuiSG.id },
		ports: new awsx.ec2.TcpPorts(imagePort),
	});
	recommenderSG.createIngressRule('recommender-inbound-webui', {
		location: { sourceSecurityGroupId: webuiSG.id },
		ports: new awsx.ec2.TcpPorts(recommenderPort),
	});
	loadBalancerSG.createEgressRule(
		'load-balancer-egress-webui',
		awsx.ec2.SecurityGroupRule.egressArgs(
			{ sourceSecurityGroupId: webuiSG.id },
			new awsx.ec2.TcpPorts(webuiPort)
		)
	);

	const loadBalancer = new awsx.elasticloadbalancingv2.ApplicationLoadBalancer('webui', {
		external: true,
		securityGroups: [loadBalancerSG],
		subnets: vpc.publicSubnetIds,
		vpc: vpc,
	});
	const webuiListener = loadBalancer.createListener('webui', {
		port: loadBalancerPort,
		targetGroup: {
			port: webuiPort,
			protocol: 'HTTP',
			healthCheck: { path: '/tools.descartes.teastore.webui/' },
			deregistrationDelay: 20, // wait only 20s for in-flight requests to complete on deregistration (draining duration)
		},
		external: true,
	});
	new awsx.ecs.FargateService(
		'webui',
		{
			assignPublicIp: false,
			cluster: cluster,
			subnets: vpc.getSubnetsIds('private'),
			taskDefinitionArgs: {
				container: {
					image: awsx.ecs.Image.fromPath(
						'webui',
						'../../../../../../TeaStore/services/tools.descartes.teastore.webui'
					),
					cpu: 512 /*10% of 1024*/,
					memory: 1024 /*MB*/,
					portMappings: [webuiListener],
					environment: [
						{ name: 'USE_POD_IP', value: 'true' },
						{ name: 'REGISTRY_HOST', value: registryDnsName },
						{ name: 'REGISTRY_PORT', value: `${registryPort}` },
						{ name: 'PROXY_NAME', value: loadBalancer.loadBalancer.dnsName },
						{ name: 'PROXY_PORT', value: `${webuiListener.endpoint.port}` },
					],
				},
			},
			desiredCount: 1,
			securityGroups: [webuiSG],
		},
		{
			dependsOn: [
				//registry, persistence, auth, image, recommender,
				elbEndpoint,
				loadBalancer,
			],
		}
	);

	return { webuiPublicDomain: loadBalancer.loadBalancer.dnsName };
}

module.exports = pulumi.all(stackInputs).apply(deployment);
