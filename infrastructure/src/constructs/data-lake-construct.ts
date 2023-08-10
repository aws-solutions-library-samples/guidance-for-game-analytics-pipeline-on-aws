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
export interface DataLakeConstructProps extends cdk.StackProps {
  analyticsBucket: s3.Bucket;
  config: GameAnalyticsPipelineConfig;
  notificationsTopic: sns.Topic;
}

const defaultProps: Partial<DataLakeConstructProps> = {};

/**
 * Deploys the DataLake construct
 *
 * Creates Glue to turn analytics s3 bucket into Datalake. Creates Jobs that can be used to process s3 data for Athena.
 */
export class DataLakeConstruct extends Construct {
  public readonly gameEventsDatabase: glueCfn.CfnDatabase;
  public readonly rawEventsTable: glueCfn.CfnTable;

  constructor(parent: Construct, name: string, props: DataLakeConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // Glue Database
    const gameEventsDatabase = new glueCfn.CfnDatabase(
      this,
      "GameEventsDatabase",
      {
        catalogId: cdk.Aws.ACCOUNT_ID,
        databaseInput: {
          description: `Database for game analytics events for stack: ${cdk.Aws.STACK_NAME}`,
          locationUri: `s3://${props.analyticsBucket.bucketName}`,
        },
      }
    );

    // Glue table for raw events that come in from stream
    const rawEventsTable = new glueCfn.CfnTable(this, "GameRawEventsTable", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: gameEventsDatabase.ref,
      tableInput: {
        description: `Stores raw event data from the game analytics pipeline for stack ${cdk.Aws.STACK_NAME}`,
        name: props.config.RAW_EVENTS_TABLE,
        tableType: "EXTERNAL_TABLE",
        partitionKeys: [
          { name: "year", type: "string" },
          { name: "month", type: "string" },
          { name: "day", type: "string" },
        ],
        parameters: {
          classification: "parquet",
          compressionType: "none",
          typeOfData: "file",
        },
        storageDescriptor: {
          outputFormat:
            "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat",
          inputFormat:
            "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat",
          compressed: false,
          numberOfBuckets: -1,
          serdeInfo: {
            serializationLibrary:
              "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe",
            parameters: {
              "serialization.format": "1",
            },
          },
          bucketColumns: [],
          sortColumns: [],
          storedAsSubDirectories: false,
          location: `s3://${props.analyticsBucket.bucketName}/${props.config.RAW_EVENTS_PREFIX}`,
          columns: [
            { name: "event_id", type: "string" },
            { name: "event_type", type: "string" },
            { name: "event_name", type: "string" },
            { name: "event_version", type: "string" },
            { name: "event_timestamp", type: "bigint" },
            { name: "app_version", type: "string" },
            { name: "application_id", type: "string" },
            { name: "application_name", type: "string" },
            { name: "event_data", type: "string" },
            { name: "metadata", type: "string" },
          ],
        },
      },
    });
    rawEventsTable.addDependency(gameEventsDatabase);

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
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${gameEventsDatabase.ref}/*`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${gameEventsDatabase.ref}`,
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
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${gameEventsDatabase.ref}`,
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
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${gameEventsDatabase.ref}/*`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${gameEventsDatabase.ref}`,
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
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${gameEventsDatabase.ref}`,
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
      glueVersion: "4.0",
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
        "--database_name": gameEventsDatabase.ref,
        "--raw_events_table_name": props.config.RAW_EVENTS_TABLE,
        "--analytics_bucket": `s3://${props.analyticsBucket.bucketName}/`,
        "--processed_data_prefix": props.config.PROCESSED_EVENTS_PREFIX,
        "--glue_tmp_prefix": props.config.GLUE_TMP_PREFIX,
        "--job-bookmark-option": "job-bookmark-enable",
        "--TempDir": `s3://${props.analyticsBucket.bucketName}/${props.config.GLUE_TMP_PREFIX}`,
      },
    });

    // Crawler crawls s3 partitioned data
    const eventsCrawler = new glueCfn.CfnCrawler(this, "EventsCrawler", {
      role: glueCrawlerRole.roleArn,
      description: `AWS Glue Crawler for partitioned data, for stack ${cdk.Aws.STACK_NAME}`,
      databaseName: gameEventsDatabase.ref,
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
          "--database_name": gameEventsDatabase.ref,
          "--raw_events_table_name": rawEventsTable.ref,
          "--analytics_bucket": `s3://${props.analyticsBucket.bucketName}/`,
          "--processed_data_prefix": props.config.PROCESSED_EVENTS_PREFIX,
          "--glue_tmp_prefix": props.config.GLUE_TMP_PREFIX,
          "--job-bookmark-option": "job-bookmark-enable",
          "--TempDir": `s3://${props.analyticsBucket.bucketName}/${props.config.GLUE_TMP_PREFIX}`,
        },
      }
    );
    gameEventsWorkflow.addDependency(gameEventsDatabase);
    gameEventsWorkflow.addDependency(rawEventsTable);

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
        type: "ON_DEMAND",
        description: `Triggers the start of ETL job to process raw_events, for stack ${cdk.Aws.STACK_NAME}.`,
        actions: [
          {
            jobName: gameEventsEtlJob.ref,
          },
        ],
      }
    );
    gameEventsETLJobTrigger.addDependency(gameEventsEtlJob);
    gameEventsETLJobTrigger.addDependency(gameEventsWorkflow);

    // Even that starts ETL job
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

    this.gameEventsDatabase = gameEventsDatabase;
    this.rawEventsTable = rawEventsTable;

    new cdk.CfnOutput(this, "GameEventsEtlJobOutput", {
      description:
        "ETL Job for processing game events into optimized format for analytics",
      value: gameEventsEtlJob.ref,
    });

    new cdk.CfnOutput(this, "GameEventsDatabaseOutput", {
      description: "Glue Catalog Database for storing game analytics events",
      value: gameEventsDatabase.ref,
    });
  }
}
