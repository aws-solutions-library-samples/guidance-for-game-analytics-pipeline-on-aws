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
import { Construct } from "constructs";
import * as kinesisanalytics from "aws-cdk-lib/aws-kinesisanalytics";
import * as customresources from "aws-cdk-lib/custom-resources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as assets from "aws-cdk-lib/aws-s3-assets";

import * as path from "path";
import fs from "fs";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface FlinkConstructProps extends cdk.StackProps {
  /**
   * Base Codepath for business logic folder
   */
  baseCodePath: string;
  gameEventsStream: kinesis.IStream;
  solutionHelper: lambda.IFunction;
  solutionHelperProvider: customresources.Provider;
}

const defaultProps: Partial<FlinkConstructProps> = {};

/**
 * Deploys the StreamingAnalytics construct
 *
 * Creates KDA application as well as Lambda Function for processing KDA output. Logs are stored in correct places
 * and KDA app is started automatically using a custom resource
 */
export class FlinkConstruct extends Construct {
  public readonly analyticsProcessingFunction: NodejsFunction;
  public readonly flinkApp: kinesisanalytics.CfnApplicationV2;

  constructor(
    parent: Construct,
    name: string,
    props: FlinkConstructProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };
    const codePath = `../${props.baseCodePath}`;

    /* The following variables define the necessary resources for the `AnalyticsProcessingFunction` serverless
            function. This function consumes outputs from Kinesis Data Analytics application for processing. */
    const analyticsProcessingFunction = new NodejsFunction(
      this,
      "FlinkMetricProcessingFunction",
      {
        description:
          "Consumes outputs from Kinesis Data Analytics application for processing",
        entry: path.join(
          __dirname,
          `${codePath}/flink-handler/index.js`
        ),
        depsLockFilePath: path.join(
          __dirname,
          `${codePath}/flink-handler/package-lock.json`
        ),

        memorySize: 128,
        timeout: cdk.Duration.seconds(60),
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          stackName: cdk.Aws.STACK_NAME,
          CW_NAMESPACE: `${cdk.Aws.STACK_NAME}/AWSGameAnalyticsV2`,
        },
      }
    );
    analyticsProcessingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "CloudWatch",
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );
    analyticsProcessingFunction.addToRolePolicy(
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

    /* The following defines the output stream for windowed metrics*/
    const metricOutputStream = new kinesis.Stream(this, "metricOutputStream", {
      shardCount: 1, // TODO: Make configurable
    });

    /* Create an output for the metric output stream to the processing lambda */
    const metricLambdaOutputSource = new lambdaEventSources.KinesisEventSource(
      metricOutputStream,
      {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON
      }
    );

    // link event source to lambda
    analyticsProcessingFunction.addEventSource(metricLambdaOutputSource);

    /* Create an s3 asset for the flink code package */
    const flinkCodeAsset = new assets.Asset(this, "flinkCodeAsset", {
      path: path.join(
        __dirname,
        `${codePath}/flink-event-processing/target/deploy.zip`
      )
    })

    // Create flink log groups and streams
    const flinkLogGroup = new logs.LogGroup(this, "flinkLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH // TODO: Make configurable
    });

    const flinkLogStream = new logs.LogStream(
      this,
      "flinkLogStream",
      {
        logGroup: flinkLogGroup,
      }
    );
    const flinkLogStreamArn = `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:${flinkLogGroup.logGroupName}:log-stream:${flinkLogStream.logStreamName}`;

    /* The following variables define the Kinesis Analytics Application's IAM Role. */
    const flinkAppRole = new iam.Role(this, "flinkAppRole", {
      assumedBy: new iam.ServicePrincipal("kinesisanalytics.amazonaws.com"),
      inlinePolicies: {
        /* Allow flink to access code and write logs */
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
        /* Allow flink to access streams */
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

    const flinkAppName = `${cdk.Aws.STACK_NAME}-AnalyticsApplication`;

    /* The following defines the flink application used to process incoming game events and output them to the stream */
    const flinkApp = new kinesisanalytics.CfnApplicationV2(this, "FlinkApp",
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
                "aws.region": cdk.Aws.REGION,
                "flink.stream.initpos": "LATEST",
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

    const flinkAppLogging = new kinesisanalytics.CfnApplicationCloudWatchLoggingOptionV2(this, "FlinkAppLoggingOption",
      {
        applicationName: flinkAppName,
        cloudWatchLoggingOption: {
          logStreamArn: flinkLogStreamArn
        }
      }
    )
    flinkAppLogging.addDependency(flinkApp)

    // allow helper to see and start application
    props.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "FlinkStartPermissions",
        effect: iam.Effect.ALLOW,
        actions: [
          "kinesisanalytics:StartApplication",
          "kinesisanalytics:DescribeApplication",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:kinesisanalytics:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:application/${flinkApp.applicationName}`,
        ],
      })
    );

    // starts the app
    const startFlinkAppCustomResource = new cdk.CustomResource(
      this,
      "StartFlinkApp",
      {
        serviceToken: props.solutionHelperProvider.serviceToken,
        properties: {
          customAction: "startFlinkApp",
          Region: cdk.Aws.REGION,
          kinesisAnalyticsAppName: flinkApp.applicationName,
        },
      }
    );
    // start flink app after event stream is initialized
    startFlinkAppCustomResource.node.addDependency(
      props.gameEventsStream
    );
    // start flink app after output stream is created
    startFlinkAppCustomResource.node.addDependency(
      metricOutputStream
    );
    // start flink app after lambda is created
    startFlinkAppCustomResource.node.addDependency(
      analyticsProcessingFunction
    );


    new cdk.CfnOutput(this, "FlinkAppOutput", {
      description:
        "Name of the Flink Application for game analytics",
      value: flinkApp.ref,
    });

    new cdk.CfnOutput(this, "FlinkAnalyticsCloudWatch", {
      description:
        "Link to the Amazon CloudWatch namespace where custom metrics are published by the solution AnalyticsProcessingFunction.",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#metricsV2:graph=~();query=${cdk.Aws.STACK_NAME}/AWSGameAnalytics`,
    });
  }
}
