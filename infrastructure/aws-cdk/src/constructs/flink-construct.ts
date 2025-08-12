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
import * as kinesisanalytics from "aws-cdk-lib/aws-kinesisanalytics";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as assets from "aws-cdk-lib/aws-s3-assets";

import * as path from "path";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface ManagedFlinkConstructProps extends cdk.StackProps {
  /**
   * Base Codepath for business logic folder
   */
  baseCodePath: string;
  gameEventsStream: kinesis.IStream | undefined;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<ManagedFlinkConstructProps> = {};

/**
 * Deploys the Managed Flink construct
 *
 * Creates Managed Flink application, the aggregated metric output stream, as well as the Lambda Function for processing Managed Flink output sent to the aggregated metric output stream. 
 * Enables logging on the Managed Flink application and stores logs in a namespace for the application
 * starts the Managed Flink app automatically using a custom resource
 */
export class ManagedFlinkConstruct extends Construct {
  public readonly managedFlinkApp: kinesisanalytics.CfnApplicationV2;
  public readonly metricOutputStream: kinesis.Stream;

  constructor(
    parent: Construct,
    name: string,
    props: ManagedFlinkConstructProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };
    const codePath = `../${props.baseCodePath}`;

    /* The following defines the output stream for windowed metrics */
    const metricOutputStream = new kinesis.Stream(this, "metricOutputStream", {
      shardCount: props.config.STREAM_SHARD_COUNT,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /* Create an s3 asset for the flink code package */
    const flinkCodeAsset = new assets.Asset(this, "flinkCodeAsset", {
      path: path.join(
        __dirname,
        `${codePath}/flink-event-processing/target/deploy.zip`
      )
    })

    var streamAccess = new iam.PolicyDocument({});
    if (props.gameEventsStream instanceof kinesis.Stream) {
      streamAccess = new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: "ReadSourceKinesisStream",
            effect: iam.Effect.ALLOW,
            actions: [
              "kinesis:DescribeStream",
              "kinesis:DescribeStreamSummary",
              "kinesis:GetShardIterator",
              "kinesis:DescribeStreamConsumer",
              "kinesis:RegisterStreamConsumer",
              "kinesis:GetRecords",
              "kinesis:ListShards",
              "kinesis:DescribeLimits",
              "kinesis:ListStreamConsumers",
              "kinesis:SubscribeToShard"
            ],
            resources: [props.gameEventsStream.streamArn],
          }),
          new iam.PolicyStatement({
            sid: "WriteSinkKinesisStream",
            effect: iam.Effect.ALLOW,
            actions: [
              "kinesis:DescribeStream",
              "kinesis:DescribeStreamSummary",
              "kinesis:GetShardIterator",
              "kinesis:GetRecords",
              "kinesis:ListShards",
              "kinesis:PutRecord",
              "kinesis:PutRecords"
            ],
            resources: [metricOutputStream.streamArn],
        })]
      })
    }

    /* The following variables define the Managed Flink Application's IAM Role. */
    const flinkAppRole = new iam.Role(this, "flinkAppRole", {
      assumedBy: new iam.ServicePrincipal("kinesisanalytics.amazonaws.com"),
      inlinePolicies: {
        /* Allow Flink to access the application code and write to CloudWatch logs */
        flinkAppRunPermissions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: "ReadCode",
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:GetObject*"
              ],
              resources: [
                `${flinkCodeAsset.bucket.bucketArn}/${flinkCodeAsset.s3ObjectKey}`
              ]
            })
          ],
        }),
        /* Allow flink to access source and sink streams */
        streamAccess: streamAccess
      },
    });

    let flinkAppConfig = {};
    if (props.config.REAL_TIME_ANALYTICS === true && props.gameEventsStream != undefined) {
      // Set app config to point to kinesis
      flinkAppConfig = {
        "kinesis.stream.arn": props.gameEventsStream.streamArn,
        "kinesis.stream.name": props.gameEventsStream.streamName,
        "aws.region": cdk.Aws.REGION,
        "flink.stream.initpos": "LATEST",
        "flink.stream.max_record_count": "10000",
        "kinesis.stream.interval": "500"
      };
    }

    var propertyMap : kinesisanalytics.CfnApplicationV2.EnvironmentPropertiesProperty = {}

    /* The following defines the flink application used to process incoming game events and output them to the stream */
    const managedFlinkApp = new kinesisanalytics.CfnApplicationV2(this, "ManagedFlinkApp",
      {
        applicationName: `${props.config.WORKLOAD_NAME}-AnalyticsApplication`,
        applicationDescription: `Real-time game analytics application, for ${cdk.Aws.STACK_NAME}`,
        runtimeEnvironment: "FLINK-1_20",
        serviceExecutionRole: flinkAppRole.roleArn,
        applicationConfiguration: {
          flinkApplicationConfiguration: {
            checkpointConfiguration: {
              configurationType: "DEFAULT"
            },
            monitoringConfiguration: {
              configurationType: "CUSTOM",
              logLevel: "INFO",
              metricsLevel: "APPLICATION",
            },
            parallelismConfiguration: {
              autoScalingEnabled: true,
              configurationType: "CUSTOM"
            }
          },
          applicationCodeConfiguration: {
            codeContent: {
              s3ContentLocation: {
                bucketArn: flinkCodeAsset.bucket.bucketArn,
                fileKey: flinkCodeAsset.s3ObjectKey
              }
            },
            codeContentType: "ZIPFILE"
          },
          environmentProperties: {
            propertyGroups: [{
              propertyGroupId: "kinesis.analytics.flink.run.options",
              propertyMap: {
                "python": "main.py",
                "jarfile": "lib/pyflink-dependencies.jar",
              }
            }, {
              propertyGroupId: "sourceConfig",
              propertyMap: flinkAppConfig,
            }, {
              propertyGroupId: "sinkConfig",
              propertyMap: {
                "sink.connector": "kinesis",
                "kinesis.stream.arn": metricOutputStream.streamArn,
                "aws.region": cdk.Aws.REGION
              }
            }]
          }
        }
      }
    )

    // Create flink log groups and streams
    const flinkLogGroup = new logs.LogGroup(this, "flinkLogGroup", {
      logGroupName: `/aws/kinesis-analytics/${managedFlinkApp.ref}`,
      retention: props.config.CLOUDWATCH_RETENTION_DAYS
    });

    const flinkLogStream = new logs.LogStream(
      this,
      "flinkLogStream",
      {
        logStreamName: "kinesis-analytics-log-stream",
        logGroup: flinkLogGroup,
      }
    );


    /* The ARN of the log stream to write CloudWatch logs to */
    const flinkLogStreamArn = `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${flinkLogGroup.logGroupName}:log-stream:${flinkLogStream.logStreamName}`;

    // update IAM role to allow placing logs into log stream
    flinkAppRole.addToPolicy(new iam.PolicyStatement({
      sid: "ListCloudwatchLogGroups",
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:DescribeLogGroups",
      ],
      resources: [
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:*`
      ]
    }),)
    flinkAppRole.addToPolicy(new iam.PolicyStatement({
      sid: "ListCloudwatchLogStreams",
      effect: iam.Effect.ALLOW,
      actions: [
        "logs:DescribeLogStreams",
      ],
      resources: [
        `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${flinkLogGroup.logGroupName}:log-stream:*`
      ]
    }))
    flinkAppRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "PutCloudwatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:PutLogEvents"
        ],
        resources: [
          flinkLogStreamArn
        ]
      }))
    /* Enable logging for the managed flink application */
    const flinkLoggingConfiguration = new kinesisanalytics.CfnApplicationCloudWatchLoggingOptionV2(this, "FlinkAppLoggingOption",
      {
        applicationName: managedFlinkApp.ref,
        cloudWatchLoggingOption: {
          logStreamArn: flinkLogStreamArn
        }
      }
    )
    flinkLoggingConfiguration.addDependency(managedFlinkApp);

    this.managedFlinkApp = managedFlinkApp;
    this.metricOutputStream = metricOutputStream;
  }
}
