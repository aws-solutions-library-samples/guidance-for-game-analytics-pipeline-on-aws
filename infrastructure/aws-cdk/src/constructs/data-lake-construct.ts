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
  public readonly gameAnalyticsWorkgroup: athena.CfnWorkGroup;

  constructor(parent: Construct, name: string, props: DataLakeConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // Glue Database
    const gameEventsDatabase = new glueCfn.CfnDatabase(
      this,
      "GameEventDatabase",
      {
        catalogId: cdk.Aws.ACCOUNT_ID,
        databaseInput: {
          description: `Database for game analytics events for stack: ${cdk.Aws.STACK_NAME}`,
          locationUri: props.analyticsBucket.s3UrlForObject(),
          name: props.config.EVENTS_DATABASE
        },
      }
    );


    // ---- Athena ---- //
    // Define the resources for the `GameAnalyticsWorkgroup` Athena workgroup
    const gameAnalyticsWorkgroup = new athena.CfnWorkGroup(
      this,
      "GameAnalyticsWorkgroup",
      {
        name: `${cdk.Aws.STACK_NAME}-Workgroup`,
        description: "Default workgroup for the solution workload",
        recursiveDeleteOption: true, // delete the associated queries when stack is deleted
        state: "ENABLED",
        workGroupConfiguration: {
          publishCloudWatchMetricsEnabled: true,
          resultConfiguration: {
            encryptionConfiguration: {
              encryptionOption: "SSE_S3",
            },
            outputLocation: `s3://${props.analyticsBucket.bucketName}/athena_query_results/`,
          },
        },
      }
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
      ...(props.config.ENABLE_APACHE_ICEBERG_SUPPORT
        ? {
          tableInput: {
            name: props.config.RAW_EVENTS_TABLE.toLowerCase(),
            description: 'Stores raw event data from the game analytics pipeline for stack ${cdk.Aws.STACK_NAME}',
            storageDescriptor: {
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
              location: `s3://${props.analyticsBucket.bucketName
                }/${props.config.RAW_EVENTS_TABLE.toLowerCase()}`,
              storedAsSubDirectories: false,
            },
            partitionKeys: [
              { name: "year", type: "string" },
              { name: "month", type: "string" },
              { name: "day", type: "string" },
            ],
            tableType: "EXTERNAL_TABLE",
          },
          openTableFormatInput: {
            icebergInput: {
              metadataOperation: "CREATE",
              version: "2",
            },
          },
        }
        : {
          tableInput: {
            name: props.config.RAW_EVENTS_TABLE,
            description: `Stores raw event data from the game analytics pipeline for stack ${cdk.Aws.STACK_NAME}`,
            tableType: "EXTERNAL_TABLE",
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
            partitionKeys: [
              { name: "year", type: "string" },
              { name: "month", type: "string" },
              { name: "day", type: "string" },
            ],
          },
        }),
    });
    rawEventsTable.addDependency(gameEventsDatabase);

    this.gameEventsDatabase = gameEventsDatabase;
    this.rawEventsTable = rawEventsTable;
    this.gameAnalyticsWorkgroup = gameAnalyticsWorkgroup;

    new cdk.CfnOutput(this, "GameEventsDatabaseOutput", {
      description: "Glue Catalog Database for storing game analytics events",
      value: gameEventsDatabase.ref,
    });
  }
}
