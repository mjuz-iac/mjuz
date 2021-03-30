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
const registry = new awsx.ecs.FargateService('registry', {
	assignPublicIp: false,
	cluster: cluster,
	subnets: vpc.privateSubnetIds,
	serviceRegistries: { registryArn: registryDiscovery.arn },
	taskDefinitionArgs: {
		container: {
			image: awsx.ecs.Image.fromPath(
				'registry',
				'../../../../../TeaStore/services/tools.descartes.teastore.registry'
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
const registryDnsName = pulumi.interpolate`${registryDiscovery.name}.${dnsNamespace.name}`;

/***********************************************************************************************************************
 * PERSISTENCE
 **********************************************************************************************************************/

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

const persistence = new awsx.ecs.FargateService(
	'persistence',
	{
		assignPublicIp: false,
		cluster: cluster,
		subnets: vpc.getSubnetsIds('private'),
		taskDefinitionArgs: {
			container: {
				image: awsx.ecs.Image.fromPath(
					'persistence',
					'../../../../../TeaStore/services/tools.descartes.teastore.persistence'
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
	{ dependsOn: [db, registry] }
);

/***********************************************************************************************************************
 * AUTH
 **********************************************************************************************************************/

const authPort = 8080;
const authSG = new awsx.ec2.SecurityGroup('auth', { vpc: vpc, egress: [allTcpEgressArgs] });
registrySG.createIngressRule('registry-inbound-auth', {
	location: { sourceSecurityGroupId: authSG.id },
	ports: new awsx.ec2.TcpPorts(registryPort),
});
persistenceSG.createIngressRule('persistence-inbound-auth', {
	location: { sourceSecurityGroupId: authSG.id },
	ports: new awsx.ec2.TcpPorts(persistencePort),
});

const auth = new awsx.ecs.FargateService(
	'auth',
	{
		assignPublicIp: false,
		cluster: cluster,
		subnets: vpc.getSubnetsIds('private'),
		taskDefinitionArgs: {
			container: {
				image: awsx.ecs.Image.fromPath(
					'auth',
					'../../../../../TeaStore/services/tools.descartes.teastore.auth'
				),
				cpu: 512 /*10% of 1024*/,
				memory: 1024 /*MB*/,
				portMappings: [{ containerPort: authPort }],
				environment: [
					{ name: 'USE_POD_IP', value: 'true' },
					{ name: 'REGISTRY_HOST', value: registryDnsName },
					{ name: 'REGISTRY_PORT', value: `${registryPort}` },
				],
			},
		},
		desiredCount: 1,
		securityGroups: [authSG],
	},
	{ dependsOn: [registry, persistence] }
);

/***********************************************************************************************************************
 * IMAGE
 **********************************************************************************************************************/

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

const image = new awsx.ecs.FargateService(
	'image',
	{
		assignPublicIp: false,
		cluster: cluster,
		subnets: vpc.getSubnetsIds('private'),
		taskDefinitionArgs: {
			container: {
				image: awsx.ecs.Image.fromPath(
					'image',
					'../../../../../TeaStore/services/tools.descartes.teastore.image'
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
	},
	{ dependsOn: [registry, persistence] }
);

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

const recommender = new awsx.ecs.FargateService(
	'recommender',
	{
		assignPublicIp: false,
		cluster: cluster,
		subnets: vpc.getSubnetsIds('private'),
		taskDefinitionArgs: {
			container: {
				image: awsx.ecs.Image.fromPath(
					'recommender',
					'../../../../../TeaStore/services/tools.descartes.teastore.recommender'
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
	},
	{ dependsOn: [registry, persistence] }
);

/***********************************************************************************************************************
 * WEB UI
 **********************************************************************************************************************/

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
					'../../../../../TeaStore/services/tools.descartes.teastore.webui'
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
	{ dependsOn: [registry, persistence, auth, image, recommender, elbEndpoint, loadBalancer] }
);

export const webuiPublicDomain = loadBalancer.loadBalancer.dnsName;
