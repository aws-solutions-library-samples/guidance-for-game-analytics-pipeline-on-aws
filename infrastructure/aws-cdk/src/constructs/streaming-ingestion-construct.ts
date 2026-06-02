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
import * as kms from "aws-cdk-lib/aws-kms";
import * as logs from "aws-cdk-lib/aws-logs";
import * as kinesisFirehose from "aws-cdk-lib/aws-kinesisfirehose";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { MSKConstruct } from "./msk-construct";
import { DataLakeConstruct } from "./data-lake-construct";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface StreamingIngestionConstructProps extends cdk.StackProps {
  applicationsTable: cdk.aws_dynamodb.TableV2;
  gamesEventsStream: cdk.aws_kinesis.Stream | cdk.aws_msk.CfnServerlessCluster | undefined;
  analyticsBucket: cdk.aws_s3.Bucket;
  /**
   * Glue catalog table. Required in Glue-catalog mode (ENABLE_S3_TABLES = false).
   * Undefined in S3 Tables mode.
   */
  rawEventsTable?: cdk.aws_glue.CfnTable;
  /**
   * Glue catalog database. Required in Glue-catalog mode (ENABLE_S3_TABLES = false).
   * Undefined in S3 Tables mode.
   */
  gameEventsDatabase?: cdk.aws_glue.CfnDatabase;
  eventsProcessingFunction: cdk.aws_lambda.Function;
  config: GameAnalyticsPipelineConfig;
  /**
   * MSK construct to use as the Firehose source when INGEST_MODE === "KAFKA".
   * Required when INGEST_MODE is "KAFKA"; ignored otherwise.
   */
  mskConstruct?: MSKConstruct;
  /**
   * Datalake construct providing the canonical database/table names and, in
   * S3 Tables mode, the table bucket and federated catalog ARN. Required.
   */
  dataLakeConstruct: DataLakeConstruct;
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

    const kmsKey = new kms.Key(this, "FirehoseKmsKey", {
      description: "KMS Key for encrypting Firehose",
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(7),
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

    var streamAccessPolicy = new iam.PolicyStatement({});


    // Role for firehose
    const gamesEventsFirehoseRole = new iam.Role(
      this,
      "games-events-firehose-role",
      {
        assumedBy: new iam.CompositePrincipal(
          new iam.ServicePrincipal("firehose.amazonaws.com"),
          new iam.ServicePrincipal("glue.amazonaws.com")
        ),
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
                actions: ["logs:PutLogEvents"],
                effect: iam.Effect.ALLOW,
                resources: [firehoseLogGroup.logGroupArn],
              }),
            ],
          }),
        },
      }
    );

    /* Catalog access — depends on whether we're using the standard Glue
       catalog or the federated S3 Tables catalog. */
    if (props.config.ENABLE_S3_TABLES) {
      if (!props.dataLakeConstruct.tableBucket) {
        throw new Error(
          "StreamingIngestionConstruct: dataLakeConstruct.tableBucket is required when ENABLE_S3_TABLES === true"
        );
      }
      const tableBucketArn = props.dataLakeConstruct.tableBucket.attrTableBucketArn;
      const tableBucketName = props.dataLakeConstruct.tableBucket.tableBucketName;
      const dbName = props.dataLakeConstruct.databaseName;
      const tableName = props.dataLakeConstruct.rawEventsTableName;

      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "S3TablesAccessPermission",
          effect: iam.Effect.ALLOW,
          actions: [
            "s3tables:ListTables",
            "s3tables:GetNamespace",
            "s3tables:ListNamespaces",
            "s3tables:GetTable",
            "s3tables:GetTableData",
            "s3tables:GetTableMetadataLocation",
            "s3tables:UpdateTableMetadataLocation",
            "s3tables:PutTableData",
          ],
          resources: [
            tableBucketArn,
            `${tableBucketArn}/table/*`,
          ],
        })
      );
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "S3TableBucketAccessPermission",
          effect: iam.Effect.ALLOW,
          actions: ["s3tables:GetTableBucket"],
          resources: [tableBucketArn],
        })
      );
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "GlueCatalogAccessForS3Tables",
          effect: iam.Effect.ALLOW,
          actions: [
            "glue:GetDatabase",
            "glue:GetDatabases",
            "glue:GetTable",
            "glue:GetTables",
            "glue:UpdateTable",
          ],
          resources: [
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog/s3tablescatalog`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog/s3tablescatalog/${tableBucketName}`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${tableBucketName}/${dbName}`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${tableBucketName}/${dbName}/${tableName}`,
          ],
        })
      );
    } else {
      if (!props.gameEventsDatabase) {
        throw new Error(
          "StreamingIngestionConstruct: gameEventsDatabase prop is required when ENABLE_S3_TABLES === false"
        );
      }
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "glue:GetTable",
            "glue:GetTableVersion",
            "glue:GetTableVersions",
            "glue:GetSchema",
            "glue:GetSchemaVersion",
            "glue:CreateTable",
            "glue:UpdateTable",
            "glue:StartTransaction",
            "glue:CommitTransaction",
            "glue:GetDatabase",
          ],
          resources: [
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${props.gameEventsDatabase.ref}/*`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${props.gameEventsDatabase.ref}`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:registry/*`,
            `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:schema/*`,
          ],
        })
      );
    }

    if (props.gamesEventsStream instanceof cdk.aws_kinesis.Stream) {
      streamAccessPolicy = new iam.PolicyStatement({
        actions: [
          "kinesis:DescribeStream",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards",
        ],
        effect: iam.Effect.ALLOW,
        resources: [props.gamesEventsStream.streamArn],
      })
      gamesEventsFirehoseRole.addToPolicy(streamAccessPolicy);
    }

    /* Grant Firehose permission to use the KMS key for S3 encryption. */
    kmsKey.grantEncryptDecrypt(gamesEventsFirehoseRole);

    /* When MSK is the ingest source, grant Firehose the permissions it needs
       to discover the cluster, read from the topic, and use a consumer group. */
    if (props.config.INGEST_MODE === "KAFKA") {
      if (!props.mskConstruct) {
        throw new Error(
          "StreamingIngestionConstruct: mskConstruct prop is required when INGEST_MODE === 'KAFKA'"
        );
      }
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "MSKClusterPermission",
          effect: iam.Effect.ALLOW,
          actions: [
            "kafka:GetBootstrapBrokers",
            "kafka:DescribeCluster",
            "kafka:DescribeClusterV2",
            "kafka-cluster:Connect",
          ],
          resources: [props.mskConstruct.cluster.attrArn],
        })
      );
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "MSKTopicPermission",
          effect: iam.Effect.ALLOW,
          actions: [
            "kafka-cluster:DescribeTopic",
            "kafka-cluster:DescribeTopicDynamicConfiguration",
            "kafka-cluster:ReadData",
          ],
          resources: [props.mskConstruct.topicArn],
        })
      );
      gamesEventsFirehoseRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "MSKGroupPermission",
          effect: iam.Effect.ALLOW,
          actions: ["kafka-cluster:DescribeGroup"],
          resources: [props.mskConstruct.consumerGroupArnPattern],
        })
      );
    }
    
    // Prefix to send files to in s3
    const s3TimestampPrefix =
      "year=!{timestamp:YYYY}/month=!{timestamp:MM}/day=!{timestamp:dd}";

    var firehoseIngestDeliveryStreamType = "DIRECT_BATCH";
    var firehoseSourceConfiguration;
    if (props.config.INGEST_MODE === "KINESIS_DATA_STREAMS" && props.gamesEventsStream instanceof cdk.aws_kinesis.Stream) {
      firehoseIngestDeliveryStreamType = "KinesisStreamAsSource";
      firehoseSourceConfiguration = {
        kinesisStreamSourceConfiguration: {
          kinesisStreamArn: props.gamesEventsStream.streamArn,
          roleArn: gamesEventsFirehoseRole.roleArn,
        }
      }
    }

    if (props.config.INGEST_MODE === "KAFKA" && props.mskConstruct) {
      firehoseIngestDeliveryStreamType = "MSKAsSource";
      firehoseSourceConfiguration = {
        mskSourceConfiguration: {
          mskClusterArn: props.mskConstruct.cluster.attrArn,
          topicName: props.mskConstruct.topicName,
          authenticationConfiguration: {
            connectivity: "PRIVATE",
            roleArn: gamesEventsFirehoseRole.roleArn,
          },
        },
      }
    }

    if (props.config.INGEST_MODE == "DIRECT_BATCH" || (props.gamesEventsStream == undefined && props.config.INGEST_MODE !== "KAFKA")) {
      firehoseIngestDeliveryStreamType = "DirectPut";
      firehoseSourceConfiguration = {
        directPutSourceConfiguration: {
          throughputHintInMBs: 1,
        }
      }
    }

    var firehoseDestinationConfiguration = (props.config.ENABLE_APACHE_ICEBERG_SUPPORT ?
      {
        icebergDestinationConfiguration: {
          catalogConfiguration: {
            catalogArn: props.config.ENABLE_S3_TABLES && props.dataLakeConstruct.catalogArn
              ? props.dataLakeConstruct.catalogArn
              : `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
          },
          roleArn: gamesEventsFirehoseRole.roleArn,
          appendOnly: true,
          s3Configuration: {
            bucketArn: props.analyticsBucket.bucketArn,
            roleArn: gamesEventsFirehoseRole.roleArn,
            kmsKey: kmsKey.keyArn,
            bufferingHints: {
              intervalInSeconds: props.config.DEV_MODE ? 60 : 900,
              sizeInMBs: 128,
            },
          },
          destinationTableConfigurationList: [
            {
              destinationDatabaseName: props.dataLakeConstruct.databaseName,
              destinationTableName: props.dataLakeConstruct.rawEventsTableName,
              s3ErrorOutputPrefix: `firehose-errors/!{firehose:error-output-type}/`,
              uniqueKeys: ["event_id"],
            },
          ],
          cloudWatchLoggingOptions: {
            enabled: true,
            logGroupName: firehoseLogGroup.logGroupName,
            logStreamName: firehouseS3DeliveryLogStream.logStreamName,
          },
          processingConfiguration: {
            enabled: true,
            processors: [
              {
                type: "Lambda",
                parameters: [
                  {
                    parameterName: "LambdaArn",
                    parameterValue:
                      props.eventsProcessingFunction.functionArn,
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
          s3BackupMode: "FailedDataOnly",
        },
      }
      : {
        extendedS3DestinationConfiguration: {
          bucketArn: props.analyticsBucket.bucketArn,
          bufferingHints: {
            intervalInSeconds: props.config.DEV_MODE ? 60 : 900,
            sizeInMBs: 128,
          },
          prefix: `${props.config.RAW_EVENTS_PREFIX}/year=!{partitionKeyFromQuery:year}/month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/`,
          errorOutputPrefix: `firehose-errors/!{firehose:error-output-type}/`,
          compressionFormat: "UNCOMPRESSED",
          roleArn: gamesEventsFirehoseRole.roleArn,
          kmsKey: kmsKey.keyArn,
          dynamicPartitioningConfiguration: {
            enabled: true,
          },
          processingConfiguration: {
            enabled: true,
            processors: [
              {
                type: "Lambda",
                parameters: [
                  {
                    parameterName: "LambdaArn",
                    parameterValue:
                      props.eventsProcessingFunction.functionArn,
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
              {
                type: "MetadataExtraction",
                parameters: [
                  {
                    parameterName: "MetadataExtractionQuery",
                    parameterValue:
                      '{year: .event_timestamp| strftime("%Y"), month: .event_timestamp| strftime("%m"), day: .event_timestamp| strftime("%d")}',
                  },
                  {
                    parameterName: "JsonParsingEngine",
                    parameterValue: "JQ-1.6",
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
          s3BackupMode: props.config.S3_BACKUP_MODE
            ? "Enabled"
            : "Disabled",
          s3BackupConfiguration: {
            bucketArn: props.analyticsBucket.bucketArn,
            cloudWatchLoggingOptions: {
              enabled: true,
              logGroupName: firehoseLogGroup.logGroupName,
              logStreamName:
                firehouseBackupDeliveryLogStream.logStreamName,
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
              databaseName: props.dataLakeConstruct.databaseName,
              tableName: props.dataLakeConstruct.rawEventsTableName,
              region: cdk.Aws.REGION,
              versionId: "LATEST",
            },
          },
        },
      }
    )

    var firehoseSettings: kinesisFirehose.CfnDeliveryStreamProps = {
      deliveryStreamType: firehoseIngestDeliveryStreamType,
      ...firehoseSourceConfiguration,
      ...firehoseDestinationConfiguration
    }

    // Firehose to manage stream input, process data with Lambda, and send it to s3
    const gameEventsFirehose = new kinesisFirehose.CfnDeliveryStream(
      this,
      "game-events-firehose",
      firehoseSettings
    );

    gameEventsFirehose.node.addDependency(gamesEventsFirehoseRole);

    this.gameEventsFirehose = gameEventsFirehose;
  }
}