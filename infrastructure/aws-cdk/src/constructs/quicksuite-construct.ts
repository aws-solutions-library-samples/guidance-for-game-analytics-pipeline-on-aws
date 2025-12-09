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
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";

import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as qs from "aws-cdk-lib/aws-quicksight";
import * as athena from "aws-cdk-lib/aws-athena";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface QuickSuiteProps extends cdk.StackProps {
  analyticsBucket: s3.Bucket;
  gameEventsDatabase: glue.CfnDatabase;
  gameAnalyticsWorkgroup: athena.CfnWorkGroup;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<QuickSuiteProps> = {};


/**
 * Creates a data source connected to Athena (Redshift TBD) inside QuickSuite to perform 
 *
 */
export class QuickSuiteConstruct extends Construct {
  public readonly gapDataSource: qs.CfnDataSource;

  constructor(
    parent: Construct,
    name: string,
    props: QuickSuiteProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // get the default quicksuite-managed IAM role
    // https://docs.aws.amazon.com/quicksuite/latest/userguide/athena.html
    const quickSightDefaultServiceRole = iam.Role.fromRoleArn(
      this,
      'QuickSightServiceRole',
      `arn:aws:iam::${cdk.Aws.ACCOUNT_ID}:role/service-role/aws-quicksight-service-role-v0`
    )
    /*
    const glueAccessPolicy = new iam.Policy(this, 'GlueAccessPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "glue:GetDatabase",
            "glue:GetDatabases",
            "glue:GetTable",
            "glue:GetTables",
            "glue:GetPartition",
            "glue:GetPartitions",
          ],
          resources: ["*"],
        })
      ],
    });
    quickSightDefaultServiceRole.attachInlinePolicy(glueAccessPolicy);
    */
    quickSightDefaultServiceRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(
      "service-role/AWSQuickSightAthenaAccess"
    ))
    const readAccessGrant = props.analyticsBucket.grantRead(quickSightDefaultServiceRole)
    // grant write access for cached athena results
    const writeQueryResultAccessGrant = props.analyticsBucket.grantWrite(quickSightDefaultServiceRole, "athena_query_results/*")

    // create data source

    const gapDataSource = new qs.CfnDataSource(this, "gapDataSource", {
      dataSourceId: "game-analytics-pipeline-data-source",
      name: "game_analytics_pipeline",
      awsAccountId: cdk.Aws.ACCOUNT_ID,
      type: "ATHENA",
      dataSourceParameters: {
        athenaParameters: {
          workGroup: props.gameAnalyticsWorkgroup.name,
          roleArn: quickSightDefaultServiceRole.roleArn
        },
      },
      sslProperties: {
        disableSsl: false,
      },
    });
    gapDataSource.node.addDependency(readAccessGrant)
    gapDataSource.node.addDependency(writeQueryResultAccessGrant)
    this.gapDataSource = gapDataSource;
  }
}
