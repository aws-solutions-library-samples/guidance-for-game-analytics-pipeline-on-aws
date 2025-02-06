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

import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { StreamingAnalyticsConstruct } from "./streaming-analytics";
import { ApiConstruct } from "./api-construct";
import { StreamingIngestionConstruct } from "./streaming-ingestion-construct";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface MetricsConstructProps extends cdk.StackProps {
    config: GameAnalyticsPipelineConfig;
    streamingAnalyticsConstruct: StreamingAnalyticsConstruct | undefined;
    notificationsTopic: cdk.aws_sns.Topic;
    gamesApiConstruct: ApiConstruct;
    streamingIngestionConstruct: StreamingIngestionConstruct;
    gameEventsStream: cdk.aws_kinesis.Stream;
    tables: cdk.aws_dynamodb.Table[];
    functions: lambda.Function[];
}

const defaultProps: Partial<MetricsConstructProps> = {};

/**
 * Deploys the Metrics construct
 */
export class MetricsConstruct extends Construct {
    constructor(parent: Construct, name: string, props: MetricsConstructProps) {
        super(parent, name);

        /* eslint-disable @typescript-eslint/no-unused-vars */
        props = { ...defaultProps, ...props };

        // Metrics if streaming analytics is enabled
        if (props.config.ENABLE_STREAMING_ANALYTICS && props.streamingAnalyticsConstruct) {
            // Create the Kinesis Analytics Log Group
            const analyticsLogGroup = new logs.LogGroup(this, "KinesisAnalyticsLogGroup", {
                logGroupName: `/aws/lambda/${props.streamingAnalyticsConstruct.analyticsProcessingFunction.functionName}`,
                retention: props.config.CLOUDWATCH_RETENTION_DAYS,
            });

            // Create the Kinesis Analytics Errors Metric Filter
            new logs.MetricFilter(this, "KinesisAnalyticsErrorsFilter", {
                filterPattern: logs.FilterPattern.numberValue("$.KinesisAnalyticsErrors", ">", 0),
                logGroup: analyticsLogGroup,
                metricName: "KinesisAnalyticsErrors",
                metricValue: "$.KinesisAnalyticsErrors",
                metricNamespace: `${cdk.Aws.STACK_NAME}/AWSGameAnalytics`,
            });

            const metric = new cloudwatch.MathExpression({
                expression: "m1",
                usingMetrics: {
                    m1: new cloudwatch.Metric({
                        metricName: "KinesisAnalyticsErrors",
                        namespace: `${props.stackName}/AWSGameAnalytics`,
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.SUM,
                    }),
                },
                label: "Kinesis Analytics Errors",
            });

            const kinesisAnalyticsErrorsAlarm = new cloudwatch.Alarm(
                this,
                "KinesisAnalyticsErrorsAlarm",
                {
                    metric,
                    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    threshold: 0,
                    evaluationPeriods: 1,
                    datapointsToAlarm: 1,
                    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                    alarmDescription: `Kinesis Analytics Errors is > 0, as logged by the Analytics Processing function. Stack ${props.stackName}`,
                }
            );

            kinesisAnalyticsErrorsAlarm.addAlarmAction(
                new cloudwatchActions.SnsAction(props.notificationsTopic)
            );

            const streamingAnalyticsLambdaErrorsAlarm = new cloudwatch.Alarm(
                this,
                "StreamingAnalyticsLambdaErrorsAlarm",
                {
                    alarmName: `StreamingAnalyticsLambdaErrorsAlarm (${cdk.Aws.STACK_NAME})`,
                    alarmDescription: `Lambda Errors > 0, for stack ${cdk.Aws.STACK_NAME} streaming analytics`,
                    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    evaluationPeriods: 6,
                    datapointsToAlarm: 1,
                    threshold: 0,
                    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                    actionsEnabled: true,
                    metric: new cloudwatch.MathExpression({
                        expression: "m1",
                        usingMetrics: {
                            m1: this.createLambdaMetric(
                                props.streamingAnalyticsConstruct?.analyticsProcessingFunction,
                                "Errors"
                            ),
                        },
                    }),
                }
            );
            streamingAnalyticsLambdaErrorsAlarm.addAlarmAction(
                new cloudwatchActions.SnsAction(props.notificationsTopic)
            );

            const streamingAnalyticsLambdaThrottlesAlarm = new cloudwatch.Alarm(
                this,
                "StreamingAnalyticsLambdaThrottlesAlarm",
                {
                    alarmName: `StreamingAnalyticsLambdaThrottlesAlarm (${cdk.Aws.STACK_NAME})`,
                    actionsEnabled: true,
                    alarmDescription: `Lambda Throttles > 0, for stack ${cdk.Aws.STACK_NAME} streaming analytics`,
                    comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                    datapointsToAlarm: 1,
                    evaluationPeriods: 2,
                    threshold: 0,
                    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                    metric: new cloudwatch.MathExpression({
                        expression: "m1",
                        usingMetrics: {
                            m1: this.createLambdaMetric(
                                props.streamingAnalyticsConstruct?.analyticsProcessingFunction,
                                "Throttles"
                            ),
                        },
                        period: cdk.Duration.seconds(300),
                    }),
                }
            );
            streamingAnalyticsLambdaThrottlesAlarm.addAlarmAction(
                new cloudwatchActions.SnsAction(props.notificationsTopic)
            );
        }

        // Table metrics
        const dynamoDBErrorsAlarm = new cloudwatch.Alarm(this, "DynamoDBErrorsAlarm", {
            alarmName: `DynamoDBErrorsAlarm (${cdk.Aws.STACK_NAME})`,
            alarmDescription: `DynamoDB Errors > 0, for stack ${cdk.Aws.STACK_NAME}`,
            metric: this.generateTableMathExpression(props.tables),
            evaluationPeriods: 6,
            threshold: 0,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            datapointsToAlarm: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });

        dynamoDBErrorsAlarm.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        // Create GSI Read Alarms for tables
        props.tables.forEach((table, i) => {
            const expression = new cloudwatch.MathExpression({
                expression: "((m1 / 300) / m2) * 100",
                usingMetrics: {
                    m1: this.createSimpleTableMetric(
                        table,
                        "ConsumedReadCapacityUnits",
                        cloudwatch.Stats.SAMPLE_COUNT,
                        cloudwatch.Unit.COUNT
                    ),

                    m2: new cloudwatch.Metric({
                        namespace: "AWS/DynamoDB",
                        metricName: "AccountMaxTableLevelReads",
                        period: cdk.Duration.minutes(5),
                        statistic: cloudwatch.Stats.MAXIMUM,
                    }),
                },
                label: "TableReadsOverMaxReadLimit",
            });

            const alarm = new cloudwatch.Alarm(this, `OnDemandTableReadLimitAlarm${i}`, {
                alarmDescription: `Alarm when consumed table reads approach the account limit for ${table.tableName}, for stack ${cdk.Aws.STACK_NAME}`,
                alarmName: `${table.tableName}OnDemandTableReadLimitAlarm`,
                metric: expression,
                evaluationPeriods: 2,
                threshold: 90,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            });
            alarm.addAlarmAction(new cloudwatchActions.SnsAction(props.notificationsTopic));
        });

        // API Gateway error metrics
        const apiGateway4XXErrorsExpression = new cloudwatch.MathExpression({
            expression: "m1/m2*100",
            usingMetrics: {
                m1: this.apiGatewayMetric(props.gamesApiConstruct.gameAnalyticsApi, "4XXError"),
                m2: this.apiGatewayMetric(props.gamesApiConstruct.gameAnalyticsApi, "Count"),
            },
        });
        const apiGateway4XXErrorsAlarm = new cloudwatch.Alarm(this, "ApiGateway4XXErrorsAlarm", {
            metric: apiGateway4XXErrorsExpression,
            threshold: 1,
            evaluationPeriods: 6,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            datapointsToAlarm: 1,
            alarmDescription: `API Gateway 4XX Errors > 1%, for stack ${cdk.Aws.STACK_NAME}`,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            alarmName: `ApiGateway4XXErrorsAlarm-${cdk.Aws.STACK_NAME}`,
            actionsEnabled: true,
        });
        apiGateway4XXErrorsAlarm.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        const apiGateway5XXErrorsExpression = new cloudwatch.MathExpression({
            expression: "m1/m2*100",
            label: "5XX Error Rate",
            usingMetrics: {
                m1: this.apiGatewayMetric(props.gamesApiConstruct.gameAnalyticsApi, "5XXError"),
                m2: this.apiGatewayMetric(props.gamesApiConstruct.gameAnalyticsApi, "Count"),
            },
            period: cdk.Duration.minutes(5),
        });
        const apiGateway5XXErrorsAlarm = new cloudwatch.Alarm(this, "ApiGateway5XXErrorsAlarm", {
            alarmDescription: `API Gateway 5XX Errors > 1%, for stack ${cdk.Aws.STACK_NAME}`,
            threshold: 1,
            evaluationPeriods: 6,
            datapointsToAlarm: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            metric: apiGateway5XXErrorsExpression,
        });
        apiGateway5XXErrorsAlarm.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        // Firehose data metrics
        const kinesisFirehoseFailedConversions = new cloudwatch.Alarm(
            this,
            "KinesisFirehoseFailedConversions",
            {
                alarmDescription: `Alarm to track when Firehose Format Conversion fails, for stack ${cdk.Aws.STACK_NAME}`,
                metric: new cloudwatch.Metric({
                    metricName: "FailedConversion.Records",
                    namespace: "AWS/Firehose",
                    dimensionsMap: {
                        DeliveryStreamName:
                            props.streamingIngestionConstruct.gameEventsFirehose.ref,
                    },
                    statistic: cloudwatch.Stats.SUM,
                    period: cdk.Duration.minutes(1),
                }),
                evaluationPeriods: 1,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                threshold: 0,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                actionsEnabled: true,
            }
        );
        kinesisFirehoseFailedConversions.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        const kinesisFirehoseS3DataFreshness = new cloudwatch.Alarm(
            this,
            "KinesisFirehoseS3DataFreshness",
            {
                alarmDescription: `Alarm to track when age of oldest record delivered to S3 exceeds 15 minutes for two consecutive periods, for stack ${cdk.Aws.STACK_NAME}`,
                metric: new cloudwatch.Metric({
                    metricName: "DeliveryToS3.DataFreshness",
                    namespace: "AWS/Firehose",
                    dimensionsMap: {
                        DeliveryStreamName:
                            props.streamingIngestionConstruct.gameEventsFirehose.ref,
                    },
                    statistic: "Average",
                    period: cdk.Duration.minutes(5),
                }),
                evaluationPeriods: 2,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                threshold: 900,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                actionsEnabled: true,
            }
        );
        kinesisFirehoseS3DataFreshness.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        // Kinesis game stream throughput metrics
        const kinesisReadProvisionedThroughputExceeded = new cloudwatch.Alarm(
            this,
            "KinesisReadProvisionedThroughputExceeded",
            {
                alarmDescription: `Kinesis stream is being throttled on reads and may need to be be scaled to support more read throughput, for stack ${cdk.Aws.STACK_NAME}`,
                metric: new cloudwatch.Metric({
                    metricName: "ReadProvisionedThroughputExceeded",
                    dimensionsMap: {
                        StreamName: props.gameEventsStream.streamName,
                    },
                    namespace: "AWS/Kinesis",
                    statistic: cloudwatch.Stats.MAXIMUM,
                    period: cdk.Duration.minutes(1),
                }),
                evaluationPeriods: 1,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                threshold: 0,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                actionsEnabled: true,
            }
        );
        kinesisReadProvisionedThroughputExceeded.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        const kinesisWriteProvisionedThroughputExceeded = new cloudwatch.Alarm(
            this,
            "KinesisWriteProvisionedThroughputExceeded",
            {
                alarmDescription: `Kinesis stream is being throttled on writes and may need to be be scaled to support more write throughput, for stack ${cdk.Aws.STACK_NAME}`,
                metric: new cloudwatch.Metric({
                    namespace: "AWS/Kinesis",
                    metricName: "WriteProvisionedThroughputExceeded",
                    dimensionsMap: {
                        StreamName: props.gameEventsStream.streamName,
                    },
                    statistic: "Maximum",
                    period: cdk.Duration.seconds(60),
                }),
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
                evaluationPeriods: 1,
                threshold: 0,
                comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
                actionsEnabled: true,
            }
        );
        kinesisWriteProvisionedThroughputExceeded.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );

