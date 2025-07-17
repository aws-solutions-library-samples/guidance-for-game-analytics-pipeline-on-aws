// Output important resource information to AWS Console
output "analytics_bucket_name" {
  description = "The name of the S3 Bucket used for game analytics storage"
  value       = aws_s3_bucket.analytics_bucket.id
}

output "game_events_stream_name" {
  description = "The name of the Kinesis Data Stream for ingestion of raw events."
  value       = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].name : ""
}

output "applications_table_name" {
  description = "The name of the DynamoDB configuration table that stores information about the registered applications allowed by the solution pipeline"
  value       = aws_dynamodb_table.applications_table.name
}

output "glue_workflow_console_link" {
  description = "A web link to the AWS Glue Workflows console page to view details about the deployed workflow"
  value       = "https://console.aws.amazon.com/glue/home?region=${data.aws_region.current.region}#etl:tab=workflows;workflowView=workflow-list"
}

output "pipeline_operations_dashboard_link" {
  description = "A web link to the CloudWatch dashboard to monitor the health of the pipeline"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.region}#dashboards:name=${local.config.WORKLOAD_NAME}_PipelineOpsDashboard;start=PT1H"
}

/* API Gateway Reference */
output "api_endpoint" {
  value =  module.games_api_construct.game_analytics_api_endpoint
  description = "he base URL of the Game Analytics API. This is the endpoint used to perform administration actions and recieve events"
}

output "api_gateway_execution_logs_link" {
  value =  module.games_api_construct.api_gateway_execution_logs
  description = "A web link to the CloudWatch logs emitted from API Gateway"
}

/* Outputs if DATA_LAKE is enabled */
output "game_events_database_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_lake_construct[0].game_events_database : ""
  description = "The name of the Glue Data Catalog database where game events are stored."
}
output "game_events_etl_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].game_events_etl_job : ""
  description = "The name of the ETL job used to move data from the raw events table to the processed events table."
}
output "game_events_etl_iceberg_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].game_events_etl_iceberg_job : ""
  description = "The name of the ETL job used to move data from an existing Game Analytics Pipeline Hive table to a new Apache Iceberg table."
}

output "iceberg_setup_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].iceberg_setup_job : ""
  description = "The name of the Glue Job used to configure partitioning on a newly created Apache Iceberg table."
}

/* Outputs only if REAL_TIME_ANALYTICS is enabled */

output "flink_app_name" {
  description = "The name of the Amazon Managed Service for Apache Flink application."
  value       = local.config.REAL_TIME_ANALYTICS ? module.flink_construct[0].flink_app_output : ""
}

output "opensearch_dashboard_link" {
  value       = local.config.REAL_TIME_ANALYTICS ? module.opensearch_construct[0].opensearch_dashboard_endpoint : ""
  description = "A link to the OpenSearch UI Application to view real-time custom metrics."
}

output "opensearch_admin_assume_link" {
  value       = local.config.REAL_TIME_ANALYTICS ? module.opensearch_construct[0].opensearch_admin_assume_url : ""
  description = "Link to assume the role of an OpenSearch admin."
}

output "metric_output_stream_name" {
  description = "The name of the intermediary Amazon Kinesis Data Stream between Managed Service for Apache Flink and OpenSearch Ingestion."
  value       = local.config.REAL_TIME_ANALYTICS ? module.flink_construct[0].kinesis_metrics_stream_name : ""
}

output "admin_api_access_policy_name" {
  description = "The name of the IAM managed policy that will allow an entity to execute the Admin API"
  value       = module.games_api_construct.admin_api_access_policy_name
}