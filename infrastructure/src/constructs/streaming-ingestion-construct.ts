/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kinesisFirehose from "aws-cdk-lib/aws-kinesisfirehose";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface StreamingIngestionConstructProps extends cdk.StackProps {
  applicationsTable: cdk.aws_dynamodb.Table;
  gamesEventsStream: cdk.aws_kinesis.Stream;
  analyticsBucket: cdk.aws_s3.Bucket;
  rawEventsTable: cdk.aws_glue.CfnTable;
  gameEventsDatabase: cdk.aws_glue.CfnDatabase;
  eventsProcessingFunction: cdk.aws_lambda.Function;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<StreamingIngestionConstructProps> = {};

/**
 * Deploys the StreamingIngestion construct
 */
export class StreamingIngestionConstruct extends Construct {
  public readonly gameEventsFirehose: kinesisFirehose.CfnDeliveryStream;

  constructor(
    parent: Construct,
    name: string,
    props: StreamingIngestionConstructProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // Create firehouse log groups and streams
    const firehoseLogGroup = new logs.LogGroup(this, "firehose-log-group", {
      retention: props.config.CLOUDWATCH_RETENTION_DAYS,
    });

    const firehouseS3DeliveryLogStream = new logs.LogStream(
      this,
      "firehose-s3-delivery-log-stream",
      {
        logGroup: firehoseLogGroup,
      }
    );

    const firehouseBackupDeliveryLogStream = new logs.LogStream(
      this,
      "firehose-backup-delivery-log-stream",
      {
        logGroup: firehoseLogGroup,
      }
    );

    // Role for firehose
    const gamesEventsFirehoseRole = new iam.Role(
      this,
      "games-events-firehose-role",
      {
        assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
        inlinePolicies: {
          firehose_delivery_policy: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: [
                  "s3:AbortMultipartUpload",
                  "s3:GetBucketLocation",
                  "s3:GetObject",
                  "s3:ListBucket",
                  "s3:ListBucketMultipartUploads",
                  "s3:PutObject",
                ],
                effect: iam.Effect.ALLOW,
                resources: [
                  props.analyticsBucket.arnForObjects("*"),
                  props.analyticsBucket.bucketArn,
                ],
              }),
              new iam.PolicyStatement({
                actions: [
                  "lambda:InvokeFunction",
                  "lambda:GetFunctionConfiguration",
                ],
                effect: iam.Effect.ALLOW,
                resources: [props.eventsProcessingFunction.functionArn],
              }),
              new iam.PolicyStatement({
                actions: [
                  "kinesis:DescribeStream",
                  "kinesis:GetShardIterator",
                  "kinesis:GetRecords",
                  "kinesis:ListShards",
                ],
                effect: iam.Effect.ALLOW,
                resources: [props.gamesEventsStream.streamArn],
              }),
              new iam.PolicyStatement({
                actions: [
                  "glue:GetTable",
                  "glue:GetTableVersion",
                  "glue:GetTableVersions",
                ],
                effect: iam.Effect.ALLOW,
                resources: [
                  `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.gameEventsDatabase.ref}/*`,
                  `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
                  `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
                ],
              }),
              new iam.PolicyStatement({
                actions: ["logs:PutLogEvents"],
                effect: iam.Effect.ALLOW,
                resources: [firehoseLogGroup.logGroupArn],
              }),
            ],
          }),
        },
      }
    );

    // Prefix to send files to in s3
    const s3TimestampPrefix =
      "year=!{timestamp:YYYY}/month=!{timestamp:MM}/day=!{timestamp:dd}";

    // Firehose to manage stream input, process data with Lambda, and send it to s3
    const gameEventsFirehose = new kinesisFirehose.CfnDeliveryStream(
      this,
      "game-events-firehose",
      {
        deliveryStreamType: "KinesisStreamAsSource",
        kinesisStreamSourceConfiguration: {
          kinesisStreamArn: props.gamesEventsStream.streamArn,
          roleArn: gamesEventsFirehoseRole.roleArn,
        },
        extendedS3DestinationConfiguration: {
          bucketArn: props.analyticsBucket.bucketArn,
          bufferingHints: {
            intervalInSeconds: props.config.DEV_MODE ? 60 : 900,
            sizeInMBs: 128,
          },
          prefix: `${props.config.RAW_EVENTS_PREFIX}/${s3TimestampPrefix}/`,
          errorOutputPrefix: `firehose-errors/${s3TimestampPrefix}/!{firehose:error-output-type}/`,
          compressionFormat: "UNCOMPRESSED",
          roleArn: gamesEventsFirehoseRole.roleArn,
          processingConfiguration: {
            enabled: true,
            processors: [
              {
                type: "Lambda",
                parameters: [
                  {
                    parameterName: "LambdaArn",
                    parameterValue: props.eventsProcessingFunction.functionArn,
                  },
                  {
                    parameterName: "BufferIntervalInSeconds",
                    parameterValue: "60",
                  },
                  {
                    parameterName: "BufferSizeInMBs",
                    parameterValue: "3",
                  },
                  {
                    parameterName: "NumberOfRetries",
                    parameterValue: "3",
                  },
                ],
              },
            ],
          },
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehouseS3DeliveryLogStream.logStreamName,
          },
          s3BackupMode: props.config.S3_BACKUP_MODE ? "Enabled" : "Disabled",
          s3BackupConfiguration: {
            bucketArn: props.analyticsBucket.bucketArn,
            cloudWatchLoggingOptions: {
              enabled: true,
              logGroupName: firehoseLogGroup.logGroupName,
              logStreamName: firehouseBackupDeliveryLogStream.logStreamName,
            },
            compressionFormat: "GZIP",
            bufferingHints: {
              intervalInSeconds: 900,
              sizeInMBs: 128,
            },
            prefix: `FirehoseS3SourceRecordBackup/${s3TimestampPrefix}/`,
            errorOutputPrefix: `FirehoseS3SourceRecordBackup/firehose-errors/${s3TimestampPrefix}/!{firehose:error-output-type}/`,
            roleArn: gamesEventsFirehoseRole.roleArn,
          },
          dataFormatConversionConfiguration: {
            enabled: true,
            inputFormatConfiguration: {
              deserializer: {
                openXJsonSerDe: {
                  caseInsensitive: true,
                  convertDotsInJsonKeysToUnderscores: false,
                },
              },
            },
            outputFormatConfiguration: {
              serializer: {
                parquetSerDe: {
                  compression: "SNAPPY",
                },
              },
            },
            schemaConfiguration: {
              catalogId: cdk.Aws.ACCOUNT_ID,
              roleArn: gamesEventsFirehoseRole.roleArn,
              databaseName: props.gameEventsDatabase.ref,
              tableName: props.rawEventsTable.ref,
              region: cdk.Aws.REGION,
              versionId: "LATEST",
            },
          },
        },
      }
    );

    this.gameEventsFirehose = gameEventsFirehose;
  }
}
