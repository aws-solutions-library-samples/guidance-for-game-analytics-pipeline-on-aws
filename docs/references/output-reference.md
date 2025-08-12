# Output Reference

This page explains the outputs displayed by the stack after a successful deployment. Due to differences in naming convention, the format of the outputs differs between [AWS Cloud Development Kit](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) and [Hashicorp Terraform](https://developer.hashicorp.com/terraform/language/style#outputs), however, the meaning of each output is consistent across both versions.

## Admin API Access Policy Name

- **CDK Output:** `CentralizedGameAnalytics.AdminApiAccessPolicyName`
- **Terraform Output:** `admin_api_access_policy_name`
- **Description:** The name of the IAM Managed Policy that will allow an IAM entity to execute the Admin API

## Analytics Bucket Name

- **CDK Output:** `CentralizedGameAnalytics.AnalyticsBucketName`
- **Terraform Output:** `analytics_bucket_name`
- **Description:** The name of the S3 Bucket used for game analytics storage

## API Endpoint

- **CDK Output:** `CentralizedGameAnalytics.ApiEndpoint`
- **Terraform Output:** `api_endpoint`
- **Description:** The base URL of the Game Analytics API. This is the endpoint used to perform administration actions and recieve events

## API Gateway Execution Logs Link

- **CDK Output:** `CentralizedGameAnalytics.ApiGatewayExecutionLogsLink`
- **Terraform Output:** `api_gateway_execution_logs_link`
- **Description:** A web link to the CloudWatch logs emitted from API Gateway

## Applications Table Name

- **CDK Output:** `CentralizedGameAnalytics.ApplicationsTableName`
- **Terraform Output:** `applications_table_name`
- **Description:** The name of the DynamoDB configuration table that stores information about the registered applications allowed by the solution pipeline

## Flink App Name

- **CDK Output:** `CentralizedGameAnalytics.FlinkAppName`
- **Terraform Output:** `flink_app_name`
- **Description:** The name of the Amazon Managed Service for Apache Flink application. This is only enabled when [REAL_TIME_ANALYTICS](config-reference.md#data-platform-options) is set to `true`.

## Game Events Database Name

- **CDK Output:** `CentralizedGameAnalytics.GameEventsDatabaseName`
- **Terraform Output:** `game_events_database_name`
- **Description:** The name of the Glue Data Catalog database where game events are stored. This is only enabled when [DATA_STACK](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Game Events ETL Job Name

- **CDK Output:** `CentralizedGameAnalytics.GameEventsEtlJobName`
- **Terraform Output:** `game_events_etl_job_name`
- **Description:** The name of the ETL job used to move data from the raw events table to the processed events table. This is only enabled when [DATA_STACK](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Game Events ETL Iceberg Job Name

- **CDK Output:** `CentralizedGameAnalytics.GameEventsIcebergJobName`
- **Terraform Output:** `game_events_etl_iceberg_job_name`
- **Description:** The name of the ETL job used to move data from an existing Game Analytics Pipeline Hive table to a new Apache Iceberg table. This is only enabled when [DATA_STACK](config-reference.md#data-platform-options) is set to `"DATA_LAKE"` and when [ENABLE_APACHE_ICEBERG_SUPPORT](config-reference.md#data-platform-options) is set to `true`.

## Game Events Stream Name

- **CDK Output:** `CentralizedGameAnalytics.GameEventsStreamName`
- **Terraform Output:** `game_events_stream_name`
- **Description:** The name of the Kinesis Data Stream for ingestion of raw events. This is only enabled when [INGEST_MODE](config-reference.md#data-platform-options) is set to `"KINESIS_DATA_STREAMS"`.

## Glue Workflow Console Link

- **CDK Output:** `CentralizedGameAnalytics.GlueWorkflowConsoleLink`
- **Terraform Output:** `glue_workflow_console_link`
- **Description:** A web link to the AWS Glue Workflows console page to view details about the deployed workflow

## Iceberg Setup Job Name

- **CDK Output:** `CentralizedGameAnalytics.IcebergSetupJobName`
- **Terraform Output:** `iceberg_setup_job_name`
- **Description:** The name of the Glue Job used to configure partitioning on a newly created Apache Iceberg table. This is only enabled when [DATA_STACK](config-reference.md#data-platform-options) is set to `"DATA_LAKE"`.

## Metric Output Stream Name

- **CDK Output:** `CentralizedGameAnalytics.MetricOutputStreamName`
- **Terraform Output:** `metric_output_stream_name`
- **Description:** The name of the intermediary Amazon Kinesis Data Stream between Managed Service for Apache Flink and OpenSearch Ingestion. This is only enabled when [REAL_TIME_ANALYTICS](config-reference.md#data-platform-options) is set to `true`.

## OpenSearch Admin Assume Link

- **CDK Output:** `CentralizedGameAnalytics.OpenSearchAdminAssumeLink`
- **Terraform Output:** `opensearch_admin_assume_link`
- **Description:** Link to assume the role of an OpenSearch admin.  This is only enabled when [REAL_TIME_ANALYTICS](config-reference.md#data-platform-options) is set to `true`.

## OpenSearch Dashboard Link

- **CDK Output:** `CentralizedGameAnalytics.OpenSearchDashboardLink`
- **Terraform Output:** `opensearch_dashboard_link`
- **Description:** A link to the OpenSearch UI Application to view real-time custom metrics. This is only enabled when [REAL_TIME_ANALYTICS](config-reference.md#data-platform-options) is set to `true`.

## Pipeline Operations Dashboard Link

- **CDK Output:** `CentralizedGameAnalytics.PipelineOperationsDashboardLink`
- **Terraform Output:** `pipeline_operations_dashboard_link`
- **Description:** A web link to the CloudWatch dashboard to monitor the health of the pipeline
