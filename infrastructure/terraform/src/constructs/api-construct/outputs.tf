output "api_base_path" {
  description = "The base path of the Solution API"
  value       = "${aws_api_gateway_deployment.game_analytics_api_deployment.invoke_url}/${var.api_stage_name}"
}

output "api_gateway_execution_logs" {
  description = "CloudWatch Log Group containing the API execution logs"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#logsV2:log-groups/log-group/API-Gateway-Execution-Logs_${aws_api_gateway_rest_api.game_analytics_api.id}%252F${var.api_stage_name}"
}