        // Function metrics
        const lambdaErrorsAlarm = new cloudwatch.Alarm(this, "LambdaErrorsAlarm", {
            alarmName: `Lambda Errors-${cdk.Aws.STACK_NAME}`,
            alarmDescription: `Lambda Errors > 0, for stack ${cdk.Aws.STACK_NAME}`,
            metric: this.generateLambdaMathExpression(props.functions, "Errors"),
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            threshold: 0,
            evaluationPeriods: 6,
            datapointsToAlarm: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        });
        lambdaErrorsAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.notificationsTopic));

        const lambdaThrottlesAlarm = new cloudwatch.Alarm(this, "LambdaThrottlesAlarm", {
            alarmName: `Lambda Throttles > 0 (${cdk.Aws.STACK_NAME})`,
            alarmDescription: `Lambda Throttles > 0, for stack ${cdk.Aws.STACK_NAME}`,
            threshold: 0,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
            evaluationPeriods: 2,
            datapointsToAlarm: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            metric: this.generateLambdaMathExpression(props.functions, "Throttles"),
        });
        lambdaThrottlesAlarm.addAlarmAction(
            new cloudwatchActions.SnsAction(props.notificationsTopic)
        );
    }

    // Creates simple table metric, defaults to SUM
    private createSimpleTableMetric(
        table: cdk.aws_dynamodb.Table,
        metricName: string,
        statistic: cloudwatch.Stats = cloudwatch.Stats.SUM,
        unit?: cloudwatch.Unit
    ): cloudwatch.Metric {
        return table.metric(metricName, {
            period: cdk.Duration.minutes(5),
            statistic: statistic as string,
            unit: unit,
        });
    }

    // Creates API metric given name and statistic, defaults to SUM
    private apiGatewayMetric(
        api: cdk.aws_apigateway.IRestApi,
        metricName: string,
        statistic: string = cloudwatch.Stats.SUM
    ): cloudwatch.Metric {
        return new cloudwatch.Metric({
            metricName: metricName,
            namespace: "AWS/ApiGateway",
            dimensionsMap: {
                ApiName: api.restApiName,
            },
            statistic: statistic,
            period: cdk.Duration.minutes(5),
        });
    }

    // Creates basic lambda metric given name and function
    private createLambdaMetric(
        lambdaFunction: lambda.Function,
        metricName: string
    ): cloudwatch.Metric {
        return lambdaFunction.metric(metricName, {
            period: cdk.Duration.minutes(5),
            statistic: cloudwatch.Stats.SUM,
        });
    }

    // Creates a cloudwatch math expression that aggregates metrics for multiple lambdas and adds them together
    private generateLambdaMathExpression(
        functions: lambda.Function[],
        metric: string
    ): cloudwatch.MathExpression {
        const metricNames = Array.from(Array(functions.length)).map((_, i) => `m${i + 1}`);

        return new cloudwatch.MathExpression({
            expression: metricNames.join(" + "),
            usingMetrics: metricNames.reduce(
                (o, metricName, i) => ({
                    ...o,
                    [metricName]: this.createLambdaMetric(functions[i], metric),
                }),
                {}
            ),
        });
    }

    // Generate Dynamo Math Expression for Errors
    private generateTableMathExpression(
        tables: cdk.aws_dynamodb.Table[]
    ): cloudwatch.MathExpression {
        const metricNames = Array.from(Array(tables.length * 2)).map((_, i) => `m${i + 1}`);

        return new cloudwatch.MathExpression({
            expression: metricNames.join(" + "),
            usingMetrics: tables.reduce(
                (o, table, i) => ({
                    ...o,
                    [metricNames[i * 2]]: this.createSimpleTableMetric(table, "UserErrors"),
                    [metricNames[i * 2 + 1]]: this.createSimpleTableMetric(table, "SystemErrors"),
                }),
                {}
            ),
        });
    }
}
