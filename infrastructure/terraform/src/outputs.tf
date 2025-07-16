// Output important resource information to AWS Console
output "analytics_bucket_name" {
  description = "S3 Bucket for game analytics storage"
  value       = aws_s3_bucket.analytics_bucket.id
}

output "game_events_stream_name" {
  description = "Kinesis Stream for ingestion of raw events"
  value       = local.config.INGEST_MODE == "KINESIS_DATA_STREAMS" ? aws_kinesis_stream.game_events_stream[0].name : ""
}

output "applications_table_name" {
  description = "Configuration table for storing registered applications that are allowed by the solution pipeline"
  value       = aws_dynamodb_table.applications_table.name
}

output "glue_workflow_console_link" {
  description = "Link to the AWS Glue Workflows console page to view details of the workflow"
  value       = "https://console.aws.amazon.com/glue/home?region=${data.aws_region.current.region}#etl:tab=workflows;workflowView=workflow-list"
}

output "pipeline_operations_dashboard_link" {
  description = "CloudWatch Dashboard for viewing pipeline metrics"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.region}#dashboards:name=${local.config.WORKLOAD_NAME}_PipelineOpsDashboard;start=PT1H"
}

/* API Gateway Reference */
output "api_endpoint" {
  value =  module.games_api_construct.game_analytics_api_endpoint
}

output "api_gateway_execution_logs_link" {
  value =  module.games_api_construct.api_gateway_execution_logs
}

/* Outputs if DATA_LAKE is enabled */
output "game_events_database_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_lake_construct[0].game_events_database : ""
}
output "game_events_etl_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].game_events_etl_job : ""
}
output "game_events_etl_iceberg_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].game_events_etl_iceberg_job : ""
}

output "iceberg_setup_job_name" {
  value =  local.config.DATA_PLATFORM_MODE == "DATA_LAKE" ? module.data_processing_construct[0].iceberg_setup_job : ""
}

/* Outputs only if REAL_TIME_ANALYTICS is enabled */

output "flink_app_name" {
  description = "Name of the Flink Application for game analytics"
  value       = local.config.REAL_TIME_ANALYTICS ? module.flink_construct[0].flink_app_output : ""
}

output "opensearch_dashboard_link" {
  value       = local.config.REAL_TIME_ANALYTICS ? module.opensearch_construct[0].opensearch_dashboard_endpoint : ""
  description = "OpenSearch Dashboard for viewing real-time metrics"
}

output "opensearch_admin_assume_link" {
  value       = local.config.REAL_TIME_ANALYTICS ? module.opensearch_construct[0].opensearch_admin_assume_url : ""
  description = "Link to assume the role of an opensearch admin"
}

output "kinesis_metrics_stream_name" {
  description = "The name of the kinesis stream containing the aggregated metrics"
  value       = local.config.REAL_TIME_ANALYTICS ? module.flink_construct[0].kinesis_metrics_stream_name : ""
}

output "admin_api_access_policy_name" {
  description = "The name of the IAM managed policy that will allow an entity to execute the Admin API"
  value       = module.games_api_construct.admin_api_access_policy_name
}