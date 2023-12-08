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
import * as customresources from "aws-cdk-lib/custom-resources";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as events from "aws-cdk-lib/aws-events";
import * as eventstargets from "aws-cdk-lib/aws-events-targets";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as s3deployment from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { v4 as uuid4 } from "uuid";

import { GameAnalyticsPipelineConfig } from "./helpers/config-types";
import { StreamingIngestionConstruct } from "./constructs/streaming-ingestion-construct";
import { ApiConstruct } from "./constructs/api-construct";
import { StreamingAnalyticsConstruct } from "./constructs/streaming-analytics";
import { MetricsConstruct } from "./constructs/metrics-construct";
import { LambdaConstruct } from "./constructs/lambda-construct";

export interface InfrastructureStackProps extends cdk.StackProps {
  config: GameAnalyticsPipelineConfig;
}

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfrastructureStackProps) {
    super(scope, id, props);
    const codePath = "../../business-logic";

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

    /* The following resources copies the Glue ETL script to S3. This replaces the need
        to create a Custom Resource using the `uploadS3Object` routine from the Solution Helper */
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
    const gameEventsStream = new kinesis.Stream(this, "GameEventStream", {
      shardCount: props.config.STREAM_SHARD_COUNT,
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

    // Event rule that creates partitions automatically every hour for new data
    const createPartition = new events.Rule(this, "CreatePartition", {
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "*/1",
        day: "*",
        month: "*",
        year: "*",
      }),
    });
    createPartition.addTarget(
      new eventstargets.LambdaFunction(lambdaConstruct.gluePartitionCreator)
    );

    // Add necessary policies to all lambdas
    lambdaConstruct.gluePartitionCreator.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "GlueAccess",
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetTable",
          "glue:GetTables",
          "glue:UpdateTable",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:CreatePartition",
          "glue:BatchCreatePartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchGetPartition",
          "glue:UpdatePartition",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:table/${dataLakeConstruct.gameEventsDatabase.ref}/*`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:database/${dataLakeConstruct.gameEventsDatabase.ref}`,
          `arn:${cdk.Aws.PARTITION}:glue:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:catalog`,
        ],
      })
    );

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
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "GetSolutionS3Objects",
        effect: iam.Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: ["*"], // Setting this to all S3 buckets as there is no source code bucket in this solution.
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "UploadS3Objects",
        effect: iam.Effect.ALLOW,
        actions: ["s3:PutObject"],
        resources: [`${analyticsBucket.bucketArn}/*`],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DynamoDB",
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:PutItem"],
        resources: [applicationsTable.tableArn, authorizationsTable.tableArn],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "InvokeGluePartitionCreator",
        effect: iam.Effect.ALLOW,
        actions: ["lambda:InvokeFunction"],
        resources: [lambdaConstruct.gluePartitionCreator.functionArn],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "GluePermissions",
        effect: iam.Effect.ALLOW,
        actions: ["glue:PutDataCatalogEncryptionSettings"],
        resources: ["*"],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "cloudwatchLogs",
        effect: iam.Effect.ALLOW,
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutDestination",
          "logs:PutLogEvents",
        ],
        resources: [
          `arn:${cdk.Aws.PARTITION}:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/*`,
        ],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "AthenaQueries",
        effect: iam.Effect.ALLOW,
        actions: ["athena:CreateNamedQuery"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:athena:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:workgroup/${gameAnalyticsWorkgroup.ref}`,
        ],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchDashboard",
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:PutDashboard"],
        resources: ["*"],
      })
    );
    lambdaConstruct.solutionHelper.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "CloudWatchDashboardDelete",
        effect: iam.Effect.ALLOW,
        actions: ["cloudwatch:DeleteDashboards"],
        resources: [
          `arn:${cdk.Aws.PARTITION}:cloudwatch::${cdk.Aws.ACCOUNT_ID}:dashboard/PipelineOpsDashboard_${cdk.Aws.STACK_NAME}`,
        ],
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

    // ---- Custom Resources ---- //
    const solutionHelperProvider = new customresources.Provider(
      this,
      "SolutionHelperProvider",
      {
        onEventHandler: lambdaConstruct.solutionHelper,
      }
    );

    // Moved UUID generation to here due to custom resource gettAtt issues
    const applicationId = uuid4();
    const applicationName = "default_app";

    // Creates a default application
    const createDefaultApplicationCustomResource = new cdk.CustomResource(
      this,
      "CreateDefaultApplication",
      {
        serviceToken: solutionHelperProvider.serviceToken,
        properties: {
          customAction: "createDefaultApplication",
          applicationsTable: applicationsTable.tableName,
          application_id: applicationId,
          description: "Default application created by the solution",
          application_name: applicationName,
        },
      }
    );

    // Create API Authorization for default application
    const createApiAuthorizationCustomResource = new cdk.CustomResource(
      this,
      "CreateApiAuthorization",
      {
        serviceToken: solutionHelperProvider.serviceToken,
        properties: {
          customAction: "CreateApiAuthorization",
          authorizationsTable: authorizationsTable.tableName,
          application_id: applicationId,
          application_name: applicationName,
          key_name: `default-key-${cdk.Aws.STACK_NAME}`,
          key_description: "Auto-generated api key",
        },
      }
    );
    createApiAuthorizationCustomResource.node.addDependency(
      createDefaultApplicationCustomResource
    );

    // Create the Athena Named Queries in the Workgroup
    const createAthenaNamedQueriesCustomResource = new cdk.CustomResource(
      this,
      "CreateAthenaNamedQueries",
      {
        serviceToken: solutionHelperProvider.serviceToken,
        properties: {
          customAction: "createAthenaNamedQueries",
          database: dataLakeConstruct.gameEventsDatabase.ref,
          workgroupName: gameAnalyticsWorkgroup.name,
          table: dataLakeConstruct.rawEventsTable.ref,
        },
      }
    );

    // Invoke the GluePartitionCreator function to create date-based Glue Partition for current date (UTC)
    const createGluePartitionCustomResource = new cdk.CustomResource(
      this,
      "CreateGluePartition",
      {
        serviceToken: solutionHelperProvider.serviceToken,
        properties: {
          customAction: "InvokeFunctionSync",
          functionArn: lambdaConstruct.gluePartitionCreator.functionArn,
        },
      }
    );
    createGluePartitionCustomResource.node.addDependency(
      lambdaConstruct.gluePartitionCreator
    );

    // Enable Server-Side Encryption settings for Glue Data Catalog
    // Use custom resource to avoid CloudFormation Errors if data catalog is already encrypted.
    new cdk.CustomResource(this, "GluePutDataCatalogEncryption", {
      serviceToken: solutionHelperProvider.serviceToken,
      properties: {
        customAction: "putDataCatalogEncryptionSettings",
        catalogId: cdk.Aws.ACCOUNT_ID,
      },
    });

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
          solutionHelper: lambdaConstruct.solutionHelper,
          gameEventsStream: gameEventsStream,
          solutionHelperProvider: solutionHelperProvider,
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

    // Dashboard showing status of analytics pipeline (lambda, KDA, Firehouse status, etc.)
    const pipelineOpsDashboard = new cdk.CustomResource(
      this,
      "PipelineOpsDashboard",
      {
        serviceToken: solutionHelperProvider.serviceToken,
        properties: {
          customAction: "createCloudWatchDashboard",
          DashboardName: `PipelineOpsDashboard_${cdk.Aws.STACK_NAME}`,
          StreamingAnalyticsEnabled: props.config.ENABLE_STREAMING_ANALYTICS,
          Functions: {
            AnalyticsProcessingFunction: streamingAnalyticsConstruct
              ? streamingAnalyticsConstruct.analyticsProcessingFunction
                  .functionName
              : cdk.Aws.NO_VALUE,
            AnalyticsProcessingFunctionArn: streamingAnalyticsConstruct
              ? streamingAnalyticsConstruct.analyticsProcessingFunction
                  .functionName
              : cdk.Aws.NO_VALUE,
            EventsProcessingFunction:
              lambdaConstruct.eventsProcessingFunction.functionName,
            EventsProcessingFunctionArn:
              lambdaConstruct.eventsProcessingFunction.functionName,
          },
          Kinesis: {
            GameEventsFirehose:
              streamingIngestionConstruct.gameEventsFirehose.ref,
            GameEventsStream: gameEventsStream.streamName,
            KinesisAnalyticsApp: streamingAnalyticsConstruct
              ? `AnalyticsApplication-${cdk.Aws.STACK_NAME}`
              : cdk.Aws.NO_VALUE,
          },
          GameAnalyticsApi: {
            Name: gamesApiConstruct.gameAnalyticsApi.restApiName,
            Stage: gamesApiConstruct.gameAnalyticsApi.deploymentStage.stageName,
          },
        },
      }
    );
    pipelineOpsDashboard.node.addDependency(
      streamingIngestionConstruct.gameEventsFirehose
    );

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
        lambdaConstruct.gluePartitionCreator,
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

    if (props.config.DEV_MODE) {
      new cdk.CfnOutput(this, "TestApplicationIdOutput", {
        description:
          "The identifier of the test application that was created with the solution",
        value: applicationId,
      });
    }
  }
}
