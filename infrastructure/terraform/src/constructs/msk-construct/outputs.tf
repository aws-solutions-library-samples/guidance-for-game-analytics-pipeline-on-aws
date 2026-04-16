output "cluster_arn" {
  description = "The ARN of the MSK cluster"
  value       = aws_msk_cluster.game_analytics_cluster.arn
}

output "cluster_name" {
  description = "The name of the MSK cluster"
  value       = aws_msk_cluster.game_analytics_cluster.cluster_name
}

output "bootstrap_brokers_iam" {
  description = "IAM SASL authenticated bootstrap brokers endpoint"
  value       = aws_msk_cluster.game_analytics_cluster.bootstrap_brokers_sasl_iam
}

output "zookeeper_connect_string" {
  description = "Zookeeper connection string for the MSK cluster"
  value       = aws_msk_cluster.game_analytics_cluster.zookeeper_connect_string
}

output "security_group_id" {
  description = "The ID of the MSK security group"
  value       = aws_security_group.msk_security_group.id
}

output "cluster_log_group_name" {
  description = "The name of the CloudWatch log group for the MSK cluster"
  value       = aws_cloudwatch_log_group.game_analytics_cluster_logs.name
}

output "topic_name" {
  description = "The name of the game events Kafka topic"
  value       = aws_msk_topic.game_event_topic.name
}

output "topic_arn" {
  description = "The ARN of the game events Kafka topic"
  value       = aws_msk_topic.game_event_topic.arn
}

output "event_ingestion_function_arn" {
  description = "The ARN of the event ingestion Lambda function"
  value       = module.event_ingestion_function.lambda_function_arn
}
