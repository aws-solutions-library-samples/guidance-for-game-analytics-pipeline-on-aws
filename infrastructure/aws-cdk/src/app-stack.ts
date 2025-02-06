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
import { DataLakeConstruct } from "./constructs/data-lake-construct";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as athena from "aws-cdk-lib/aws-athena";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as s3deployment from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

import { GameAnalyticsPipelineConfig } from "./helpers/config-types";
import { StreamingIngestionConstruct } from "./constructs/streaming-ingestion-construct";
import { ApiConstruct } from "./constructs/api-construct";
import { StreamingAnalyticsConstruct } from "./constructs/streaming-analytics";
import { MetricsConstruct } from "./constructs/metrics-construct";
import { LambdaConstruct } from "./constructs/lambda-construct";

import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export interface InfrastructureStackProps extends cdk.StackProps {
  config: GameAnalyticsPipelineConfig;
}

export class InfrastructureStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);
    const codePath = "../../../business-logic";

    // ---- S3 Buckets ---- //

    // Used as log destination
    const solutionLogsBucket = new s3.Bucket(this, "SolutionLogsBucket", {
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      versioned: props.config.DEV_MODE ? false : true,
      removalPolicy: props.config.DEV_MODE
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props.config.DEV_MODE ? true : false,
      accessControl: s3.BucketAccessControl.LOG_DELIVERY_WRITE,
      encryption: s3.BucketEncryption.S3_MANAGED, // Defaults to AES256
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          id: "S3StandardInfrequentAccess",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // Core bucket for the solution, holds all pre and post processed analytics data, athena and glue are backed by this bucket as well
    const analyticsBucket = new s3.Bucket(this, "AnalyticsBucket", {
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: props.config.DEV_MODE
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props.config.DEV_MODE ? true : false,
      versioned: props.config.DEV_MODE ? false : true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsBucket: solutionLogsBucket,
      serverAccessLogsPrefix: "AnalyticsBucket/",
      lifecycleRules: [
        {
          id: "S3IntelligentTiering7DaysRaw",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
          prefix: props.config.RAW_EVENTS_PREFIX,
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
        },
        {
          id: "S3IntelligentTiering7DaysProcessed",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
          prefix: props.config.PROCESSED_EVENTS_PREFIX,
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
        },
        {
          id: "S3IntelligentTiering7DaysErrors",
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
          prefix: "firehose-errors/",
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(7),
            },
          ],
        },
      ],
    });

    /* The following resources copies the Glue ETL script to S3. */
    new s3deployment.BucketDeployment(this, "CopyGlueEtlScriptToS3", {
      sources: [
        s3deployment.Source.asset(
          path.join(__dirname, `${codePath}/data-lake/glue-scripts`)
        ),
      ],
      destinationBucket: analyticsBucket,
      destinationKeyPrefix: "glue-scripts",
    });

    // ---- Metrics & Alarms ---- //

    // Encryption keys
    const snsEncryptionKey = new kms.Key(this, "SnsEncryptionKey", {
      description: `KMS Key for encrypting SNS`,
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(7),
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: "Enable IAM User Permissions",
            principals: [new iam.AccountRootPrincipal()],
            actions: ["*"],
            resources: ["*"],
          }),
          new iam.PolicyStatement({
            sid: "Grant SMS permissions to CloudWatch to publish to an encrypted SNS topic",
            effect: iam.Effect.ALLOW,
            principals: [
              new iam.ServicePrincipal("cloudwatch.amazonaws.com"),
              new iam.ServicePrincipal("events.amazonaws.com"),
            ],
            actions: ["kms:Decrypt", "kms:GenerateDataKey*"],
            resources: ["*"],
          }),
        ],
      }),
    });

    const snsEncryptionKeyAlias = new kms.Alias(this, "SnsEncryptionKeyAlias", {
      aliasName: `alias/aws_game_analytics/${cdk.Aws.STACK_NAME}/SnsEncryptionKey`,
      targetKey: snsEncryptionKey,
    });

    // Notification topic for alarms
    const notificationsTopic = new sns.Topic(this, "Notifications", {
      displayName: `Notifications-${cdk.Aws.STACK_NAME}`,
      masterKey: snsEncryptionKeyAlias,
    });

    // Glue datalake and processing jobs
    const dataLakeConstruct = new DataLakeConstruct(this, "DataLakeConstruct", {
      notificationsTopic: notificationsTopic,
      config: props.config,
      analyticsBucket: analyticsBucket,
    });

    // ---- Kinesis ---- //

    // Input stream for applications
    const gameEventsStream = new kinesis.Stream(this, "GameEventStream",
      (props.config.STREAM_PROVISIONED === true) ? {
        shardCount: props.config.STREAM_SHARD_COUNT,
        streamMode: kinesis.StreamMode.PROVISIONED,
      } : {
        streamMode: kinesis.StreamMode.ON_DEMAND,
      });

    const functionsInfo = {
      gameEventsStream: 'game-events-stream',
      gameEventsFirehose: 'game-events-firehose',
      gameAnalyticsApi: {
        name: 'game-analytics-api',
        stage: 'prod',
      },
      eventsProcessingFunction: 'events-processing-function',
      eventsProcessingFunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:events-processing-function',
      analyticsProcessingFunction: 'analytics-processing-function',
      analyticsProcessingFunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:analytics-processing-function',
      kinesisAnalyticsApp: 'game-analytics-application',
      streamingAnalyticsEnabled: true,
    };    

    // Title widget
    const titleWidget = new cloudwatch.TextWidget({
      markdown: '\n# **Game Analytics Pipeline - Operational Health**\nThis dashboard contains operational metrics for the Game Analytics Pipeline. Use these metrics to help you monitor the operational status of the AWS services used in the solution and track important application metrics.\n',
      width: 24,
      height: 2,
    });

    // Stream Ingestion Widgets
    const streamIngestionTitleWidget = new cloudwatch.TextWidget({
      markdown: '\n## Stream Ingestion & Processing\nThis section covers metrics related to ingestion of data into the solution\'s Events Stream and processing by Kinesis Data Firehose and AWS Lambda Events Processing Function. Use the metrics here to track data freshness/latency and any issues with processor throttling/errors.\n',
      width: 12,
      height: 3,
    });
    const eventProcessingHealthWidget = new cloudwatch.SingleValueWidget({
      title: 'Events Processing Health',
      metrics: [
        new cloudwatch.Metric({
          metricName: 'DeliveryToS3.DataFreshness',
          namespace: 'AWS/Firehose',
          dimensionsMap: {
            DeliveryStreamName: functionsInfo.gameEventsFirehose,
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
            FunctionName: functionsInfo.eventsProcessingFunction,
            Resource: functionsInfo.eventsProcessingFunctionArn,
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
            FunctionName: functionsInfo.eventsProcessingFunction,
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
            FunctionName: functionsInfo.eventsProcessingFunction,
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
            StreamName: gameEventsStream.streamName,
          },
        }).with({
          label: 'Events Stream Incoming Records (Kinesis)',
          color: '#2ca02c',
        }),
        new cloudwatch.Metric({
          metricName: 'DeliveryToS3.Records',
          namespace: 'AWS/Firehose',
          dimensionsMap: {
            DeliveryStreamName: functionsInfo.gameEventsFirehose,
          },
        }).with({
          label: 'Firehose Records Delivered to S3',
          color: '#17becf',
        }),
        new cloudwatch.Metric({
          metricName: 'Count',
          namespace: 'AWS/ApiGateway',
          dimensionsMap: {
            ApiName: functionsInfo.gameAnalyticsApi.name,
            Resource: '/applications/{applicationId}/events',
            Stage: functionsInfo.gameAnalyticsApi.stage,
            Method: 'POST',
          },
        }).with({
          label: 'Events REST API Request Count',
          color: '#1f77b4',
        }),
      ],
      width: 6,
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
            FunctionName: functionsInfo.eventsProcessingFunction,
            Resource: functionsInfo.eventsProcessingFunctionArn,
          },
        }).with({
          label: 'Errors',
          color: '#D13212',
        }),
        new cloudwatch.Metric({
          metricName: 'Invocations',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.eventsProcessingFunction,
            Resource: functionsInfo.eventsProcessingFunctionArn,
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
                FunctionName: functionsInfo.eventsProcessingFunction,
                Resource: functionsInfo.eventsProcessingFunctionArn,
              },
              statistic: 'Sum',
            }),
            "metricInvocations": new cloudwatch.Metric({
              metricName: 'Invocations',
              namespace: 'AWS/Lambda',
              dimensionsMap: {
                FunctionName: functionsInfo.eventsProcessingFunction,
                Resource: functionsInfo.eventsProcessingFunctionArn,
              },
              statistic: 'Sum',
            }),
          },
        }),
      ],
      width: 6,
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

    // Real-time widgets
    const realTimeTitleWidget = new cloudwatch.TextWidget({
      markdown: '\n## Real-time Streaming Analytics\nThe below metrics can be used to monitor the real-time streaming SQL analytics of events. Use the Kinesis Data Analytics MillisBehindLatest metric to help you track the lag on the Kinesis SQL Application from the latest events. The Analytics Processing function that processes KDA application outputs can be tracked to measure function concurrency, success percentage, processing duration and throttles.\n',
      width: 12,
      height: 3,
    });
    const realTimeHealthWidget = new cloudwatch.SingleValueWidget({
      title: 'Real-time Analytics Health',
      metrics: [
        new cloudwatch.Metric({
          metricName: 'ConcurrentExecutions',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.analyticsProcessingFunction,
          },
        }).with({
          label: 'Analytics Processing Concurrent Executions',
          statistic: 'Maximum',
        }),
        new cloudwatch.Metric({
          metricName: 'Duration',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.analyticsProcessingFunction,
          },
        }).with({
          label: 'Lambda Duration',
          statistic: 'Average',
        }),
        new cloudwatch.Metric({
          metricName: 'Throttles',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.analyticsProcessingFunction,
          },
        }).with({
          label: 'Lambda Throttles',
        }),
      ],
      width: 12,
      height: 3,
      region: cdk.Stack.of(this).region,
    });
    // REPLACE THIS WITH FLINK
    const realTimeLatencyWidget = new cloudwatch.GraphWidget({
      title: 'Kinesis Analytics Latency',
      left: [
        new cloudwatch.Metric({
          metricName: 'MillisBehindLatest',
          namespace: 'AWS/KinesisAnalytics',
          dimensionsMap: {
            Id: '1.1',
            Application: functionsInfo.kinesisAnalyticsApp,
            Flow: 'Input',
          },
        }).with({
          region: cdk.Stack.of(this).region,
          statistic: 'Average',
        }),
      ],
      width: 6,
      height: 6,
      period: cdk.Duration.seconds(60),
    })
    const realTimeLambdaWidget = new cloudwatch.GraphWidget({
      title: 'Lambda Error count and success rate (%)',
      left: [
        new cloudwatch.Metric({
          metricName: 'Errors',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.analyticsProcessingFunction,
            Resource: functionsInfo.analyticsProcessingFunctionArn,
          },
        }).with({
          label: 'Errors',
          color: '#D13212',
        }),
        new cloudwatch.Metric({
          metricName: 'Invocations',
          namespace: 'AWS/Lambda',
          dimensionsMap: {
            FunctionName: functionsInfo.analyticsProcessingFunction,
            Resource: functionsInfo.analyticsProcessingFunctionArn,
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
                FunctionName: functionsInfo.analyticsProcessingFunction,
                Resource: functionsInfo.analyticsProcessingFunctionArn,
              },
              statistic: 'Sum',
            }),
            "metricInvocations": new cloudwatch.Metric({
              metricName: 'Invocations',
              namespace: 'AWS/Lambda',
              dimensionsMap: {
                FunctionName: functionsInfo.analyticsProcessingFunction,
                Resource: functionsInfo.analyticsProcessingFunctionArn,
              },
              statistic: 'Sum',
            }),
          },
        }),
      ],
      width: 6,
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

    const widgetsWithoutAnalytics = [
      [titleWidget],
      [streamIngestionTitleWidget],
      [eventProcessingHealthWidget],
      [eventIngestionWidget, ingestionLambdaWidget]
    ];
    
    const widgetsWithAnalytics = [
      [titleWidget],
      [streamIngestionTitleWidget, realTimeTitleWidget],
      [eventProcessingHealthWidget, realTimeHealthWidget],
      [eventIngestionWidget, ingestionLambdaWidget, realTimeLatencyWidget, realTimeLambdaWidget]
    ];

    const dashboard = new cloudwatch.Dashboard(this, 'PipelineOpsDashboard', {
      dashboardName: `PipelineOpsDashboard_${cdk.Aws.STACK_NAME}`,
      widgets: functionsInfo.streamingAnalyticsEnabled ? widgetsWithAnalytics : widgetsWithoutAnalytics
    });

    // ---- DynamoDB Tables ---- //

    // Table organizes and manages different applications
    const applicationsTable = new dynamodb.Table(this, "ApplicationsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "application_id",
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: props.config.DEV_MODE
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    // Managed authorizations for applications (Api keys, etc.)
    const authorizationsTable = new dynamodb.Table(
      this,
      "AuthorizationsTable",
      {
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        partitionKey: {
          name: "api_key_id",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "application_id",
          type: dynamodb.AttributeType.STRING,
        },
        pointInTimeRecovery: true,
        encryption: dynamodb.TableEncryption.AWS_MANAGED,
        removalPolicy: props.config.DEV_MODE
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
      }
    );

    // Add a Global Secondary index 'ApplicationAuthorizations' to the AuthorizationsTable
    authorizationsTable.addGlobalSecondaryIndex(
      {
        indexName: "ApplicationAuthorizations",
        partitionKey: {
          name: "application_id",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "api_key_id",
          type: dynamodb.AttributeType.STRING,
        },
        projectionType: dynamodb.ProjectionType.ALL,
      }
    );

    // Add a Global Secondary index 'ApiKeyValues' to the AuthorizationsTable
    authorizationsTable.addGlobalSecondaryIndex(
      {
        indexName: "ApiKeyValues",
        partitionKey: {
          name: "api_key_value",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "application_id",
          type: dynamodb.AttributeType.STRING,
        },
        projectionType: dynamodb.ProjectionType.INCLUDE,
        nonKeyAttributes: [
          "api_key_id",
          "enabled",
        ]
      }
    );

    // ---- Athena ---- //
    // Define the resources for the `GameAnalyticsWorkgroup` Athena workgroup
    const gameAnalyticsWorkgroup = new athena.CfnWorkGroup(
      this,
      "GameAnalyticsWorkgroup",
      {
        name: `GameAnalyticsWorkgroup-${cdk.Aws.STACK_NAME}`,
        description: "Default workgroup for the solution workload",
        recursiveDeleteOption: true, // delete the associated queries when stack is deleted
        state: "ENABLED",
        workGroupConfiguration: {
          publishCloudWatchMetricsEnabled: true,
          resultConfiguration: {
            encryptionConfiguration: {
              encryptionOption: "SSE_S3",
            },
            outputLocation: `s3://${analyticsBucket.bucketName}/athena_query_results/`,
          },
        },
      }
    );

    // ---- Functions ---- //

    // Create lambda functions
    const lambdaConstruct = new LambdaConstruct(this, "LambdaConstruct", {
      dataLakeConstruct,
      applicationsTable,
      authorizationsTable,
    });

    lambdaConstruct.eventsProcessingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DynamoDBAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:BatchGetItem",
          "dynamodb:GetItem",
          "dynamodb:GetRecords",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [applicationsTable.tableArn],
      })
    );
    lambdaConstruct.lambdaAuthorizer.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DynamoDBAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:BatchGetItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          applicationsTable.tableArn,
          authorizationsTable.tableArn,
          `${authorizationsTable.tableArn}/index/*`,
        ],
      })
    );
    authorizationsTable.grantReadWriteData(
      lambdaConstruct.applicationAdminServiceFunction
    );
    applicationsTable.grantReadWriteData(
      lambdaConstruct.applicationAdminServiceFunction
    );

    // Initialize variable, will be checked to see if set properly
    let streamingAnalyticsConstruct;

    // ---- Streaming Analytics ---- //
    // Create the following resources if and is `ENABLE_STREAMING_ANALYTICS` constant is `True`
    if (props.config.ENABLE_STREAMING_ANALYTICS) {
      // Enables KDA and all metrics surrounding it
      streamingAnalyticsConstruct = new StreamingAnalyticsConstruct(
        this,
        "StreamingAnalyticsConstruct",
        {
          gameEventsStream: gameEventsStream,
          baseCodePath: codePath,
        }
      );
    }

    // Creates firehose and logs related to ingestion
    const streamingIngestionConstruct = new StreamingIngestionConstruct(
      this,
      "StreamingIngestionConstruct",
      {
        applicationsTable: applicationsTable,
        gamesEventsStream: gameEventsStream,
        analyticsBucket: analyticsBucket,
        rawEventsTable: dataLakeConstruct.rawEventsTable,
        gameEventsDatabase: dataLakeConstruct.gameEventsDatabase,
        eventsProcessingFunction: lambdaConstruct.eventsProcessingFunction,
        config: props.config,
      }
    );

    // Create API for admin to manage applications
    const gamesApiConstruct = new ApiConstruct(this, "GamesApiConstruct", {
      lambdaAuthorizer: lambdaConstruct.lambdaAuthorizer,
      gameEventsStream: gameEventsStream,
      applicationAdminServiceFunction:
        lambdaConstruct.applicationAdminServiceFunction,
      config: props.config,
    });

    // ---- METRICS & ALARMS ---- /
    // Register email to topic if email address is provided
    if (props.config.EMAIL_ADDRESS) {
      notificationsTopic.addSubscription(
        new snsSubscriptions.EmailSubscription(props.config.EMAIL_ADDRESS)
      );
    }

    // Create an IAM policy for the SNS topic
    const notificationsTopicPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["sns:Publish"],
      principals: [
        new iam.ServicePrincipal("events.amazonaws.com"),
        new iam.ServicePrincipal("cloudwatch.amazonaws.com"),
      ],
      resources: ["*"],
    });

    new sns.TopicPolicy(this, "NotificationsTopicPolicy", {
      topics: [notificationsTopic],
      policyDocument: new iam.PolicyDocument({
        statements: [notificationsTopicPolicy],
      }),
    });

    // Create metrics for solution
    new MetricsConstruct(this, "Metrics Construct", {
      config: props.config,
      streamingAnalyticsConstruct,
      notificationsTopic,
      gamesApiConstruct,
      streamingIngestionConstruct,
      gameEventsStream,
      tables: [applicationsTable, authorizationsTable],
      functions: [
        lambdaConstruct.eventsProcessingFunction,
        lambdaConstruct.lambdaAuthorizer,
        lambdaConstruct.applicationAdminServiceFunction,
      ],
    });

    // Output important resource information to AWS Consol
    new cdk.CfnOutput(this, "AnalyticsBucketOutput", {
      description: "S3 Bucket for game analytics storage",
      value: analyticsBucket.bucketName,
    });

    new cdk.CfnOutput(this, "GameEventsStreamOutput", {
      description: "Kinesis Stream for ingestion of raw events",
      value: gameEventsStream.streamName,
    });

    new cdk.CfnOutput(this, "ApplicationsTableOutput", {
      description:
        "Configuration table for storing registered applications that are allowed by the solution pipeline",
      value: applicationsTable.tableName,
    });

    new cdk.CfnOutput(this, "GlueWorkflowConsoleLinkOutput", {
      description:
        "Link to the AWS Glue Workflows console page to view details of the workflow",
      value: `https://console.aws.amazon.com/glue/home?region=${cdk.Aws.REGION}#etl:tab=workflows;workflowView=workflow-list`,
    });

    new cdk.CfnOutput(this, "PipelineOperationsDashboardOutput", {
      description: "CloudWatch Dashboard for viewing pipeline metrics",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#dashboards:name=PipelineOpsDashboard_${cdk.Aws.STACK_NAME};start=PT1H`,
    });
  }
}
