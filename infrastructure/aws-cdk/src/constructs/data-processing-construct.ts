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

import * as glueCfn from "aws-cdk-lib/aws-glue";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as eventstargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface DataProcessingConstructProps extends cdk.StackProps {
  analyticsBucket: s3.Bucket;
  config: GameAnalyticsPipelineConfig;
  notificationsTopic: sns.Topic;
  gameEventsDatabase: glueCfn.CfnDatabase;
  rawEventsTable: glueCfn.CfnTable;
}

const defaultProps: Partial<DataProcessingConstructProps> = {};

/**
 * Deploys the DataLake construct
 *
 * Creates Glue to turn analytics s3 bucket into Datalake. Creates Jobs that can be used to process s3 data for Athena.
 */
export class DataProcessingConstruct extends Construct {
public readonly gameEventsEtlJob: glueCfn.CfnJob;
  public readonly gameEventsIcebergJob: glueCfn.CfnJob;

  constructor(parent: Construct, name: string, props: DataProcessingConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };


    // IAM Role allowing Glue ETL Job to access Analytics Bucket
    const gameEventsEtlRole = new iam.Role(this, "GameEventsEtlRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      path: "/",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole"
        ),
      ],
    });
    gameEventsEtlRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "S3Access",
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        resources: [
          props.analyticsBucket.bucketArn,
          `${props.analyticsBucket.bucketArn}/*`,
        ],
      })
    );
    gameEventsEtlRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "GlueTableAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:BatchGetPartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchCreatePartition",
          "glue:CreatePartition",
          "glue:CreateTable",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:UpdatePartition",
          "glue:UpdateTable",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.gameEventsDatabase.ref}/*`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
        ],
      })
    );
    gameEventsEtlRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "GlueDBAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:UpdateDatabase",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
        ],
      })
    );
    gameEventsEtlRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "KMSAccess",
        effect: iam.Effect.ALLOW,
        actions: ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/aws/glue`,
        ],
      })
    );
    const glueCrawlerRole = new iam.Role(this, "GlueCrawlerRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      path: "/",
    });
    glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        resources: [
          props.analyticsBucket.arnForObjects("*"),
          props.analyticsBucket.bucketArn,
        ],
      })
    );
    glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:BatchGetPartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchCreatePartition",
          "glue:CreatePartition",
          "glue:CreateTable",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:UpdatePartition",
          "glue:UpdateTable",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.gameEventsDatabase.ref}/*`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
        ],
      })
    );
    glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:UpdateDatabase",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
        ],
      })
    );
    glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kms:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:alias/aws/glue`,
        ],
      })
    );
    glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:*:logs:*:*:/aws-glue/*"],
      })
    );

    // Glue ETL Job to process events from staging and repartition by event_type and date
    const gameEventsEtlJob = new glueCfn.CfnJob(this, "GameEventsEtlJob", {
      description: `Etl job for processing raw game event data, for stack ${cdk.Aws.STACK_NAME}.`,
      glueVersion: "5.0",
      maxRetries: 0,
      maxCapacity: 10,
      timeout: 30,
      executionProperty: {
        maxConcurrentRuns: 1,
      },
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: `s3://${props.analyticsBucket.bucketName}/glue-scripts/game_events_etl.py`,
      },
      role: gameEventsEtlRole.roleArn,
      defaultArguments: {
        "--enable-metrics": "true",
        "--enable-continuous-cloudwatch-log": "true",
        "--enable-glue-datacatalog": "true",
        "--database_name": props.gameEventsDatabase.ref,
        "--raw_events_table_name": props.config.RAW_EVENTS_TABLE,
        "--analytics_bucket": `s3://${props.analyticsBucket.bucketName}/`,
        "--processed_data_prefix": props.config.PROCESSED_EVENTS_PREFIX,
        "--glue_tmp_prefix": props.config.GLUE_TMP_PREFIX,
        "--job-bookmark-option": "job-bookmark-enable",
        "--TempDir": `s3://${props.analyticsBucket.bucketName}/${props.config.GLUE_TMP_PREFIX}`,
      },
    });

    const gameEventsIcebergJob = new glueCfn.CfnJob(this, "IcebergEtl", {
      description: `Etl job for processing existing raw game event data, for stack ${cdk.Aws.STACK_NAME} to Apache Iceberg table.`,
      glueVersion: "5.0",
      maxRetries: 0,
      maxCapacity: 10,
      timeout: 30,
      executionProperty: {
        maxConcurrentRuns: 1,
      },
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: `s3://${props.analyticsBucket.bucketName}/glue-scripts/convert_game_events_to_iceberg.py`,
      },
      role: gameEventsEtlRole.roleArn,
      defaultArguments: {
        "--enable-metrics": "true",
        "--enable-continuous-cloudwatch-log": "true",
        "--enable-glue-datacatalog": "true",
        "--datalake-formats": "iceberg",
        "--database_name": "iceberg_db",
        "--raw_events_table_name": props.config.RAW_EVENTS_TABLE,
        "--iceberg_events_table_name": `${props.config.RAW_EVENTS_TABLE}_iceberg`,
        "--analytics_bucket": `s3://${props.analyticsBucket.bucketName}/`,
        "--iceberg_bucket": "s3://your_bucket_here/",
        "--processed_data_prefix": props.config.PROCESSED_EVENTS_PREFIX,
        "--glue_tmp_prefix": props.config.GLUE_TMP_PREFIX,
        "--job-bookmark-option": "job-bookmark-enable",
        "--TempDir": `s3://${props.analyticsBucket.bucketName}/${props.config.GLUE_TMP_PREFIX}`,
        "--conf":
          "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO --conf spark.sql.catalog.glue_catalog.warehouse=file:///tmp/spark-warehouse",
      },
    });

    // Crawler crawls s3 partitioned data
    const eventsCrawler = new glueCfn.CfnCrawler(this, "EventsCrawler", {
      role: glueCrawlerRole.roleArn,
      description: `AWS Glue Crawler for partitioned data, for stack ${cdk.Aws.STACK_NAME}`,
      databaseName: props.gameEventsDatabase.ref,
      targets: {
        s3Targets: [
          {
            path: `s3://${props.analyticsBucket.bucketName}/${props.config.PROCESSED_EVENTS_PREFIX}`,
          },
        ],
      },
      schemaChangePolicy: {
        updateBehavior: "UPDATE_IN_DATABASE",
        deleteBehavior: "LOG",
      },
      configuration: `{
              "Version":1.0,
              "CrawlerOutput":{
                "Partitions":{
                  "AddOrUpdateBehavior":"InheritFromTable"
                },
                "Tables":{
                  "AddOrUpdateBehavior":"MergeNewColumns"
                }
              }
            }`,
    });

    // Workflow that triggers glue ETL job, processes s3 data, and updates the data catalog
    const gameEventsWorkflow = new glueCfn.CfnWorkflow(
      this,
      "GameEventsWorkflow",
      {
        description: `Orchestrates a Glue ETL Job and Crawler to process data in S3 and update data catalog, for stack ${cdk.Aws.STACK_NAME}`,
        defaultRunProperties: {
          "--enable-metrics": "true",
          "--enable-continuous-cloudwatch-log": "true",
          "--enable-glue-datacatalog": "true",
          "--database_name": props.gameEventsDatabase.ref,
          "--raw_events_table_name": props.rawEventsTable.ref,
          "--analytics_bucket": props.analyticsBucket.s3UrlForObject(),
          "--processed_data_prefix": props.config.PROCESSED_EVENTS_PREFIX,
          "--glue_tmp_prefix": props.config.GLUE_TMP_PREFIX,
          "--job-bookmark-option": "job-bookmark-enable",
          "--TempDir": `s3://${props.analyticsBucket.bucketName}/${props.config.GLUE_TMP_PREFIX}`,
        },
      }
    );

    // Trigger for Glue crawler
    const gameEventsCrawlerTrigger = new glueCfn.CfnTrigger(
      this,
      "GameEventsCrawlerTrigger",
      {
        type: "CONDITIONAL",
        description: `Starts a crawler to update the Glue Data Catalog with any changes detected in the processed_events S3 prefix after the ETL job runs, for stack ${cdk.Aws.STACK_NAME}`,
        startOnCreation: true,
        workflowName: gameEventsWorkflow.ref,
        actions: [
          {
            crawlerName: eventsCrawler.ref,
          },
        ],
        predicate: {
          conditions: [
            {
              logicalOperator: "EQUALS",
              jobName: gameEventsEtlJob.ref,
              state: "SUCCEEDED",
            },
          ],
        },
      }
    );
    gameEventsCrawlerTrigger.addDependency(gameEventsEtlJob);
    gameEventsCrawlerTrigger.addDependency(gameEventsWorkflow);
    gameEventsCrawlerTrigger.addDependency(eventsCrawler);

    // Trigger to start glue job
    const gameEventsETLJobTrigger = new glueCfn.CfnTrigger(
      this,
      "GameEventsTriggerETLJob",
      {
        workflowName: gameEventsWorkflow.ref,
        type: "SCHEDULED",
        description: `Triggers the start of ETL job to process raw_events, for stack ${cdk.Aws.STACK_NAME}.`,
        actions: [
          {
            jobName: gameEventsEtlJob.ref,
          },
        ],
        schedule: "cron(0 * * * ? *)",
        startOnCreation: true
      }
    );
    gameEventsETLJobTrigger.addDependency(gameEventsEtlJob);
    gameEventsETLJobTrigger.addDependency(gameEventsWorkflow);

    // Event that starts ETL job
    const etlJobStatusEventsRule = new events.Rule(this, "EtlJobStatusEvents", {
      description: `CloudWatch Events Rule for generating status events for the Glue ETL Job for ${cdk.Aws.STACK_NAME}.`,
      eventPattern: {
        detailType: ["Glue Job State Change"],
        source: ["aws.glue"],
        detail: {
          jobName: [gameEventsEtlJob.ref],
        },
      },
      enabled: true,
      targets: [new eventstargets.SnsTopic(props.notificationsTopic)],
    });
    etlJobStatusEventsRule.node.addDependency(gameEventsEtlJob);

    const glueCrawlerStatusEventsRule = new events.Rule(
      this,
      "GlueCrawlerStatusEvents",
      {
        description: `CloudWatch Events Rule for generating status events for Glue ETL Job for stack ${cdk.Aws.STACK_NAME}`,
        eventPattern: {
          source: ["aws.glue"],
          detailType: ["Glue Crawler State Change"],
          detail: {
            crawlerName: [eventsCrawler.ref],
          },
        },
        enabled: true,
        targets: [new eventstargets.SnsTopic(props.notificationsTopic)],
      }
    );
    glueCrawlerStatusEventsRule.node.addDependency(eventsCrawler);

    this.gameEventsEtlJob = gameEventsEtlJob;
    this.gameEventsIcebergJob = gameEventsIcebergJob;
  }
}
