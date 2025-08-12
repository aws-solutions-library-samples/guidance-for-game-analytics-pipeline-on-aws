import { Construct } from "constructs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cdk from "aws-cdk-lib";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as kinesisFirehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { ManagedFlinkConstruct } from "./flink-construct";
import { RedshiftConstruct } from "./redshift-construct";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { OpenSearchConstruct } from "./opensearch-construct";

export interface CloudWatchDashboardConstructProps extends cdk.StackProps {
  gameEventsStream: kinesis.Stream | undefined;
  managedFlinkConstruct: ManagedFlinkConstruct | undefined;
  gameEventsFirehose: kinesisFirehose.CfnDeliveryStream | undefined;
  gameAnalyticsApi: apigateway.IRestApi;
  eventsProcessingFunction: lambda.Function;
  redshiftConstruct: RedshiftConstruct | undefined;
  opensearchConstruct: OpenSearchConstruct | undefined;
  config: GameAnalyticsPipelineConfig;
}
const defaultProps: Partial<CloudWatchDashboardConstructProps> = {};

export class CloudWatchDashboardConstruct extends Construct {
  constructor(
    parent: Construct,
    name: string,
    props: CloudWatchDashboardConstructProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // Title widget
    const titleWidget = new cloudwatch.TextWidget({
      markdown:
        "\n# **Game Analytics Pipeline - Operational Health**\nThis dashboard contains operational metrics for the Game Analytics Pipeline. Use these metrics to help you monitor the operational status of the AWS services used in the solution and track important application metrics.\n",
      width: 24,
      height: 2,
    });

    // API Widget
    const apiIngestionWidget = new cloudwatch.GraphWidget({
      title: "Events Ingestion and Delivery",
      left: [
        new cloudwatch.Metric({
          metricName: "Count",
          namespace: "AWS/ApiGateway",
          dimensionsMap: {
            ApiName: props.gameAnalyticsApi.restApiName,
            Resource: "/applications/{applicationId}/events",
            Stage: props.gameAnalyticsApi.deploymentStage.stageName,
            Method: "POST",
          },
        }).with({
          label: "Events REST API Request Count",
          color: "#1f77b4",
        }),
      ],
      width: 24,
      height: 6,
      region: cdk.Stack.of(this).region,
      period: cdk.Duration.seconds(60),
      statistic: "Sum",
    });

    // KDS Widgets (If KDS Ingest Mode is enabled)
    let kdsWidgets: cloudwatch.IWidget[] = [];

    if (
      props.config.INGEST_MODE === "KINESIS_DATA_STREAMS" &&
      props.gameEventsStream != undefined
    ) {
      kdsWidgets = [
        new cloudwatch.TextWidget({
          markdown:
            "\n## Kinesis Data Stream Ingestion \nThis section covers metrics related to ingestion of data into the solution's Events Stream and processing by Kinesis Data Streams. Use the metrics here to track data freshness/latency.\n",
          width: 24,
          height: 2,
        }),
        new cloudwatch.GraphWidget({
          title: "Events Ingestion and Delivery",
          left: [
            new cloudwatch.Metric({
              metricName: "IncomingRecords",
              namespace: "AWS/Kinesis",
              dimensionsMap: {
                StreamName: props.gameEventsStream.streamName,
              },
            }).with({
              label: "Events Stream Incoming Records (Kinesis)",
              color: "#2ca02c",
            }),
          ],
          width: 12,
          height: 6,
          region: cdk.Stack.of(this).region,
          period: cdk.Duration.seconds(60),
          statistic: "Sum",
        }),
        new cloudwatch.GraphWidget({
          title: "Events Stream Latency",
          left: [
            new cloudwatch.Metric({
              metricName: "PutRecord.Latency",
              namespace: "AWS/Kinesis",
              dimensionsMap: {
                StreamName: props.gameEventsStream.streamName,
              },
            }).with({
              label: "PutRecord Write Latency",
            }),
            new cloudwatch.Metric({
              metricName: "PutRecords.Latency",
              namespace: "AWS/Kinesis",
              dimensionsMap: {
                StreamName: props.gameEventsStream.streamName,
              },
            }).with({
              label: "PutRecords Write Latency",
            }),
            new cloudwatch.Metric({
              metricName: "GetRecords.Latency",
              namespace: "AWS/Kinesis",
              dimensionsMap: {
                StreamName: props.gameEventsStream.streamName,
              },
            }).with({
              label: "Read Latency",
            }),
          ],

          right: [
            new cloudwatch.Metric({
              metricName: "GetRecords.IteratorAgeMilliseconds",
              namespace: "AWS/Kinesis",
              dimensionsMap: {
                StreamName: props.gameEventsStream.streamName,
              },
            }).with({
              label: "Consumer Iterator Age",
              statistic: "Maximum",
              period: cdk.Duration.seconds(60),
            }),
          ],

          leftYAxis: {
            showUnits: false,
            label: "Milliseconds",
          },
          width: 12,
          height: 6,
          region: cdk.Stack.of(this).region,
          period: cdk.Duration.seconds(60),
          statistic: "Average",
        }),
      ];
    }

    // Redshift Widgets (If Redshift Mode is enabled)
    let redshiftWidgets: cloudwatch.IWidget[] = [];
    if (
      props.config.DATA_STACK === "REDSHIFT" &&
      props.redshiftConstruct != undefined
    ) {
      const dbName = props.config.EVENTS_DATABASE;
      const workgroupName = props.redshiftConstruct.workgroup.workgroupName;
      const namespaceName = props.redshiftConstruct.namespace.namespaceName;
      redshiftWidgets = [
        new cloudwatch.TextWidget({
          markdown:
            "\n## Redshift Serverless\nThis section covers metrics related to Redshift Serverless. Use the metrics here to track infrastructure and query performance.\n",
          width: 24,
          height: 2,
        }),
        new cloudwatch.GraphWidget({
          title: "Queries Completed Per Second",
          width: 12,
          height: 6,
          left: [
            new cloudwatch.Metric({
              namespace: "AWS/Redshift-Serverless",
              metricName: "QueriesCompletedPerSecond",
              dimensionsMap: {
                DatabaseName: dbName,
                Workgroup: workgroupName,
                LatencyRange: "Short",
              },
              region: cdk.Stack.of(this).region,
            }),
          ],
          view: cloudwatch.GraphWidgetView.TIME_SERIES,
          stacked: false,
        }),
        new cloudwatch.GraphWidget({
          title: "Database Connections",
          width: 12,
          height: 6,
          left: [
            new cloudwatch.Metric({
              namespace: "AWS/Redshift-Serverless",
              metricName: "DatabaseConnections",
              dimensionsMap: {
                DatabaseName: dbName,
                Workgroup: workgroupName,
              },
              region: cdk.Stack.of(this).region,
            }),
          ],
          view: cloudwatch.GraphWidgetView.TIME_SERIES,
          stacked: false,
        }),
        new cloudwatch.GraphWidget({
          title: "Query Planning / Execution",
          width: 12,
          height: 6,
          left: [
            new cloudwatch.Metric({
              namespace: "AWS/Redshift-Serverless",
              metricName: "QueryRuntimeBreakdown",
              dimensionsMap: {
                stage: "QueryPlanning",
                DatabaseName: dbName,
                Workgroup: workgroupName,
              },
              region: cdk.Stack.of(this).region,
            }),
            new cloudwatch.Metric({
              namespace: "AWS/Redshift-Serverless",
              metricName: "QueryRuntimeBreakdown",
              dimensionsMap: {
                stage: "QueryExecutingRead",
                DatabaseName: dbName,
                Workgroup: workgroupName,
              },
              region: cdk.Stack.of(this).region,
            }),
          ],
          view: cloudwatch.GraphWidgetView.TIME_SERIES,
          stacked: false,
        }),
        new cloudwatch.SingleValueWidget({
          title: "Data Storage",
          width: 12,
          height: 6,
          metrics: [
            new cloudwatch.Metric({
              namespace: "AWS/Redshift-Serverless",
              metricName: "DataStorage",
              dimensionsMap: {
                Namespace: namespaceName,
              },
              region: cdk.Stack.of(this).region,
            }),
          ],
          sparkline: true,
        }),
      ];
    }

    // Data Lake Mode Widgets (If Data Lake Mode is enabled)
    let dataLakeWidgets: cloudwatch.IWidget[] = [];
    if (
      props.config.DATA_STACK === "DATA_LAKE" &&
      props.gameEventsFirehose != undefined
    ) {
      dataLakeWidgets = [
        new cloudwatch.TextWidget({
          markdown:
            "\n## Stream Ingestion & Processing\nThis section covers metrics related to ingestion of data into the solution's Events Stream and processing by Kinesis Data Firehose and AWS Lambda Events Processing Function. Use the metrics here to track data freshness/latency and any issues with processor throttling/errors.\n",
          width: 24,
          height: 2,
        }),
        new cloudwatch.SingleValueWidget({
          title: "Events Processing Health",
          metrics: [
            new cloudwatch.Metric({
              metricName: "DeliveryToS3.DataFreshness",
              namespace: "AWS/Firehose",
              dimensionsMap: {
                DeliveryStreamName: props.gameEventsFirehose.ref,
              },
            }).with({
              label: "Data Freshness",
              period: cdk.Duration.seconds(300),
              statistic: "Maximum",
            }),
            new cloudwatch.Metric({
              metricName: "DeliveryToS3.Records",
              namespace: "AWS/Firehose",
              dimensionsMap: {
                DeliveryStreamName: props.gameEventsFirehose.ref,
              },
            }).with({
              label: "Firehose Records Delivered to S3",
              color: "#17becf",
            }),
            new cloudwatch.Metric({
              metricName: "Duration",
              namespace: "AWS/Lambda",
              dimensionsMap: {
                FunctionName: props.eventsProcessingFunction.functionName,
              },
            }).with({
              label: "Lambda Duration",
              period: cdk.Duration.seconds(300),
              statistic: "Average",
            }),
            new cloudwatch.Metric({
              metricName: "ConcurrentExecutions",
              namespace: "AWS/Lambda",
              dimensionsMap: {
                FunctionName: props.eventsProcessingFunction.functionName,
              },
            }).with({
              label: "Lambda Concurrency",
              period: cdk.Duration.seconds(300),
              statistic: "Maximum",
            }),
            new cloudwatch.Metric({
              metricName: "Throttles",
              namespace: "AWS/Lambda",
              dimensionsMap: {
                FunctionName: props.eventsProcessingFunction.functionName,
              },
            }).with({
              label: "Lambda Throttles",
              period: cdk.Duration.seconds(300),
              statistic: "Sum",
            }),
          ],
          width: 24,
          height: 3,
          region: cdk.Stack.of(this).region,
        }),
        new cloudwatch.GraphWidget({
          title: "Event Transformation Lambda Error count and success rate (%)",
          left: [
            new cloudwatch.Metric({
              metricName: "Errors",
              namespace: "AWS/Lambda",
              dimensionsMap: {
                FunctionName: props.eventsProcessingFunction.functionName,
              },
            }).with({
              label: "Errors",
              color: "#D13212",
            }),
            new cloudwatch.Metric({
              metricName: "Invocations",
              namespace: "AWS/Lambda",
              dimensionsMap: {
                FunctionName: props.eventsProcessingFunction.functionName,
              },
            }).with({
              label: "Invocations",
            }),
          ],
          right: [
            new cloudwatch.MathExpression({
              expression:
                "100 - 100 * metricErrors / MAX([metricErrors, metricInvocations])",
              label: "Success rate (%)",
              usingMetrics: {
                metricErrors: new cloudwatch.Metric({
                  metricName: "Errors",
                  namespace: "AWS/Lambda",
                  dimensionsMap: {
                    FunctionName: props.eventsProcessingFunction.functionName,
                    Resource: props.eventsProcessingFunction.functionArn,
                  },
                  statistic: "Sum",
                }),
                metricInvocations: new cloudwatch.Metric({
                  metricName: "Invocations",
                  namespace: "AWS/Lambda",
                  dimensionsMap: {
                    FunctionName: props.eventsProcessingFunction.functionName,
                  },
                  statistic: "Sum",
                }),
              },
            }),
          ],
          width: 24,
          height: 6,
          region: cdk.Stack.of(this).region,
          period: cdk.Duration.seconds(60),
          statistic: "Sum",
          rightYAxis: {
            max: 100,
            label: "Percent",
            showUnits: false,
          },
          leftYAxis: {
            showUnits: false,
            label: "",
          },
        }),
      ];
    }

    // Real time Widgets (If Real Time is enabled)
    let realTimeWidgets: cloudwatch.IWidget[][] = [];
    if (
      props.config.REAL_TIME_ANALYTICS === true &&
      props.managedFlinkConstruct != undefined &&
      props.opensearchConstruct != undefined
    ) {
      realTimeWidgets = [
        [
          new cloudwatch.TextWidget({
            markdown:
              "\n## Real-time Streaming Analytics\nThe below metrics can be used to monitor the real-time streaming SQL analytics of events. Use the Kinesis Data Analytics MillisBehindLatest metric to help you track the lag on the Kinesis SQL Application from the latest events. The Analytics Processing function that processes KDA application outputs can be tracked to measure function concurrency, success percentage, processing duration and throttles.\n",
            width: 24,
            height: 2,
          }),
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Managed Flink Records Intake",
            left: [
              new cloudwatch.MathExpression({
                expression: "recInPerSec * 60 / 4",
                label: "Number of Records Recieved",
                usingMetrics: {
                  recInPerSec: new cloudwatch.Metric({
                    metricName: "numRecordsInPerSecond",
                    namespace: "AWS/KinesisAnalytics",
                    dimensionsMap: {
                      Application:
                        props.managedFlinkConstruct.managedFlinkApp.ref,
                    },
                  }).with({
                    region: cdk.Stack.of(this).region,
                    statistic: "Sum",
                    period: cdk.Duration.minutes(1),
                  }),
                },
              }),
              new cloudwatch.MathExpression({
                expression: "recDroppedPerMin / 4",
                label: "Number of Late Records Dropped",
                usingMetrics: {
                  recDroppedPerMin: new cloudwatch.Metric({
                    metricName: "numLateRecordsDropped",
                    namespace: "AWS/KinesisAnalytics",
                    dimensionsMap: {
                      Application:
                        props.managedFlinkConstruct.managedFlinkApp.ref,
                    },
                  }).with({
                    region: cdk.Stack.of(this).region,
                    statistic: "Sum",
                    period: cdk.Duration.minutes(1),
                  }),
                },
              }),
            ],
            leftYAxis: {
              showUnits: false,
              label: "Count",
            },
            width: 12,
            height: 6,
            period: cdk.Duration.seconds(60),
          }),
          new cloudwatch.GraphWidget({
            title: "Managed Flink Container CPU Utilization",
            left: [
              new cloudwatch.Metric({
                metricName: "containerCPUUtilization",
                namespace: "AWS/KinesisAnalytics",
                dimensionsMap: {
                  Application: props.managedFlinkConstruct.managedFlinkApp.ref,
                },
              }),
            ],
            leftAnnotations: [
              {
                value: 75,
                label: "Scale Up Threshold",
                color: cloudwatch.Color.RED,
              },
              {
                value: 10,
                label: "Scale Down Threshold",
                color: cloudwatch.Color.GREEN,
              },
            ],
            leftYAxis: {
              min: 1,
              max: 100,
              label: "Percent",
              showUnits: false,
            },
            width: 12,
            height: 6,
            period: cdk.Duration.seconds(60),
          }),
          new cloudwatch.GraphWidget({
            title: "Managed Flink Container Resource Utilization",
            left: [
              new cloudwatch.Metric({
                metricName: "containerMemoryUtilization",
                namespace: "AWS/KinesisAnalytics",
                dimensionsMap: {
                  Application: props.managedFlinkConstruct.managedFlinkApp.ref,
                },
              }),
              new cloudwatch.Metric({
                metricName: "containerDiskUtilization",
                namespace: "AWS/KinesisAnalytics",
                dimensionsMap: {
                  Application: props.managedFlinkConstruct.managedFlinkApp.ref,
                },
              }),
            ],
            right: [
              new cloudwatch.Metric({
                metricName: "threadsCount",
                namespace: "AWS/KinesisAnalytics",
                dimensionsMap: {
                  Application: props.managedFlinkConstruct.managedFlinkApp.ref,
                },
              }),
            ],
            leftYAxis: {
              min: 1,
              max: 100,
              label: "Percent",
              showUnits: false,
            },

            width: 12,
            height: 6,
          }),

          new cloudwatch.GraphWidget({
            title: "OpenSearch Intake",
            left: [
              new cloudwatch.Metric({
                metricName: "IngestionDocumentRate",
                namespace: "AWS/AOSS",
                dimensionsMap: {
                  CollectionName: props.opensearchConstruct.osCollection.name,
                  CollectionId: props.opensearchConstruct.osCollection.attrId,
                  ClientId: cdk.Aws.ACCOUNT_ID
                },
              }).with({
                label: "Collection Ingested",
              }),
              new cloudwatch.Metric({
                metricName: `${props.opensearchConstruct.ingestionPipeline.pipelineName}.recordsProcessed.count`,
                namespace: "AWS/OSIS",
                dimensionsMap: {
                  PipelineName: props.opensearchConstruct.ingestionPipeline.pipelineName
                },
              }).with({
                label: "Pipeline Recieved",
              }),
              new cloudwatch.Metric({
                metricName: `${props.opensearchConstruct.ingestionPipeline.pipelineName}.opensearch.documentsSuccess.count`,
                namespace: "AWS/OSIS",
                dimensionsMap: {
                  PipelineName: props.opensearchConstruct.ingestionPipeline.pipelineName
                },
              }).with({
                label: "Pipeline Sent",
              }),
            ],
            right: [
              new cloudwatch.Metric({
                metricName: "IngestionDocumentErrors",
                namespace: "AWS/AOSS",
                dimensionsMap: {
                  CollectionName: props.opensearchConstruct.osCollection.name,
                  CollectionId: props.opensearchConstruct.osCollection.attrId,
                  ClientId: cdk.Aws.ACCOUNT_ID
                },
              }).with({
                label: "Collection Errors",
              }),
              new cloudwatch.Metric({
                metricName: `${props.opensearchConstruct.ingestionPipeline.pipelineName}.opensearch.documentErrors.count`,
                namespace: "AWS/OSIS",
                dimensionsMap: {
                  PipelineName: props.opensearchConstruct.ingestionPipeline.pipelineName
                },
              }).with({
                label: "Pipeline Errors",
              }),
            ],
            width: 12,
            height: 6,
            period: cdk.Duration.seconds(60),
            statistic: "Sum",
          })
        ],
        [
          new cloudwatch.GraphWidget({
            title: "Metrics Stream Latency",
            left: [
              new cloudwatch.Metric({
                metricName: "PutRecord.Latency",
                namespace: "AWS/Kinesis",
                dimensionsMap: {
                  StreamName:
                    props.managedFlinkConstruct.metricOutputStream.streamName,
                },
              }).with({
                label: "PutRecord Write Latency",
              }),
              new cloudwatch.Metric({
                metricName: "PutRecords.Latency",
                namespace: "AWS/Kinesis",
                dimensionsMap: {
                  StreamName:
                    props.managedFlinkConstruct.metricOutputStream.streamName,
                },
              }).with({
                label: "PutRecords Write Latency",
              }),
              new cloudwatch.Metric({
                metricName: "GetRecords.Latency",
                namespace: "AWS/Kinesis",
                dimensionsMap: {
                  StreamName:
                    props.managedFlinkConstruct.metricOutputStream.streamName,
                },
              }).with({
                label: "Read Latency",
              }),
            ],
            right: [
              new cloudwatch.Metric({
                metricName: "GetRecords.IteratorAgeMilliseconds",
                namespace: "AWS/Kinesis",
                dimensionsMap: {
                  StreamName:
                    props.managedFlinkConstruct.metricOutputStream.streamName,
                },
              }).with({
                label: "Consumer Iterator Age",
                statistic: "Maximum",
                period: cdk.Duration.seconds(60),
              }),
            ],
            leftYAxis: {
              showUnits: false,
              label: "Milliseconds",
            },
            width: 12,
            height: 6,
            region: cdk.Stack.of(this).region,
            period: cdk.Duration.seconds(60),
            statistic: "Average",
          }),
          new cloudwatch.GraphWidget({
            title: "OpenSearch Latency",
            left: [
              new cloudwatch.Metric({
                metricName: "IngestionRequestLatency",
                namespace: "AWS/AOSS",
                dimensionsMap: {
                  CollectionName: props.opensearchConstruct.osCollection.name,
                  CollectionId: props.opensearchConstruct.osCollection.attrId,
                  ClientId: cdk.Aws.ACCOUNT_ID
                },
              }).with({
                label: "Collection Ingestion Request Latency"
              }),
              new cloudwatch.Metric({
                metricName: `${props.opensearchConstruct.ingestionPipeline.pipelineName}.opensearch.EndToEndLatency.avg`,
                namespace: "AWS/OSIS",
                dimensionsMap: {
                  PipelineName: props.opensearchConstruct.ingestionPipeline.pipelineName
                },
              }).with({
                label: "Pipeline End-To-End Latency"
              })
            ],
            width: 12,
            height: 6,
            stacked: true,
            period: cdk.Duration.seconds(60),
            statistic: "Average",
          }),
        ],
      ];
    }

    // Conditionally build out the dashboard
    let widgets: cloudwatch.IWidget[][] = [];
    widgets.push([titleWidget], [apiIngestionWidget]);
    if (kdsWidgets.length > 0) {
      widgets.push(kdsWidgets);
    }
    if (redshiftWidgets.length > 0) {
      widgets.push(redshiftWidgets);
    }
    if (dataLakeWidgets.length > 0) {
      widgets.push(dataLakeWidgets);
    }
    if (realTimeWidgets.length > 0) {
      widgets = widgets.concat(realTimeWidgets);
    }

    const dashboard = new cloudwatch.Dashboard(this, "PipelineOpsDashboard", {
      dashboardName: `${props.config.WORKLOAD_NAME}_PipelineOpsDashboard`,
      widgets: widgets,
    });
  }
}
