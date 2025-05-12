output "flink_app_output" {
  description = "Name of the Flink Application for game analytics"
  value       = aws_kinesisanalyticsv2_application.managed_flink_app
}

output "metric_output_stream_arn" {
  description = "ARN of the Kinesis Stream that recieves aggregated metrics from the Flink application"
  value       = module.metric_processing_function.lambda_function_arn
}

output "flink_analytics_cloudwatch" {
  description = "Link to the Amazon CloudWatch namespace where custom metrics are published by the solution AnalyticsProcessingFunction."
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#metricsV2:graph=~();query=${var.stack_name}/AWSGameAnalytics"
}

output "kinesis_metrics_stream_name" {
  description = "The name of the kinesis stream containing the aggregated metrics"
  value       = aws_kinesis_stream.metric_output_stream.name
}

output "analytics_processing_function_name" {
  description = "The name of the lambda function processing metrics"
  value       = module.metric_processing_function.lambda_function_name
}

output "kinesis_analytics_log_group_name" {
  description = "The name of the metric processing function log group"
  value = module.metric_processing_function.lambda_cloudwatch_log_group_name
}