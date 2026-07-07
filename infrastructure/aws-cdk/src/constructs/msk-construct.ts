/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the 'License').
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the 'license' file accompanying this file. This file is distributed
 * on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as msk from "aws-cdk-lib/aws-msk";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";

import * as path from "path";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface MSKConstructProps extends cdk.StackProps {
  /**
   * Base codepath for the business-logic folder, relative to the CDK source.
   */
  baseCodePath: string;
  /**
   * VPC where the MSK cluster brokers and the producer Lambda will be placed.
   */
  vpc: ec2.IVpc;
  /**
   * Optional override for the cluster name. Defaults to
   * `${WORKLOAD_NAME}-cluster` (with underscores replaced by hyphens).
   */
  clusterName?: string;
  /**
   * Optional override for the Kafka topic name the Lambda producer writes to.
   * Defaults to `game_events`.
   */
  topicName?: string;
  /**
   * Optional override for the partition count of the game events topic.
   * Defaults to 100.
   */
  partitionCount?: number;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<MSKConstructProps> = {
  topicName: "game_events",
  partitionCount: 100,
};

/**
 * Deploys the MSK construct
 *
 * Provisions:
 *  - A security group for MSK brokers (and the producer Lambda)
 *  - A CloudWatch log group for cluster broker logs
 *  - A provisioned MSK cluster using Express brokers, with IAM SASL auth on
 *    both the client and the VPC connectivity endpoint
 *  - A cluster resource policy allowing Firehose and the deploying account
 *    to discover and connect to the cluster
 *  - The game events Kafka topic (AWS::MSK::Topic), created declaratively with
 *    the configured partition count and a replication factor of 3
 *  - A VPC-attached Node.js Lambda producer that publishes events to the
 *    game events topic over the cluster's IAM SASL bootstrap endpoint
 */
export class MSKConstruct extends Construct {
  public readonly cluster: msk.CfnCluster;
  public readonly clusterName: string;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly clusterLogGroup: logs.LogGroup;
  public readonly topic: msk.CfnTopic;
  public readonly topicName: string;
  public readonly topicArn: string;
  public readonly consumerGroupArnPattern: string;
  public readonly eventIngestionFunction: lambda.Function;

  constructor(parent: Construct, name: string, props: MSKConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };
    const codePath = `../${props.baseCodePath}`;

    const sanitize = (s: string) => s.replace(/_/g, "-");
    const clusterName =
      props.clusterName ?? sanitize(`${props.config.WORKLOAD_NAME}-cluster`);
    const topicName = props.topicName ?? "game_events";
    const partitionCount = props.partitionCount ?? 100;

    /* ---- Security group ---- */
    /* Mirrors the Terraform construct: opens all traffic in/out. Tighten
       these rules in production environments as needed. */
    const securityGroup = new ec2.SecurityGroup(this, "MskSecurityGroup", {
      vpc: props.vpc,
      description: "Allow inbound from the VPC for MSK brokers",
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTraffic(),
      "Allow all inbound (mirrors Terraform construct)"
    );

    /* ---- CloudWatch log group for broker logs ---- */
    const clusterLogGroup = new logs.LogGroup(this, "ClusterLogGroup", {
      logGroupName: sanitize(`${props.config.WORKLOAD_NAME}-cluster-logs`),
      retention:
        props.config.CLOUDWATCH_RETENTION_DAYS as logs.RetentionDays,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /* ---- MSK cluster ---- */
    /* https://docs.aws.amazon.com/msk/latest/developerguide/bestpractices-express.html */
    const cluster = new msk.CfnCluster(this, "GameAnalyticsCluster", {
      clusterName,
      kafkaVersion: "3.8.x",
      numberOfBrokerNodes: 3,
      enhancedMonitoring: "PER_TOPIC_PER_PARTITION",
      brokerNodeGroupInfo: {
        instanceType: props.config.MSK_CLUSTER_INSTANCE_TYPE,
        clientSubnets: props.vpc.privateSubnets.map((s) => s.subnetId),
        securityGroups: [securityGroup.securityGroupId],
        connectivityInfo: {
          vpcConnectivity: {
            clientAuthentication: {
              sasl: {
                iam: { enabled: true },
              },
            },
          },
        },
      },
      clientAuthentication: {
        sasl: {
          iam: { enabled: true },
        },
      },
      loggingInfo: {
        brokerLogs: {
          cloudWatchLogs: {
            enabled: true,
            logGroup: clusterLogGroup.logGroupName,
          },
        },
      },
    });
    /* MSK clusters can take 2+ hours to create. */
    cluster.cfnOptions.creationPolicy = {
      resourceSignal: { timeout: "PT3H" },
    };

    /* ---- Cluster resource policy ---- */
    const clusterPolicy = new msk.CfnClusterPolicy(this, "EnableFirehose", {
      clusterArn: cluster.attrArn,
      policy: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "firehose.amazonaws.com" },
            Action: [
              "kafka:CreateVpcConnection",
              "kafka:GetBootstrapBrokers",
              "kafka:DescribeCluster",
              "kafka:DescribeClusterV2",
            ],
            Resource: cluster.attrArn,
          },
          {
            Effect: "Allow",
            Principal: { AWS: `arn:${cdk.Aws.PARTITION}:iam::${cdk.Aws.ACCOUNT_ID}:root` },
            Action: [
              "kafka:CreateVpcConnection",
              "kafka:GetBootstrapBrokers",
              "kafka:DescribeCluster",
              "kafka:DescribeClusterV2",
            ],
            Resource: cluster.attrArn,
          },
        ],
      },
    });
    clusterPolicy.addDependency(cluster);

    /* The topic ARN follows the documented MSK IAM ARN format:
         arn:<partition>:kafka:<region>:<account>:topic/<cluster-name>/<cluster-uuid>/<topic-name>
       We use a wildcard for the cluster UUID since it isn't known until the
       cluster is provisioned, and using a wildcard is the canonical pattern
       in MSK IAM examples. */
    const topicArn = `arn:${cdk.Aws.PARTITION}:kafka:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:topic/${clusterName}/*/${topicName}`;
    /* Consumer-group ARN pattern for IAM scoping. Same format as topicArn but
       for the group resource type, with a wildcard for both the cluster UUID
       and the consumer group id. */
    const consumerGroupArnPattern = `arn:${cdk.Aws.PARTITION}:kafka:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:group/${clusterName}/*/*`;

    /* CloudFormation's AWS::MSK::Cluster does not expose bootstrap broker
       endpoints as return values. We use an AwsCustomResource to call
       kafka:GetBootstrapBrokers after the cluster is created and pass the
       SASL/IAM endpoint into the producer Lambda. */
    const bootstrapBrokers = new AwsCustomResource(this, "GetBootstrapBrokers", {
      onCreate: {
        service: "Kafka",
        action: "getBootstrapBrokers",
        parameters: { ClusterArn: cluster.attrArn },
        physicalResourceId: PhysicalResourceId.of(
          `${clusterName}-bootstrap-brokers`
        ),
      },
      onUpdate: {
        service: "Kafka",
        action: "getBootstrapBrokers",
        parameters: { ClusterArn: cluster.attrArn },
        physicalResourceId: PhysicalResourceId.of(
          `${clusterName}-bootstrap-brokers`
        ),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["kafka:GetBootstrapBrokers"],
          resources: [cluster.attrArn],
        }),
      ]),
    });
    bootstrapBrokers.node.addDependency(cluster);
    const bootstrapBrokerStringSaslIam = bootstrapBrokers.getResponseField(
      "BootstrapBrokerStringSaslIam"
    );

    /* ---- Game events Kafka topic ---- */
    /* AWS::MSK::Topic manages the topic declaratively via the MSK topic
       management APIs, replacing client-side auto-creation. Replication
       factor of 3 matches the broker count / Terraform construct. */
    const topic = new msk.CfnTopic(this, "GameEventTopic", {
      clusterArn: cluster.attrArn,
      topicName: topicName,
      partitionCount: partitionCount,
      replicationFactor: 3,
    });
    topic.addDependency(cluster);

    /* ---- VPC-attached event ingestion Lambda ---- */
    const eventIngestionRole = new iam.Role(this, "EventIngestionFunctionRole", {
      roleName: `${props.config.WORKLOAD_NAME}-kafka-event-ingestion-function-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXrayWriteOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaVPCAccessExecutionRole"
        ),
      ],
      inlinePolicies: {
        kafkaProducerAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "kafka-cluster:Connect",
                "kafka-cluster:DescribeCluster",
              ],
              resources: [cluster.attrArn],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "kafka-cluster:DescribeTopic",
                "kafka-cluster:WriteData",
              ],
              resources: [topicArn],
            }),
          ],
        }),
      },
    });

    const eventIngestionFunction = new NodejsFunction(
      this,
      "KafkaEventIngestionFunction",
      {
        functionName: `${props.config.WORKLOAD_NAME}-KafkaEventIngestionFunction`,
        description:
          "Kafka producer used to send events into a deployed game analytics pipeline MSK topic",
        entry: path.join(
          __dirname,
          `${codePath}/kafka-event-ingestion-lambda/index.js`
        ),
        depsLockFilePath: path.join(
          __dirname,
          `${codePath}/kafka-event-ingestion-lambda/package-lock.json`
        ),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 256,
        timeout: cdk.Duration.minutes(5),
        tracing: lambda.Tracing.PASS_THROUGH,
        role: eventIngestionRole,
        vpc: props.vpc,
        vpcSubnets: { subnets: props.vpc.privateSubnets },
        securityGroups: [securityGroup],
        environment: {
          BROKERS: bootstrapBrokerStringSaslIam,
          TOPIC: topicName,
          PARTITION_COUNT: partitionCount.toString(),
        },
      }
    );

    /* Ensure the topic exists before the producer Lambda is created. */
    eventIngestionFunction.node.addDependency(topic);

    /* ---- Public exports ---- */
    this.cluster = cluster;
    this.clusterName = clusterName;
    this.securityGroup = securityGroup;
    this.clusterLogGroup = clusterLogGroup;
    this.topic = topic;
    this.topicName = topicName;
    this.topicArn = topicArn;
    this.consumerGroupArnPattern = consumerGroupArnPattern;
    this.eventIngestionFunction = eventIngestionFunction;
  }
}
