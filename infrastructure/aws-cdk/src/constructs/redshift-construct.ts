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
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as triggers from "aws-cdk-lib/triggers";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as redshiftserverless from "aws-cdk-lib/aws-redshiftserverless";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { Stack } from "aws-cdk-lib";
import { VpcConstruct } from "./vpc-construct";

export interface RedshiftConstructProps extends cdk.StackProps {
  baseRPU?: number;
  port?: number;
  gamesEventsStream?: cdk.aws_kinesis.Stream;
  config: GameAnalyticsPipelineConfig;
  vpcConstruct: VpcConstruct;
}

const defaultProps = {
  baseRPU: 16,
  port: 5439,
};

export class RedshiftConstruct extends Construct {
  // public readonly redshiftDirectIngestFunction?: lambda.Function;
  public readonly redshiftDirectIngestQueue?: sqs.Queue;
  constructor(parent: Construct, name: string, props: RedshiftConstructProps) {
    super(parent, name);

    const vpc = props.vpcConstruct.vpc;
    const key = new kms.Key(this, "RedshiftKMSKey");

    const sg = new ec2.SecurityGroup(this, "RedshiftSecurityGroup", { vpc });
    sg.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(props.port ?? defaultProps.port),
      "Allow inbound from the VPC",
      false
    );

