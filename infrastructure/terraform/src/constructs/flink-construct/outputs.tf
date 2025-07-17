output "flink_app_output" {
  description = "Name of the Flink Application for game analytics"
  value       = aws_kinesisanalyticsv2_application.managed_flink_app.name
}

output "kinesis_metrics_stream_name" {
  description = "The name of the kinesis stream containing the aggregated metrics"
  value       = aws_kinesis_stream.metric_output_stream.name
}

output "kinesis_metrics_stream_arn" {
  description = "The arn of the kinesis stream containing the aggregated metrics"
  value       = aws_kinesis_stream.metric_output_stream.arn
}