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
import * as triggers from "aws-cdk-lib/triggers";
import * as redshiftserverless from "aws-cdk-lib/aws-redshiftserverless";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

export interface RedshiftConstructProps extends cdk.StackProps {
  baseRPU?: number;
  port?: number;
  gameEventsStream: cdk.aws_kinesis.Stream;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps = {
  baseRPU: 16,
  port: 5439,
};

export class RedshiftConstruct extends Construct {
  constructor(parent: Construct, name: string, props: RedshiftConstructProps) {
    super(parent, name);

    const key = new kms.Key(this, "RedshiftKMSKey");

    const vpc = new ec2.Vpc(this, "RedshiftVPC", {});
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
        resources: [props.gameEventsStream.streamArn],
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

    const workloadNameLower = props.config.WORKLOAD_NAME.toLowerCase()
    const cfnNamespace = new redshiftserverless.CfnNamespace(
      this,
      "RedshiftNamespace",
      {
        namespaceName: `${workloadNameLower}workspace`,
        adminPasswordSecretKmsKeyId: key.keyId,
        dbName: props.config.REDSHIFT_DB_NAME,
        defaultIamRoleArn: redshiftRole.roleArn,
        iamRoles: [redshiftRole.roleArn],
        // kmsKeyId: key.keyId,
        manageAdminPassword: true,
      }
    );

    const cfnWorkgroup = new redshiftserverless.CfnWorkgroup(
      this,
      "RedshiftWorkgroup",
      {
        workgroupName: `${workloadNameLower}-wg`,
        baseCapacity: props.baseRPU ?? defaultProps.baseRPU,
        namespaceName: cfnNamespace.ref,
        port: props.port ?? defaultProps.port,
        publiclyAccessible: false,
        securityGroupIds: [sg.securityGroupId],
        subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
      }
    );

    const codePath = "../../../business-logic";
    const trigger = new triggers.TriggerFunction(
      this,
      "RedshiftPostDeployTrigger",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          path.join(__dirname, `${codePath}/redshift/cfn-trigger/`)
        ),
        timeout: cdk.Duration.minutes(1),
        environment: {
          SECRET_ARN: `redshift!${workloadNameLower}workspace-admin`,
          WORKGROUP_NAME: cfnWorkgroup.workgroupName,
          DATABASE_NAME: props.config.REDSHIFT_DB_NAME,
          REDSHIFT_ROLE_ARN: redshiftRole.roleArn,
          STREAM_NAME: props.gameEventsStream.streamName,
        },
      }
    );
    trigger.executeAfter(cfnNamespace, cfnWorkgroup);
    // trigger.addToRolePolicy

    new cdk.CfnOutput(this, "RedshiftRoleArn", {
      description: "ARN of the Redshift Serverless Role",
      value: redshiftRole.roleArn,
    });
  }
}
