# Output Reference

This page explains the outputs displayed by the stack after a successful deployment. Due to differences in naming convention, the format of the outputs differs between [AWS Cloud Development Kit](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) and [Hashicorp Terraform](https://developer.hashicorp.com/terraform/language/style#outputs), however, the meaning of each output is consistent across both versions.

## Analytics Bucket

- CDK Output: `CentralizedGameAnalytics.AnalyticsBucketOutput`
- Terraform Output: `analytics_bucket`
- Description: The name of the S3 Bucket used for game analytics storage

## Game Events Stream

- CDK Output: `CentralizedGameAnalytics.GameEventsStreamOutput`
- Terraform Output: `game_events_stream`
- Description: The name of the Kinesis Stream for ingestion of raw events. This is only enabled when [INGEST_MODE](config-reference.md#data-platform-options) is set to `"KINESIS_DATA_STREAMS"`.

## Applications Table

- CDK Output: `CentralizedGameAnalytics.ApplicationsTableOutput`
- Terraform Output: `applications_table`
- Description: The name of the DynamoDB configuration table that stores information about the registered applications allowed by the solution pipeline

## Glue Workflow Console Link

- CDK Output: `CentralizedGameAnalytics.GlueWorkflowConsoleLink`
- Terraform Output: `glue_workflow_console_link`
- Description: A web link to the AWS Glue Workflows console page to view details about the deployed workflow

## Pipeline Operations Dashboard

- CDK Output: `CentralizedGameAnalytics.PipelineOperationsDashboard`
- Terraform Output: `pipeline_operations_dashboard`
- Description: A web link to the CloudWatch dashboard to monitor the health of the pipeline

## Game Analytics API Endpoint

- CDK Output: `CentralizedGameAnalytics.GamesAnalyticsApiEndpoint`
- Terraform Output: `game_analytics_api_endpoint`
- Description: The base URL of the Game Analytics API used to perform administration actions and to

## API Gateway Execution Logs

- CDK Output: `CentralizedGameAnalytics.ApiGatewayExecutionLogs`
- Terraform Output: `api_gateway_execution_logs`
- Description: A web link to the CloudWatch logs emitted from API Gateway

## Game Events Database

- CDK Output: `CentralizedGameAnalytics.GameEventsDatabase`
- Terraform Output: `game_events_database`
- Description: The name of the Glue Data Catalog database where game events are stored. This is only enabled when [DATA_PLATFORM_MODE](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Game Events ETL Job

- CDK Output: `CentralizedGameAnalytics.GameEventsEtlJob`
- Terraform Output: `game_events_etl_job`
- Description: The name of the ETL job used to move data from the raw events table to the processed events table. This is only enabled when [DATA_PLATFORM_MODE](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Game Events ETL Iceberg Job

- CDK Output: `CentralizedGameAnalytics.GameEventsIcebergJob`
- Terraform Output: `game_events_etl_iceberg_job`
- Description: The name of the ETL job used to move data from an existing Game Analytics Pipeline Hive table to a new Apache Iceberg table. This is only enabled when [DATA_PLATFORM_MODE](config-reference.md#data-platform-options) is set to `"DATA_LAKE"` and when [ENABLE_APACHE_ICEBERG_SUPPORT](config-reference.md#data-platform-options) is set to `true`.

## Iceberg Setup Job

- CDK Output: `CentralizedGameAnalytics.IcebergSetupJob`
- Terraform Output: `iceberg_setup_job`
- Description: The name of the Glue Job used to configure partitioning on a newly created Apache Iceberg table. This is only enabled when [DATA_PLATFORM_MODE](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Flink App Output

- CDK Output: `CentralizedGameAnalytics.FlinkAppOutput`
- Terraform Output: `flink_app_output`
- Description: The name of the Amazon Managed Service for Apache Flink application.

## OpenSearch Dashboard Endpoint

- CDK Output: `CentralizedGameAnalytics.OpenSearchDashboardEndpoint`
- Terraform Output: `opensearch_dashboard_endpoint`
- Description: A link to the OpenSearch UI Application to view real-time custom metrics

## OpenSearch Admin Assume URL

- CDK Output: `CentralizedGameAnalytics.OpensearchAdminAssumeUrl`
- Terraform Output: `opensearch_admin_assume_url`
- Description: Link to assume the role of an OpenSearch admin

## Kinesis Metric Output Stream ARN

- CDK Output: `CentralizedGameAnalytics.MetricOutputStreamARN`
- Terraform Output: `kinesis_metric_output_stream_arn`
- Description: The ARN of the intermediary Amazon Kinesis Data Stream between Managed Service for Apache Flink and OpenSearch Ingestion.