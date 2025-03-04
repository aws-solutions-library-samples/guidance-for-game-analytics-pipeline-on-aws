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
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kms from "aws-cdk-lib/aws-kms";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
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

    /* eslint-disable @typescript-eslint/no-unused-vars */
    // const merged = { ...defaultProps, ...props };
    // const mergedProps: Required<RedshiftConstructProps> = {}
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

    const cfnNamespace = new redshiftserverless.CfnNamespace(
      this,
      "RedshiftNamespace",
      {
        namespaceName: `${props.config.WORKLOAD_NAME.toLowerCase()}workspace`,
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
        workgroupName: `${props.config.WORKLOAD_NAME.toLowerCase()}-wg`,

        // the properties below are optional
        baseCapacity: props.baseRPU ?? defaultProps.baseRPU,

        // enhancedVpcRouting: false,
        // maxCapacity: 123,
        namespaceName: cfnNamespace.ref,
        port: props.port ?? defaultProps.port,
        // pricePerformanceTarget: {
        //   level: 123,
        //   status: "status",
        // },
        publiclyAccessible: false,
        securityGroupIds: [sg.securityGroupId],
        subnetIds: vpc.privateSubnets.map((s) => s.subnetId),
        // tags: [
        //   {
        //     key: "key",
        //     value: "value",
        //   },
        // ],
      }
    );
  }
}
