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

import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as snsSubscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as sns from "aws-cdk-lib/aws-sns";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as s3deployment from "aws-cdk-lib/aws-s3-deployment";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";

import { Construct } from "constructs";
import { GameAnalyticsPipelineConfig } from "./helpers/config-types";
import { StreamingIngestionConstruct } from "./constructs/streaming-ingestion-construct";
import { ApiConstruct } from "./constructs/api-construct";
import { DataLakeConstruct } from "./constructs/data-lake-construct";
import { ManagedFlinkConstruct } from "./constructs/flink-construct";
import { MetricsConstruct } from "./constructs/metrics-construct";
import { LambdaConstruct } from "./constructs/lambda-construct";
import { CloudWatchDashboardConstruct } from "./constructs/dashboard-construct";
import { VpcConstruct } from "./constructs/vpc-construct";
import { RedshiftConstruct } from "./constructs/redshift-construct";
import { OpenSearchConstruct } from "./constructs/opensearch-construct";
import { AthenaQueryConstruct } from "./constructs/samples/athena-construct";
import { DataProcessingConstruct } from "./constructs/data-processing-construct";

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
      enforceSSL: true,
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
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
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
      aliasName: `alias/aws_game_analytics/${props.config.WORKLOAD_NAME}/SnsEncryptionKey`,
      targetKey: snsEncryptionKey,
    });

    // Notification topic for alarms
    const notificationsTopic = new sns.Topic(this, "Notifications", {
      displayName: `${props.config.WORKLOAD_NAME}-Notifications`,
      masterKey: snsEncryptionKeyAlias,
    });

    // ---- DynamoDB Tables ---- //

    // Table organizes and manages different applications
    const applicationsTable = new dynamodb.TableV2(this, "ApplicationsTable", {
      billing: dynamodb.Billing.onDemand(),
      partitionKey: {
        name: "application_id",
        type: dynamodb.AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      removalPolicy: props.config.DEV_MODE
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    // Managed authorizations for applications (Api keys, etc.)
    const authorizationsTable = new dynamodb.TableV2(
      this,
      "AuthorizationsTable",
      {
        billing: dynamodb.Billing.onDemand(),
        partitionKey: {
          name: "api_key_id",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "application_id",
          type: dynamodb.AttributeType.STRING,
        },
        pointInTimeRecovery: true,
        encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
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

    //////////// ---- CONSTRUCT RESOURCES ---- ////////////

    // ---- VPC resources (IF REDSHIFT OR REAL TIME in DEV_MODE is enabled) ---- //
    var vpcConstruct;
    if (props.config.DATA_PLATFORM_MODE === "REDSHIFT") {
      vpcConstruct = new VpcConstruct(this, "VpcConstruct", {
        config: props.config,
      });
    }


    // ---- Real-time ingest option ---- //

    // Input stream for applications
    var gamesEventsStream;
    var managedFlinkConstruct;
    var streamingIngestionConstruct;
    var opensearchConstruct;
    if (props.config.INGEST_MODE === "KINESIS_DATA_STREAMS" || props.config.DATA_PLATFORM_MODE === "REDSHIFT") {
      gamesEventsStream = new kinesis.Stream(this, "GameEventStream",
        (props.config.STREAM_PROVISIONED === true) ? {
          shardCount: props.config.STREAM_SHARD_COUNT,
          streamMode: kinesis.StreamMode.PROVISIONED,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        } : {
          streamMode: kinesis.StreamMode.ON_DEMAND,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        });

      if (props.config.REAL_TIME_ANALYTICS === true && gamesEventsStream instanceof cdk.aws_kinesis.Stream) {
        // Enables Managed Flink and all metrics surrounding it
        managedFlinkConstruct = new ManagedFlinkConstruct(
          this,
          "ManagedFlinkConstruct",
          {
            gameEventsStream: gamesEventsStream,
            baseCodePath: codePath,
            config: props.config,
          }
        );

        // Enable opensearch for real-time dashboards
        opensearchConstruct = new OpenSearchConstruct(
          this,
          "OpenSearchConstruct",
          {
            metricOutputStream: managedFlinkConstruct.metricOutputStream,
            config: props.config
          }
        )

        // cfn outputs if setting is enabled
        new cdk.CfnOutput(this, "FlinkAppOutput", {
          description:
            "Name of the Flink Application for game analytics",
          value: managedFlinkConstruct.managedFlinkApp.ref,
        });
        new cdk.CfnOutput(this, "MetricOutputStreamARN", {
          description:
            "ARN of the Kinesis Stream that recieves aggregated metrics from the Flink application",
          value: managedFlinkConstruct.metricOutputStream.streamArn,
        });

        new cdk.CfnOutput(this, "OpenSearchDashboardEndpoint", {
          description: "OpenSearch Dashboard for viewing real-time metrics",
          value: `https://application-${opensearchConstruct.gapInterface.name}-${opensearchConstruct.gapInterface.attrId}.${cdk.Aws.REGION}.opensearch.amazonaws.com/`
        });

        new cdk.CfnOutput(this, "OpensearchAdminAssumeUrl", {
          description: "Link to assume the role of an opensearch admin",
          value: `https://signin.aws.amazon.com/switchrole?roleName=${opensearchConstruct.osAdmin.roleName}&account=${cdk.Aws.ACCOUNT_ID}`
        });

      }
      // cfn outputs if setting is enabled
      new cdk.CfnOutput(this, "GameEventsStreamOutput", {
        description: "Stream for ingestion of raw events",
        value: gamesEventsStream.streamName,
      });
    }

    // ---- Redshift ---- //
    var redshiftConstruct;
    if (props.config.DATA_PLATFORM_MODE === "REDSHIFT" && vpcConstruct && gamesEventsStream) {
      redshiftConstruct = new RedshiftConstruct(this, "RedshiftConstruct", {
        gamesEventsStream: gamesEventsStream,
        config: props.config,
        vpcConstruct: vpcConstruct
      })
    }

    // ---- Functions ---- //

    // Create lambda functions
    const lambdaConstruct = new LambdaConstruct(this, "LambdaConstruct", {
      applicationsTable,
      authorizationsTable,
      config: props.config,
      redshiftConstruct,
      gamesEventsStream
    });

    // Events Processing Function Policy added here to connect above DynamoDB resources to Lambda policies
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
    // Lambda Authorizer Policy added here to connect above DynamoDB resources to Lambda policies
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

    if (props.config.DATA_PLATFORM_MODE === "DATA_LAKE") {
      // Glue datalake and processing jobs
      const dataLakeConstruct = new DataLakeConstruct(this, "DataLakeConstruct", {
        notificationsTopic: notificationsTopic,
        config: props.config,
        analyticsBucket: analyticsBucket,
      });

      // create data integration jobs
      const dataProcessingConstruct = new DataProcessingConstruct(this, "DataProcessingConstruct", {
        notificationsTopic: notificationsTopic,
        analyticsBucket: analyticsBucket,
        gameEventsDatabase: dataLakeConstruct.gameEventsDatabase,
        rawEventsTable: dataLakeConstruct.rawEventsTable,
        config: props.config,
      });

      // create sample athena queries
      const athenaConstruct = new AthenaQueryConstruct(this, "AthenaQueryConstruct", {
        gameAnalyticsWorkgroup: dataLakeConstruct.gameAnalyticsWorkgroup,
        gameEventsDatabase: dataLakeConstruct.gameEventsDatabase,
        config: props.config,
      })

      // Creates firehose and logs related to ingestion
      streamingIngestionConstruct = new StreamingIngestionConstruct(
        this,
        "StreamingIngestionConstruct",
        {
          applicationsTable: applicationsTable,
          gamesEventsStream: gamesEventsStream,
          analyticsBucket: analyticsBucket,
          rawEventsTable: dataLakeConstruct.rawEventsTable,
          gameEventsDatabase: dataLakeConstruct.gameEventsDatabase,
          eventsProcessingFunction: lambdaConstruct.eventsProcessingFunction,
          config: props.config,
        }
      );

      // CFN outputs for given configuration
      new cdk.CfnOutput(this, "GameEventsDatabase", {
        description: "Glue Catalog Database for storing game analytics events",
        value: dataLakeConstruct.gameEventsDatabase.ref,
      });

      new cdk.CfnOutput(this, "GameEventsEtlJob", {
        description:
          "ETL Job for processing game events into optimized format for analytics",
        value: dataProcessingConstruct.gameEventsEtlJob.ref,
      });

      new cdk.CfnOutput(this, "GameEventsIcebergJob", {
        description:
          "ETL Job for transform existing game events into Apache Iceberg table format using Amazon Glue",
        value: dataProcessingConstruct.gameEventsIcebergJob.ref,
      });

      new cdk.CfnOutput(this, "GlueWorkflowConsoleLink", {
        description:
          "Link to the AWS Glue Workflows console page to view details of the workflow",
        value: `https://console.aws.amazon.com/glue/home?region=${cdk.Aws.REGION}#etl:tab=workflows;workflowView=workflow-list`,
      });

      if (props.config.ENABLE_APACHE_ICEBERG_SUPPORT) {
        new cdk.CfnOutput(this, "IcebergSetupJob", {
          description:
            "Glue Job to set up the new Iceberg table",
          value: dataProcessingConstruct.icebergSetupJob.ref,
        });
      }
    }

    // ---- API ENDPOINT ---- /
    const gamesApiConstruct = new ApiConstruct(this, "GamesApiConstruct", {
      lambdaAuthorizer: lambdaConstruct.lambdaAuthorizer,
      gameEventsStream: gamesEventsStream,
      gameEventsFirehose: streamingIngestionConstruct?.gameEventsFirehose,
      applicationAdminServiceFunction:
        lambdaConstruct.applicationAdminServiceFunction,
      redshiftConstruct: redshiftConstruct,
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
      managedFlinkConstruct: managedFlinkConstruct,
      notificationsTopic: notificationsTopic,
      gamesApiConstruct: gamesApiConstruct,
      streamingIngestionConstruct: streamingIngestionConstruct,
      gameEventsStream: gamesEventsStream,
      tables: [applicationsTable, authorizationsTable],
      functions: [
        lambdaConstruct.eventsProcessingFunction,
        lambdaConstruct.lambdaAuthorizer,
        lambdaConstruct.applicationAdminServiceFunction,
      ],
    });

    const dashboardConstruct = new CloudWatchDashboardConstruct(this, "DashboardConstruct", {
      gameEventsStream: gamesEventsStream,
      managedFlinkConstruct: managedFlinkConstruct,
      gameEventsFirehose: streamingIngestionConstruct?.gameEventsFirehose,
      gameAnalyticsApi: gamesApiConstruct.gameAnalyticsApi,
      eventsProcessingFunction: lambdaConstruct.eventsProcessingFunction,
      redshiftConstruct: redshiftConstruct,
      config: props.config
    });

    // Output important resource information to AWS Console
    new cdk.CfnOutput(this, "AnalyticsBucketOutput", {
      description: "S3 Bucket for game analytics storage",
      value: analyticsBucket.bucketName,
    });

    new cdk.CfnOutput(this, "ApiGatewayExecutionLogs", {
      description: "CloudWatch Log Group containing the API execution logs",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#logsV2:log-groups/log-group/API-Gateway-Execution-Logs_${gamesApiConstruct.gameAnalyticsApi.restApiId}%252F${gamesApiConstruct.gameAnalyticsApi.deploymentStage.stageName}`,
    });

    new cdk.CfnOutput(this, "ApplicationsTableOutput", {
      description:
        "Configuration table for storing registered applications that are allowed by the solution pipeline",
      value: applicationsTable.tableName,
    });

    new cdk.CfnOutput(this, "GamesAnalyticsApiEndpoint", {
      description: "Invoke path for API",
      value: gamesApiConstruct.gameAnalyticsApi.deploymentStage.urlForPath(),
    });

    new cdk.CfnOutput(this, "PipelineOperationsDashboard", {
      description: "CloudWatch Dashboard for viewing pipeline metrics",
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${cdk.Aws.REGION}#dashboards:name=PipelineOpsDashboard_${props.config.WORKLOAD_NAME};start=PT1H`,
    });


  }
}
