output "events_processing_function_role_name" {
  value       = aws_iam_role.events_processing_function_role.name
  description = "Name of the IAM role for the events processing Lambda function"
}

output "lambda_authorizer_role_name" {
  value       = aws_iam_role.lambda_authorizer_role.name
  description = "Name of the IAM role for the Lambda authorizer function"
}

output "admin_function_role_name" {
  value       = aws_iam_role.application_admin_service_function_role.name
  description = "Name of the IAM role for the Lambda authorizer function"
}

output "events_processing_function_arn" {
  value = module.events_processing_function.lambda_function_arn
}

output "lambda_authorizer_function_arn" {
  value = module.lambda_authorizer.lambda_function_arn
}

output "application_admin_service_function_arn" {
  value = module.application_admin_service_function.lambda_function_arn
}

output "events_processing_function_name" {
  value       = module.events_processing_function.lambda_function_name
  description = "The name of the events processing Lambda function"
}

output "lambda_authorizer_function_name" {
  value       = module.lambda_authorizer.lambda_function_name
  description = "The name of the Lambda authorizer function"
}

output "application_admin_service_function_name" {
  value       = module.application_admin_service_function.lambda_function_name
  description = "The name of the application admin service Lambda function"
}