    const redshiftRole = new iam.Role(this, "RedshiftRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("redshift.amazonaws.com"),
        new iam.ServicePrincipal("redshift-serverless.amazonaws.com")
      ),
      path: "/",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRedshiftFullAccess"),
      ],
    });

    if (
      props.config.INGEST_MODE == "REAL_TIME_KDS" &&
      props.gamesEventsStream
    ) {
      redshiftRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadStream",
          effect: iam.Effect.ALLOW,
          actions: [
            "kinesis:DescribeStreamSummary",
            "kinesis:GetShardIterator",
            "kinesis:GetRecords",
            "kinesis:ListShards",
            "kinesis:DescribeStream",
          ],
          resources: [props.gamesEventsStream.streamArn],
        })
      );
      redshiftRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ListStream",
          effect: iam.Effect.ALLOW,
          actions: ["kinesis:ListStreams"],
          resources: ["*"],
        })
      );
    }

    const workloadNameLower = props.config.WORKLOAD_NAME.toLowerCase();
    const namespace = new redshiftserverless.CfnNamespace(
      this,
      "RedshiftNamespace",
      {
        namespaceName: `${workloadNameLower}workspace`,
        adminPasswordSecretKmsKeyId: key.keyId,
        dbName: props.config.EVENTS_DATABASE,
        defaultIamRoleArn: redshiftRole.roleArn,
        iamRoles: [redshiftRole.roleArn],
        kmsKeyId: key.keyId,
        manageAdminPassword: true,
      }
    );
    const secretArn = `arn:aws:secretsmanager:${Stack.of(this).region}:${
      Stack.of(this).account
    }:secret:redshift!${namespace.namespaceName}-admin*`;

    const workgroup = new redshiftserverless.CfnWorkgroup(
      this,
      "RedshiftWorkgroup",
      {
        workgroupName: `${workloadNameLower}-workgroup`,
        baseCapacity: props.baseRPU ?? defaultProps.baseRPU,
        namespaceName: namespace.ref,
        port: props.port ?? defaultProps.port,
        publiclyAccessible: false,
        securityGroupIds: [sg.securityGroupId],
        subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
        configParameters: [
          {
            parameterKey: "enable_case_sensitive_identifier",
            parameterValue: "true",
          },
        ],
      }
    );

    const codePath = "../../../../business-logic";

    const kinesisTrigger = new triggers.TriggerFunction(
      this,
      "RedshiftKinesisTrigger",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, `${codePath}/redshift-kinesis-trigger/`)
        ),
        timeout: cdk.Duration.minutes(1),
        environment: {
          INGEST_MODE: props.config.INGEST_MODE,
          SECRET_ARN: `redshift!${namespace.namespaceName}-admin`,
          WORKGROUP_NAME: workgroup.workgroupName,
          DATABASE_NAME: props.config.EVENTS_DATABASE,
          REDSHIFT_ROLE_ARN: redshiftRole.roleArn,
          STREAM_NAME: props.gamesEventsStream?.streamName ?? "",
        },
      }
    );

    kinesisTrigger.executeAfter(namespace, workgroup);

    kinesisTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DataAPI",
        effect: iam.Effect.ALLOW,
        actions: [
          "redshift-data:GetStatementResult",
          "redshift-data:ListStatements",
          "redshift-data:ExecuteStatement",
          "redshift-data:BatchExecuteStatement",
        ],
        resources: ["*"],
      })
    );

    kinesisTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DataAPIStatements",
        effect: iam.Effect.ALLOW,
        actions: [
          "redshift-data:CancelStatement",
          "redshift-data:DescribeStatement",
        ],
        resources: ["*"],
      })
    );

    kinesisTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "SecretsManager",
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secretArn],
      })
    );

    kinesisTrigger.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "KMS",
        effect: iam.Effect.ALLOW,
        actions: ["kms:Decrypt*"],
        resources: [key.keyArn],
      })
    );

    if (props.config.INGEST_MODE == "DIRECT_BATCH") {
      const ingestQueueDLQ = new sqs.Queue(this, "IngestDLQ");
      this.redshiftDirectIngestQueue = new sqs.Queue(this, "IngestQueue", {
        deadLetterQueue: {
          queue: ingestQueueDLQ,
          maxReceiveCount: 3,
        },
      });
      const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(
        this,
        "PowertoolsLayer",
        `arn:aws:lambda:${
          Stack.of(this).region
        }:094274105915:layer:AWSLambdaPowertoolsTypeScriptV2:24`
      );

      const redshiftDirectIngestFunction = new NodejsFunction(
        this,
        "DirectBatchIngestFunction",
        {
          description:
            "Function to ingest data to Redshift in DIRECT_BATCH mode.",
          code: lambda.Code.fromAsset(
            path.join(__dirname, `${codePath}/redshift-direct-ingest/`)
          ),
          handler: "index.handler",
          memorySize: 256,
          timeout: cdk.Duration.seconds(30),
          runtime: lambda.Runtime.NODEJS_22_X,
          environment: {
            SECRET_ARN: `redshift!${namespace.namespaceName}-admin`,
            WORKGROUP_NAME: workgroup.workgroupName,
            DATABASE_NAME: props.config.EVENTS_DATABASE,
            REDSHIFT_ROLE_ARN: redshiftRole.roleArn,
          },
          layers: [powertoolsLayer],
        }
      );

      redshiftDirectIngestFunction.addEventSource(new eventsources.SqsEventSource(this.redshiftDirectIngestQueue, {
        batchSize: 10,
        reportBatchItemFailures: true
      }));

      redshiftDirectIngestFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "DataAPI",
          effect: iam.Effect.ALLOW,
          actions: [
            "redshift-data:GetStatementResult",
            "redshift-data:ListStatements",
            "redshift-data:ExecuteStatement",
            "redshift-data:BatchExecuteStatement",
          ],
          resources: [workgroup.attrWorkgroupWorkgroupArn],
        })
      );

      redshiftDirectIngestFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "DataAPIStatements",
          effect: iam.Effect.ALLOW,
          actions: ["redshift-data:DescribeStatement"],
          resources: ["*"],
        })
      );

      redshiftDirectIngestFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "SecretsManager",
          effect: iam.Effect.ALLOW,
          actions: ["secretsmanager:GetSecretValue"],
          resources: [secretArn],
        })
      );

      redshiftDirectIngestFunction.addToRolePolicy(
        new iam.PolicyStatement({
          sid: "KMS",
          effect: iam.Effect.ALLOW,
          actions: ["kms:Decrypt*"],
          resources: [key.keyArn],
        })
      );
    }

    new cdk.CfnOutput(this, "RedshiftRoleArn", {
      description: "ARN of the Redshift Serverless Role",
      value: redshiftRole.roleArn,
    });
  }
}
