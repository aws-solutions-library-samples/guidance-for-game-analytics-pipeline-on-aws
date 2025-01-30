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
import { aws_glue as glue } from "aws-cdk-lib";

import * as glueCfn from "aws-cdk-lib/aws-glue";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as eventstargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as athena from "aws-cdk-lib/aws-athena";

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

  private createDefaultAthenaQueries(
    databaseName: string,
    tableName: string,
    workgroupName: string
  ) {
    const queries = [
      {
        database: databaseName,
        name: "LatestEventsQuery",
        description: "Get latest events by event_timestamp",
        workgroup: workgroupName,
        query: `SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
                FROM "${databaseName}"."${tableName}"
                ORDER BY event_timestamp_america_new_york DESC
                LIMIT 10;`,
      },
      {
        database: databaseName,
        name: "TotalEventsQuery",
        description: "Total events",
        workgroup: workgroupName,
        query: `SELECT application_id, count(DISTINCT event_id) as event_count 
                FROM "${databaseName}"."${tableName}"
                GROUP BY application_id`,
      },
      {
        database: databaseName,
        name: "TotalEventsMonthQuery",
        description: "Total events over last month",
        workgroup: workgroupName,
        query: `WITH detail AS
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
                FROM "${databaseName}"."${tableName}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
                FROM detail 
                GROUP BY date_trunc('month', event_month), application_id`,
      },
      {
        database: databaseName,
        name: "TotalIapTransactionsLastMonth",
        description: "Total IAP Transactions over the last month",
        workgroup: workgroupName,
        query: `WITH detail AS 
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
                FROM "${databaseName}"."${tableName}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
                FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
                AND event_type = 'iap_transaction'
                GROUP BY date_trunc('month', event_month), application_id`,
      },
      {
        database: databaseName,
        name: "NewUsersLastMonth",
        description: "New Users over the last month",
        workgroup: workgroupName,
        query: `WITH detail AS (
                SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, *
                FROM "${databaseName}"."${tableName}")
                SELECT
                date_trunc('month', event_month) as month,
                count(*) as new_accounts
                FROM detail
                WHERE event_type = 'user_registration'
                GROUP BY date_trunc('month', event_month);`,
      },
      {
        database: databaseName,
        name: "TotalPlaysByLevel",
        description: "Total number of times each level has been played",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
                FROM "${databaseName}"."${tableName}"
                WHERE event_type = 'level_started'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "TotalFailuresByLevel",
        description: "Total number of failures on each level",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_failed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "TotalCompletionsByLevel",
        description: "Total number of completions on each level",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_completed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "LevelCompletionRate",
        description: "Rate of completion for each level",
        workgroup: workgroupName,
        query: `with t1 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_started' GROUP BY json_extract_scalar(event_data, '$.level_id') 
                ),
                t2 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_completed'GROUP BY json_extract_scalar(event_data, '$.level_id') 
                )
                select t2.level, (cast(t2.level_count AS DOUBLE) / (cast(t2.level_count AS DOUBLE) + cast(t1.level_count AS DOUBLE))) * 100 as level_completion_rate from 
                t1 JOIN t2 ON t1.level = t2.level
                ORDER by level;`,
      },
      {
        database: databaseName,
        name: "AverageUserSentimentPerDay",
        description: "User sentiment score by day",
        workgroup: workgroupName,
        query: `SELECT
                avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
                date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
                FROM "${databaseName}"."${tableName}"
                WHERE json_extract_scalar(event_data, '$.user_rating') is not null
                GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));`,
      },
      {
        database: databaseName,
        name: "UserReportedReasonsCount",
        description: "Reasons users are being reported, grouped by reason code",
        workgroup: workgroupName,
        query: `SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
                FROM "${databaseName}"."${tableName}"
                GROUP BY json_extract_scalar(event_data, '$.report_reason')
                ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;`,
      },
      {
        database: databaseName,
        name: "CTASCreateIcebergTables",
        description: "Create table as (CTAS) from existing tables to iceberg",
        workgroup: workgroupName,
        query: `CREATE TABLE "${tableName}"."raw_events_iceberg"
                WITH (table_type = 'ICEBERG',
                    format = 'PARQUET', 
                    location = 's3://your_bucket/', 
                    is_external = false,
                    partitioning = ARRAY['application_id', 'year', 'month', 'day'],
                    vacuum_min_snapshots_to_keep = 10,
                    vacuum_max_snapshot_age_seconds = 604800
                ) 
                AS SELECT * FROM "${databaseName}"."${tableName}";`,
      },
    ];

    for (const query of queries) {
      new athena.CfnNamedQuery(this, `NamedQuery-${query.name}`, {
        database: query.database,
        name: query.name,
        workGroup: query.workgroup,
        description: query.description,
        queryString: query.query,
      });
    }
  }

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

    this.createDefaultAthenaQueries(
      gameEventsDatabase.ref,
      props.config.RAW_EVENTS_TABLE,
      `GameAnalyticsWorkgroup-${cdk.Aws.STACK_NAME}`
    );

    const cfnDataCatalogEncryptionSettings =
      new glue.CfnDataCatalogEncryptionSettings(
        this,
        "DataCatalogEncryptionSettings",
        {
          catalogId: cdk.Aws.ACCOUNT_ID,
          dataCatalogEncryptionSettings: {
            connectionPasswordEncryption: {
              returnConnectionPasswordEncrypted: true,
            },
            encryptionAtRest: {
              catalogEncryptionMode: "SSE-KMS",
            },
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
        "--database_name": gameEventsDatabase.ref,
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
          "--database_name": "gameEventsDatabase.ref",
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
        type: "SCHEDULED",
        description: `Triggers the start of ETL job to process raw_events, for stack ${cdk.Aws.STACK_NAME}.`,
        actions: [
          {
            jobName: gameEventsEtlJob.ref,
          },
        ],
        schedule: "cron(0 * * * ? *)",
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

    this.gameEventsDatabase = gameEventsDatabase;
    this.rawEventsTable = rawEventsTable;

    new cdk.CfnOutput(this, "GameEventsEtlJobOutput", {
      description:
        "ETL Job for processing game events into optimized format for analytics",
      value: gameEventsEtlJob.ref,
    });

    new cdk.CfnOutput(this, "GameEventsIcebergJobOutput", {
      description:
        "ETL Job for transform existing game events into Apache Iceberg table format using Amazon Glue",
      value: gameEventsIcebergJob.ref,
    });

    new cdk.CfnOutput(this, "GameEventsDatabaseOutput", {
      description: "Glue Catalog Database for storing game analytics events",
      value: gameEventsDatabase.ref,
    });
  }
}
