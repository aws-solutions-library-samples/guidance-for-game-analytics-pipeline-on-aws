output "game_analytics_api_id" {
  value = aws_api_gateway_rest_api.game_analytics_api.id
}

output "game_analytics_api_name" {
  value       = aws_api_gateway_rest_api.game_analytics_api.name
  description = "The name of the Game Analytics API"
}

output "game_analytics_api_endpoint" {
  value       = aws_api_gateway_stage.game_analytics_api_stage.invoke_url
  description = "The name of the Game Analytics API"
}

output "game_analytics_api_stage_name" {
  value       = aws_api_gateway_stage.game_analytics_api_stage.stage_name
  description = "The name of the API Gateway stage for the Game Analytics API"
}

output "api_gateway_execution_logs" {
  description = "CloudWatch Log Group containing the API execution logs"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.region}#logsV2:log-groups/log-group/API-Gateway-Execution-Logs_${aws_api_gateway_rest_api.game_analytics_api.id}%252F${var.api_stage_name}"
}