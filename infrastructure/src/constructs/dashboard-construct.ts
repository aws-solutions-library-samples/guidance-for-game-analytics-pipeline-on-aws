import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cdk from "aws-cdk-lib";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as kinesisanalytics from "aws-cdk-lib/aws-kinesisanalytics";
import * as kinesisFirehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export interface CloudWatchDashboardConstructProps extends cdk.StackProps {
    gameEventsStream: kinesis.Stream;
    gameEventsFirehose: kinesisFirehose.CfnDeliveryStream;
    gameAnalyticsApi: apigateway.IRestApi;
    eventsProcessingFunction: lambda.Function;
    analyticsProcessingFunction: lambda.Function | undefined;
    kinesisAnalyticsApp: kinesisanalytics.CfnApplicationV2 | undefined;
    streamingAnalyticsEnabled: boolean;
}
const defaultProps: Partial<CloudWatchDashboardConstructProps> = {};

export class CloudWatchDashboardConstruct extends Construct {
    constructor(parent: Construct, name: string, props: CloudWatchDashboardConstructProps) {
        super(parent, name);

        /* eslint-disable @typescript-eslint/no-unused-vars */
        props = { ...defaultProps, ...props };

        // Title widget
        const titleWidget = new cloudwatch.TextWidget({
            markdown: '\n# **Game Analytics Pipeline - Operational Health**\nThis dashboard contains operational metrics for the Game Analytics Pipeline. Use these metrics to help you monitor the operational status of the AWS services used in the solution and track important application metrics.\n',
            width: 24,
            height: 2,
        });

        // Stream Ingestion Widgets
        const streamIngestionTitleWidget = new cloudwatch.TextWidget({
            markdown: '\n## Stream Ingestion & Processing\nThis section covers metrics related to ingestion of data into the solution\'s Events Stream and processing by Kinesis Data Firehose and AWS Lambda Events Processing Function. Use the metrics here to track data freshness/latency and any issues with processor throttling/errors.\n',
            width: 24,
            height: 2,
        });
        const eventProcessingHealthWidget = new cloudwatch.SingleValueWidget({
            title: 'Events Processing Health',
            metrics: [
                new cloudwatch.Metric({
                    metricName: 'DeliveryToS3.DataFreshness',
                    namespace: 'AWS/Firehose',
                    dimensionsMap: {
                        DeliveryStreamName: props.gameEventsFirehose.ref,
                    },
                }).with({
                    label: 'Data Freshness',
                    period: cdk.Duration.seconds(300),
                    statistic: 'Maximum',
                }),
                new cloudwatch.Metric({
                    metricName: 'Duration',
                    namespace: 'AWS/Lambda',
                    dimensionsMap: {
                        FunctionName: props.eventsProcessingFunction.functionName,
                    },
                }).with({
                    label: 'Lambda Duration',
                    period: cdk.Duration.seconds(300),
                    statistic: 'Average',
                }),
                new cloudwatch.Metric({
                    metricName: 'ConcurrentExecutions',
                    namespace: 'AWS/Lambda',
                    dimensionsMap: {
                        FunctionName: props.eventsProcessingFunction.functionName,
                    },
                }).with({
                    label: 'Lambda Concurrency',
                    period: cdk.Duration.seconds(300),
                    statistic: 'Maximum',
                }),
                new cloudwatch.Metric({
                    metricName: 'Throttles',
                    namespace: 'AWS/Lambda',
                    dimensionsMap: {
                        FunctionName: props.eventsProcessingFunction.functionName,
                    },
                }).with({
                    label: 'Lambda Throttles',
                    period: cdk.Duration.seconds(300),
                    statistic: 'Sum',
                }),
            ],
            width: 12,
            height: 3,
            region: cdk.Stack.of(this).region,
        });
        const eventIngestionWidget = new cloudwatch.GraphWidget({
            title: 'Events Ingestion and Delivery',
            left: [
                new cloudwatch.Metric({
                    metricName: 'IncomingRecords',
                    namespace: 'AWS/Kinesis',
                    dimensionsMap: {
                        StreamName: props.gameEventsStream.streamName,
                    },
                }).with({
                    label: 'Events Stream Incoming Records (Kinesis)',
                    color: '#2ca02c',
                }),
                new cloudwatch.Metric({
                    metricName: 'DeliveryToS3.Records',
                    namespace: 'AWS/Firehose',
                    dimensionsMap: {
                        DeliveryStreamName: props.gameEventsFirehose.ref,
                    },
                }).with({
                    label: 'Firehose Records Delivered to S3',
                    color: '#17becf',
                }),
                new cloudwatch.Metric({
                    metricName: 'Count',
                    namespace: 'AWS/ApiGateway',
                    dimensionsMap: {
                        ApiName: props.gameAnalyticsApi.restApiName,
                        Resource: '/applications/{applicationId}/events',
                        Stage: props.gameAnalyticsApi.deploymentStage.stageName,
                        Method: 'POST',
                    },
                }).with({
                    label: 'Events REST API Request Count',
                    color: '#1f77b4',
                }),
            ],
            width: 8,
            height: 6,
            region: cdk.Stack.of(this).region,
            period: cdk.Duration.seconds(60),
            statistic: 'Sum',
        });
        const ingestionLambdaWidget = new cloudwatch.GraphWidget({
            title: 'Lambda Error count and success rate (%)',
            left: [
                new cloudwatch.Metric({
                    metricName: 'Errors',
                    namespace: 'AWS/Lambda',
                    dimensionsMap: {
                        FunctionName: props.eventsProcessingFunction.functionName,
                    },
                }).with({
                    label: 'Errors',
                    color: '#D13212',
                }),
                new cloudwatch.Metric({
                    metricName: 'Invocations',
                    namespace: 'AWS/Lambda',
                    dimensionsMap: {
                        FunctionName: props.eventsProcessingFunction.functionName,
                    },
                }).with({
                    label: 'Invocations',
                }),
            ],
            right: [
                new cloudwatch.MathExpression({
                    expression: '100 - 100 * metricErrors / MAX([metricErrors, metricInvocations])',
                    label: 'Success rate (%)',
                    usingMetrics: {
                        "metricErrors": new cloudwatch.Metric({
                            metricName: 'Errors',
                            namespace: 'AWS/Lambda',
                            dimensionsMap: {
                                FunctionName: props.eventsProcessingFunction.functionName,
                                Resource: props.eventsProcessingFunction.functionArn,
                            },
                            statistic: 'Sum',
                        }),
                        "metricInvocations": new cloudwatch.Metric({
                            metricName: 'Invocations',
                            namespace: 'AWS/Lambda',
                            dimensionsMap: {
                                FunctionName: props.eventsProcessingFunction.functionName,
                            },
                            statistic: 'Sum',
                        }),
                    },
                }),
            ],
            width: 8,
            height: 6,
            region: cdk.Stack.of(this).region,
            period: cdk.Duration.seconds(60),
            statistic: 'Sum',
            rightYAxis: {
                max: 100,
                label: 'Percent',
                showUnits: false,
            },
            leftYAxis: {
                showUnits: false,
                label: '',
            },
        })

        const streamLatencyWidget = new cloudwatch.GraphWidget({
            title: 'Events Stream Latency',
            left: [
                new cloudwatch.Metric({
                    metricName: 'PutRecords.Latency',
                    namespace: 'AWS/Kinesis',
                    dimensionsMap: {
                        StreamName: props.gameEventsStream.streamName,
                    },
                }),
                new cloudwatch.Metric({
                    metricName: 'GetRecords.Latency',
                    namespace: 'AWS/Kinesis',
                    dimensionsMap: {
                        StreamName: props.gameEventsStream.streamName,
                    },
                })
            ],
            width: 8,
            height: 6,
            region: cdk.Stack.of(this).region,
            period: cdk.Duration.seconds(60),
            statistic: 'Average',
        });

        // Real-time widgets
        const realTimeTitleWidget = new cloudwatch.TextWidget({
            markdown: '\n## Real-time Streaming Analytics\nThe below metrics can be used to monitor the real-time streaming SQL analytics of events. Use the Kinesis Data Analytics MillisBehindLatest metric to help you track the lag on the Kinesis SQL Application from the latest events. The Analytics Processing function that processes KDA application outputs can be tracked to measure function concurrency, success percentage, processing duration and throttles.\n',
            width: 24,
            height: 2,
        });

        // used to hold widget structure for dashboard
        let widgets;

        if (props.streamingAnalyticsEnabled && props.analyticsProcessingFunction != undefined && props.kinesisAnalyticsApp != undefined) {

            const realTimeHealthWidget = new cloudwatch.SingleValueWidget({
                title: 'Real-time Analytics Health',
                metrics: [
                    new cloudwatch.Metric({
                        metricName: 'ConcurrentExecutions',
                        namespace: 'AWS/Lambda',
                        dimensionsMap: {
                            FunctionName: props.analyticsProcessingFunction.functionName,
                        },
                    }).with({
                        label: 'Metrics Processing Lambda Concurrent Executions',
                        statistic: 'Maximum',
                    }),
                    new cloudwatch.Metric({
                        metricName: 'Duration',
                        namespace: 'AWS/Lambda',
                        dimensionsMap: {
                            FunctionName: props.analyticsProcessingFunction.functionName,
                        },
                    }).with({
                        label: 'Lambda Duration',
                        statistic: 'Average',
                    }),
                    new cloudwatch.Metric({
                        metricName: 'Throttles',
                        namespace: 'AWS/Lambda',
                        dimensionsMap: {
                            FunctionName: props.analyticsProcessingFunction.functionName,
                        },
                    }).with({
                        label: 'Lambda Throttles',
                    }),
                    // This metric receives one sample per billing period (one hour). To visualize the number of KPUs over time, use MAX or AVG over a period of at least one (1) hour.
                    new cloudwatch.Metric({
                        metricName: 'KPUs',
                        namespace: 'AWS/KinesisAnalytics',
                        period: cdk.Duration.hours(2),
                        dimensionsMap: {
                            Application: props.kinesisAnalyticsApp.ref,
                        },
                    }).with({
                        label: "Managed Flink KPUs",
                        statistic: 'Maximum',
                    }),
                ],
                width: 12,
                height: 3,
                region: cdk.Stack.of(this).region,
            });
            // REPLACE THIS WITH FLINK
            const realTimeLatencyWidget = new cloudwatch.GraphWidget({
                title: 'Managed Flink Number of Records In Per Minute',
                left: [
                    new cloudwatch.MathExpression({
                        expression: 'recInPerSec * 60 / 4',
                        label: 'numRecordsInPerMinute',
                        usingMetrics: {
                            "recInPerSec":
                                new cloudwatch.Metric({
                                    metricName: 'numRecordsInPerSecond',
                                    namespace: 'AWS/KinesisAnalytics',
                                    dimensionsMap: {
                                        Application: props.kinesisAnalyticsApp.ref,
                                    },
                                }).with({
                                    region: cdk.Stack.of(this).region,
                                    statistic: 'Sum',
                                }),
                        },
                    }),
                    new cloudwatch.MathExpression({
                        expression: 'recDroppedPerSec * 60 / 4',
                        label: 'numLateRecordsDroppedPerMinute',
                        usingMetrics: {
                            "recDroppedPerSec":
                                new cloudwatch.Metric({
                                    metricName: 'numLateRecordsDropped',
                                    namespace: 'AWS/KinesisAnalytics',
                                    dimensionsMap: {
                                        Application: props.kinesisAnalyticsApp.ref,
                                    },
                                }).with({
                                    region: cdk.Stack.of(this).region,
                                    statistic: 'Sum',
                                }),
                        },
                    }),
                ],
                width: 8,
                height: 6,
                period: cdk.Duration.seconds(60),
            });
            // REPLACE THIS WITH FLINK
            const flinkCPUUtilizationWidget = new cloudwatch.GraphWidget({
                title: 'Managed Flink Container CPU Utilization',
                left: [
                    new cloudwatch.Metric({
                        metricName: 'containerCPUUtilization',
                        namespace: 'AWS/KinesisAnalytics',
                        dimensionsMap: {
                            Application: props.kinesisAnalyticsApp.ref,
                        },
                    })

                ],
                leftAnnotations: [
                    {
                        value: 75,
                        label: "Scale Up Threshold",
                        color: "#FF0000"
                    },
                    {
                        value: 10,
                        label: "Scale Down Threshold",
                        color: "#00FF00"
                    }
                ],
                leftYAxis: {
                    min: 1,
                    max: 100,
                    label: 'Percent',
                    showUnits: false,
                },
                width: 8,
                height: 6,
                period: cdk.Duration.seconds(60),
            });
            const realTimeLambdaWidget = new cloudwatch.GraphWidget({
                title: 'Lambda Error count and success rate (%)',
                left: [
                    new cloudwatch.Metric({
                        metricName: 'Errors',
                        namespace: 'AWS/Lambda',
                        dimensionsMap: {
                            FunctionName: props.analyticsProcessingFunction.functionName,
                        },
                    }).with({
                        label: 'Errors',
                        color: '#D13212',
                    }),
                    new cloudwatch.Metric({
                        metricName: 'Invocations',
                        namespace: 'AWS/Lambda',
                        dimensionsMap: {
                            FunctionName: props.analyticsProcessingFunction.functionName,
                        },
                    }).with({
                        label: 'Invocations',
                    }),
                ],
                right: [
                    new cloudwatch.MathExpression({
                        expression: '100 - 100 * metricErrors / MAX([metricErrors, metricInvocations])',
                        label: 'Success rate (%)',
                        usingMetrics: {
                            "metricErrors": new cloudwatch.Metric({
                                metricName: 'Errors',
                                namespace: 'AWS/Lambda',
                                dimensionsMap: {
                                    FunctionName: props.analyticsProcessingFunction.functionName,
                                },
                                statistic: 'Sum',
                            }),
                            "metricInvocations": new cloudwatch.Metric({
                                metricName: 'Invocations',
                                namespace: 'AWS/Lambda',
                                dimensionsMap: {
                                    FunctionName: props.analyticsProcessingFunction.functionName,
                                },
                                statistic: 'Sum',
                            }),
                        },
                    }),
                ],
                width: 8,
                height: 6,
                region: cdk.Stack.of(this).region,
                period: cdk.Duration.seconds(60),
                statistic: 'Sum',
                rightYAxis: {
                    max: 100,
                    label: 'Percent',
                    showUnits: false,
                },
                leftYAxis: {
                    showUnits: false,
                    label: '',
                },
            })
            // create dashboard with analytics widgets
            widgets = [
                [titleWidget],
                [eventProcessingHealthWidget, realTimeHealthWidget],
                [streamIngestionTitleWidget],
                [eventIngestionWidget, ingestionLambdaWidget, streamLatencyWidget],
                [realTimeTitleWidget],
                [realTimeLatencyWidget, flinkCPUUtilizationWidget, realTimeLambdaWidget]
            ];

        } else {
            widgets = [
                [titleWidget],
                [eventProcessingHealthWidget],
                [streamIngestionTitleWidget],
                [eventIngestionWidget, ingestionLambdaWidget, streamLatencyWidget]
            ]
        }



        const dashboard = new cloudwatch.Dashboard(this, 'PipelineOpsDashboard', {
            dashboardName: `PipelineOpsDashboard_${cdk.Aws.STACK_NAME}`,
            widgets: widgets
        });
    }
}