output "flink_app_output" {
  description = "Name of the Flink Application for game analytics"
  value       = aws_kinesisanalyticsv2_application.managed_flink_app.name
}

output "flink_analytics_cloudwatch" {
  description = "Link to the Amazon CloudWatch namespace where custom metrics are published by the solution AnalyticsProcessingFunction."
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#metricsV2:graph=~();query=${var.stack_name}/AWSGameAnalytics"
}

output "kinesis_metrics_stream_name" {
  description = "The name of the kinesis stream containing the aggregated metrics"
  value       = aws_kinesis_stream.metric_output_stream.name
}

output "kinesis_metrics_stream_arn" {
  description = "The arn of the kinesis stream containing the aggregated metrics"
  value       = aws_kinesis_stream.metric_output_stream.arn
}