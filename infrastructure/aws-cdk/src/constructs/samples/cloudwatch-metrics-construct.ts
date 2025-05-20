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
import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "../../helpers/config-types";
import { Aws, Fn } from "aws-cdk-lib";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface CustomMetricsConstructProps extends cdk.StackProps {
    /**
     * Base Codepath for business logic folder
     */
    baseCodePath: string;
    metricOutputStream: kinesis.IStream;
    config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<CustomMetricsConstructProps> = {};

/**
 * Deploys the Managed Flink construct
 *
 * Creates Managed Flink application, the aggregated metric output stream, as well as the Lambda Function for processing Managed Flink output sent to the aggregated metric output stream. 
 * Enables logging on the Managed Flink application and stores logs in a namespace for the application
 * starts the Managed Flink app automatically using a custom resource
 */
export class CustomMetricsConstruct extends Construct {
    public readonly metricProcessingFunction: NodejsFunction;
    public readonly analyticsLogGroup: logs.LogGroup;

    constructor(
        parent: Construct,
        name: string,
        props: CustomMetricsConstructProps
    ) {
        super(parent, name);

        /* eslint-disable @typescript-eslint/no-unused-vars */
        props = { ...defaultProps, ...props };
        const codePath = `../${props.baseCodePath}`;


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
                runtime: lambda.Runtime.NODEJS_22_X,
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

        // Create the Kinesis Analytics Log Group
        const analyticsLogGroup = new logs.LogGroup(this, "KinesisAnalyticsLogGroup", {
            logGroupName: `/aws/lambda/${metricProcessingFunction.functionName}`,
            retention: props.config.CLOUDWATCH_RETENTION_DAYS,
        });

        /* Create an output for the metric output stream to the processing lambda */
        const metricLambdaOutputSource = new lambdaEventSources.KinesisEventSource(
            props.metricOutputStream,
            {
                startingPosition: lambda.StartingPosition.TRIM_HORIZON
            }
        );

        // link event source to lambda
        metricProcessingFunction.addEventSource(metricLambdaOutputSource);

        this.metricProcessingFunction = metricProcessingFunction;
        this.analyticsLogGroup = analyticsLogGroup;
    }
}
