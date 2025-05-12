// Output important resource information to AWS Console
output "analytics_bucket" {
  description = "S3 Bucket for game analytics storage"
  value       = aws_s3_bucket.analytics_bucket.id
}

output "game_events_stream" {
  description = "Kinesis Stream for ingestion of raw events"
  value       = aws_kinesis_stream.game_events_stream.name
}

output "applications_table" {
  description = "Configuration table for storing registered applications that are allowed by the solution pipeline"
  value       = aws_dynamodb_table.applications_table.name
}

output "glue_workflow_console_link" {
  description = "Link to the AWS Glue Workflows console page to view details of the workflow"
  value       = "https://console.aws.amazon.com/glue/home?region=${data.aws_region.current.name}#etl:tab=workflows;workflowView=workflow-list"
}

output "pipeline_operations_dashboard" {
  description = "CloudWatch Dashboard for viewing pipeline metrics"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=PipelineOpsDashboard_${local.config.WORKLOAD_NAME};start=PT1H"
}