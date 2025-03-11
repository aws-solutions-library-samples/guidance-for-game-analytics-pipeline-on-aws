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
import { ManagedFlinkConstruct } from "./constructs/flink-construct";
import { MetricsConstruct } from "./constructs/metrics-construct";
import { LambdaConstruct } from "./constructs/lambda-construct";

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
    // Note: Shouldn't this go to Data Lake Construct?
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
      applicationsTable,
      authorizationsTable,
    });

    // Shouldn't the below policies just go to Lambda Construct..?
    // Events Processing Function Policy
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
    // Lambda Authorizer Policy
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

    // Grant DynamoDB permissions to Lambda functions
    authorizationsTable.grantReadWriteData(
      lambdaConstruct.applicationAdminServiceFunction
    );

    applicationsTable.grantReadWriteData(
      lambdaConstruct.applicationAdminServiceFunction
    );

    // Initialize variable, will be checked to see if set properly
    let managedFlinkConstruct;
    let metricOutputStream;

    // ---- Streaming Analytics ---- //
    // Create the following resources if and is `STREAMING_MODE` constant is set to REAL_TIME_KDS
    if (props.config.STREAMING_MODE === "REAL_TIME_KDS" || props.config.STREAMING_MODE === "REAL_TIME_MSK") {
      // Enables Managed Flink and all metrics surrounding it

      managedFlinkConstruct = new ManagedFlinkConstruct(
        this,
        "ManagedFlinkConstruct",
        {
          gameEventsStream: gameEventsStream, // Add option for MSK later
          baseCodePath: codePath,
          config: props.config,
        }
      );
      metricOutputStream = managedFlinkConstruct.metricOutputStream;
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
      gameEventsFirehose: streamingIngestionConstruct.gameEventsFirehose,
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
      managedFlinkConstruct,
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

    const dashboardConstruct = new CloudWatchDashboardConstruct(this, "DashboardConstruct", {
      gameEventsStream: gameEventsStream,
      metricOutputStream: metricOutputStream,
      gameEventsFirehose: streamingIngestionConstruct.gameEventsFirehose,
      gameAnalyticsApi: gamesApiConstruct.gameAnalyticsApi,
      eventsProcessingFunction: lambdaConstruct.eventsProcessingFunction,
      analyticsProcessingFunction: managedFlinkConstruct?.metricProcessingFunction,
      kinesisAnalyticsApp: managedFlinkConstruct?.managedFlinkApp,
      streamingAnalyticsEnabled: props.config.STREAMING_MODE === "REAL_TIME_KDS"
    });

    // Output important resource information to AWS Console
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
