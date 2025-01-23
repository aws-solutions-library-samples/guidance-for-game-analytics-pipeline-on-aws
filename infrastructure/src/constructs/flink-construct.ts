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
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as assets from "aws-cdk-lib/aws-s3-assets";

import * as path from "path";
import fs from "fs";
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface ManagedFlinkConstructProps extends cdk.StackProps {
  /**
   * Base Codepath for business logic folder
   */
  baseCodePath: string;
  gameEventsStream: kinesis.IStream;
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
  public readonly metricProcessingFunction: NodejsFunction;
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
    const flinkAppName = `${cdk.Aws.STACK_NAME}-AnalyticsApplication`;


    /* The following variables define the necessary resources for the `MetricProcessingFunction` serverless
    function. This function consumes outputs from the metric output stream and writes them to 
    CloudWatch custom metrics. */
    const metricProcessingFunction = new NodejsFunction(
      this,
      "MetricProcessingFunction",
      {
        description:
          "Consumes outputs from Managed Flink application for processing",
        entry: path.join(
          __dirname,
          `${codePath}/metric-handler/index.js`
        ),
        depsLockFilePath: path.join(
          __dirname,
          `${codePath}/metric-handler/package-lock.json`
        ),

        memorySize: 128,
        timeout: cdk.Duration.seconds(60),
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          stackName: cdk.Aws.STACK_NAME,
          CW_NAMESPACE: `${cdk.Aws.STACK_NAME}/AWSGameAnalytics`,
        },
      }
    );
    metricProcessingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "CloudWatch",
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );
    metricProcessingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "XRay",
        effect: iam.Effect.ALLOW,
        actions: [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
          "xray:GetSamplingRules",
          "xray:GetSamplingTargets",
        ],
        resources: ["*"],
      })
    );

    /* The following defines the output stream for windowed metrics */
    const metricOutputStream = new kinesis.Stream(this, "metricOutputStream", {
      shardCount: props.config.METRIC_STREAM_SHARD_COUNT,
    });

    /* Create an output for the metric output stream to the processing lambda */
    const metricLambdaOutputSource = new lambdaEventSources.KinesisEventSource(
      metricOutputStream,
      {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON
      }
    );

    // link event source to lambda
    metricProcessingFunction.addEventSource(metricLambdaOutputSource);

    /* Create an s3 asset for the flink code package */
    const flinkCodeAsset = new assets.Asset(this, "flinkCodeAsset", {
      path: path.join(
        __dirname,
        `${codePath}/flink-event-processing/target/deploy.zip`
      )
    })

    // Create flink log groups and streams
    const flinkLogGroup = new logs.LogGroup(this, "flinkLogGroup", {
      logGroupName: `/aws/kinesis-analytics/${flinkAppName}`,
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
            }),
            new iam.PolicyStatement({
              sid: "ListCloudwatchLogGroups",
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:DescribeLogGroups",
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:*`
              ]
            }),
            new iam.PolicyStatement({
              sid: "ListCloudwatchLogStreams",
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:DescribeLogStreams",
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${flinkLogGroup.logGroupName}:log-stream:*`
              ]
            }),
            new iam.PolicyStatement({
              sid: "PutCloudwatchLogs",
              effect: iam.Effect.ALLOW,
              actions: [
                "logs:PutLogEvents"
              ],
              resources: [
                flinkLogStreamArn
              ]
            })
          ],
        }),
        /* Allow flink to access source and sink streams */
        kinesisStreamAccess: new iam.PolicyDocument({
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
      },
    });


    /* The following defines the flink application used to process incoming game events and output them to the stream */
    const managedFlinkApp = new kinesisanalytics.CfnApplicationV2(this, "ManagedFlinkApp",
      {
        applicationName: flinkAppName,
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
              propertyMap: {
                "kinesis.stream.arn": props.gameEventsStream.streamArn,
                "kinesis.stream.name": props.gameEventsStream.streamName,
                "aws.region": cdk.Aws.REGION,
                "flink.stream.initpos": "LATEST",
                "flink.stream.max_record_count": "10000",
                "kinesis.stream.interval": "500"
              }
            }, {
              propertyGroupId: "sinkConfig",
              propertyMap: {
                "kinesis.stream.arn": metricOutputStream.streamArn,
                "aws.region": cdk.Aws.REGION
              }
            }]
          }
        }
      }
    )

    /* Enable logging for the managed flink application */
    const flinkLoggingConfiguration = new kinesisanalytics.CfnApplicationCloudWatchLoggingOptionV2(this, "FlinkAppLoggingOption",
      {
        applicationName: flinkAppName,
        cloudWatchLoggingOption: {
          logStreamArn: flinkLogStreamArn
        }
      }
    )
    flinkLoggingConfiguration.addDependency(managedFlinkApp)


    this.metricProcessingFunction = metricProcessingFunction;
    this.managedFlinkApp = managedFlinkApp;
    this.metricOutputStream = metricOutputStream;

    new cdk.CfnOutput(this, "FlinkAppOutput", {
      description:
        "Name of the Flink Application for game analytics",
      value: managedFlinkApp.ref,
    });
    new cdk.CfnOutput(this, "MetricOutputStreamARN", {
      description:
        "ARN of the Kinesis Stream that recieves aggregated metrics from the Flink application",
      value: metricOutputStream.streamArn,
    });
    new cdk.CfnOutput(this, "FlinkAnalyticsCloudWatch", {
      description:
        "Link to the Amazon CloudWatch namespace where custom metrics are published by the solution AnalyticsProcessingFunction.",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#metricsV2:graph=~();query=${cdk.Aws.STACK_NAME}/AWSGameAnalytics`,
    });
  }
}
