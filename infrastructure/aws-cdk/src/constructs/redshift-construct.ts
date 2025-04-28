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
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as redshiftserverless from "aws-cdk-lib/aws-redshiftserverless";
import { Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { VpcConstruct } from "./vpc-construct";

export interface RedshiftConstructProps extends cdk.StackProps {
  baseRPU?: number;
  port?: number;
  gamesEventsStream: cdk.aws_kinesis.Stream;
  config: GameAnalyticsPipelineConfig;
  vpcConstruct: VpcConstruct;
}

const defaultProps = {
  baseRPU: 16,
  port: 5439,
};

export class RedshiftConstruct extends Construct {
  public readonly redshiftDirectIngestQueue?: sqs.Queue;
  public readonly namespace: redshiftserverless.CfnNamespace;
  public readonly workgroup: redshiftserverless.CfnWorkgroup;
  public readonly redshiftRole: iam.Role;
  public readonly key: kms.Key;
  constructor(parent: Construct, name: string, props: RedshiftConstructProps) {
    super(parent, name);

    const vpc = props.vpcConstruct.vpc;
    this.key = new kms.Key(this, "RedshiftKMSKey");

    const sg = new ec2.SecurityGroup(this, "RedshiftSecurityGroup", { vpc });
    sg.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(props.port ?? defaultProps.port),
      "Allow inbound from the VPC",
      false
    );

    this.redshiftRole = new iam.Role(this, "RedshiftRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("redshift.amazonaws.com"),
        new iam.ServicePrincipal("redshift-serverless.amazonaws.com")
      ),
      path: "/",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonRedshiftFullAccess"),
      ],
    });

    this.redshiftRole.addToPolicy(
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
    this.redshiftRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "ListStream",
        effect: iam.Effect.ALLOW,
        actions: ["kinesis:ListStreams"],
        resources: ["*"],
      })
    );

    const workloadNameLower = props.config.WORKLOAD_NAME.toLowerCase();
    this.namespace = new redshiftserverless.CfnNamespace(
      this,
      "RedshiftNamespace",
      {
        namespaceName: `${workloadNameLower}workspace`,
        adminPasswordSecretKmsKeyId: this.key.keyId,
        dbName: props.config.EVENTS_DATABASE,
        defaultIamRoleArn: this.redshiftRole.roleArn,
        iamRoles: [this.redshiftRole.roleArn],
        kmsKeyId: this.key.keyId,
        manageAdminPassword: true,
      }
    );
    const secretArn = `arn:aws:secretsmanager:${Stack.of(this).region}:${
      Stack.of(this).account
    }:secret:redshift!${this.namespace.namespaceName}-admin*`;

    this.workgroup = new redshiftserverless.CfnWorkgroup(
      this,
      "RedshiftWorkgroup",
      {
        workgroupName: `${workloadNameLower}-workgroup`,
        baseCapacity: props.baseRPU ?? defaultProps.baseRPU,
        namespaceName: this.namespace.ref,
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

    new cdk.CfnOutput(this, "RedshiftRoleArn", {
      description: "ARN of the Redshift Serverless Role",
      value: this.redshiftRole.roleArn,
    });
  }
}
