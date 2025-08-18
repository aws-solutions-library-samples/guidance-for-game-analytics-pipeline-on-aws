// IAM Role for API Gateway
resource "aws_iam_role" "api_gateway_role" {
  name = "${var.stack_name}-ApiGatewayRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })
}

// IAM Policy for API Gateway to put records to Kinesis
resource "aws_iam_role_policy" "api_gateway_kinesis_policy" {
  count = var.ingest_mode == "KINESIS_DATA_STREAMS" ? 1 : 0
  role = aws_iam_role.api_gateway_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Effect = "Allow"
        Resource = [var.game_events_stream_arn]
      }
    ]
  })
}

// IAM Policy for API Gateway to put records to Firehose
resource "aws_iam_role_policy" "api_gateway_firehose_policy" {
  count = var.ingest_mode == "DIRECT_BATCH" ? 1 : 0
  role = aws_iam_role.api_gateway_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "firehose:PutRecord",
          "firehose:PutRecordBatch"
        ]
        Effect = "Allow"
        Resource = [var.game_events_firehose_arn]
      }
    ]
  })
}

// IAM Policy for API Gateway to invoke Lambda functions
resource "aws_iam_role_policy" "api_gateway_lambda_policy" {
  role = aws_iam_role.api_gateway_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "lambda:InvokeFunction"
        Effect = "Allow"
        Resource = [
          var.application_admin_service_function_arn,
          var.lambda_authorizer_arn
        ]
      }
    ]
  })
}

locals {
  api_gateway_body = {
      DIRECT_BATCH = {
          value = <<EOT
{
                            "DeliveryStreamName": "${var.game_events_firehose_name}",
                            "Records": [
                                #set($i = 0)
                                #foreach($event in $input.path('$.events'))
                                  #set($data = $input.json("$.events[$i]"))
                                  #set($output = "{
                                    ""event"": $data,
                                    ""aws_ga_api_validated_flag"": true,
                                    ""aws_ga_api_requestId"": ""$context.requestId"",
                                    ""aws_ga_api_requestTimeEpoch"": $context.requestTimeEpoch,
                                    ""application_id"": ""$util.escapeJavaScript($input.params().path.get('applicationId'))""
                                  }" )
                                  {
                                    "Data": "$util.base64Encode($output)"
                                  }#if($foreach.hasNext),#end
                                  #set($i = $i + 1)
                                #end
                            ]
                        }
EOT
        },
      KINESIS_DATA_STREAMS = {
          value = <<EOT
{
                            "StreamName": "${var.game_events_stream_name}",
                            "Records": [
                                #set($i = 0)
                                #foreach($event in $input.path('$.events'))
                                  #set($data = $input.json("$.events[$i]"))
                                  #set($output = "{
                                    ""event"": $data,
                                    ""aws_ga_api_validated_flag"": true,
                                    ""aws_ga_api_requestId"": ""$context.requestId"",
                                    ""aws_ga_api_requestTimeEpoch"": $context.requestTimeEpoch,
                                    ""application_id"": ""$util.escapeJavaScript($input.params().path.get('applicationId'))""
                                  }" )
                                  {
                                    "Data": "$util.base64Encode($output)",
                                    "PartitionKey": "$event.event_id"
                                  }#if($foreach.hasNext),#end
                                  #set($i = $i + 1)
                                #end
                            ]
                        }
EOT
      }
    }
}

// API Gateway REST API
resource "aws_api_gateway_rest_api" "game_analytics_api" {
  name        = "${var.stack_name}-GameAnalyticsApi"
  description = "API Gateway for Game Analytics"
  body        = local.game_analytics_open_api_spec

  endpoint_configuration {
    types = ["EDGE"]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# API Gateway Deployment
resource "aws_api_gateway_deployment" "game_analytics_api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.game_analytics_api.id
  
  triggers = {
    redeployment = sha1(jsonencode(aws_api_gateway_rest_api.game_analytics_api.body))
  }

  lifecycle {
    create_before_destroy = true
  }
}

// API Gateway Stage
resource "aws_api_gateway_stage" "game_analytics_api_stage" {
  deployment_id        = aws_api_gateway_deployment.game_analytics_api_deployment.id
  rest_api_id          = aws_api_gateway_rest_api.game_analytics_api.id
  stage_name           = var.api_stage_name
  xray_tracing_enabled = true
}

// Metrics gathering Deploy Options
resource "aws_api_gateway_method_settings" "game_analytics_api_logging" {
  rest_api_id = aws_api_gateway_rest_api.game_analytics_api.id
  stage_name  = aws_api_gateway_stage.game_analytics_api_stage.stage_name
  method_path = "*/*"

  settings {
    logging_level      = "ERROR"
    metrics_enabled    = true
    data_trace_enabled = true
  }
}

# IAM Role for API Gateway to push logs to CloudWatch
resource "aws_iam_role" "api_gateway_cloudwatch_role" {
  name = "${var.stack_name}-ApiGatewayPushToCloudWatchRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch_policy" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
  role       = aws_iam_role.api_gateway_cloudwatch_role.name
}

# API Gateway Account Settings
resource "aws_api_gateway_account" "api_account" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch_role.arn
}

# Lambda permission for API Gateway to invoke ApplicationAdminService
resource "aws_lambda_permission" "application_admin_service_permission" {
  statement_id  = "ApplicationAdminServiceExecutionPermission"
  action        = "lambda:InvokeFunction"
  function_name = var.application_admin_service_function_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.game_analytics_api.execution_arn}/*/*/applications/*"
}

# Lambda permission for API Gateway to invoke Authorization Lambda
resource "aws_lambda_permission" "authorization_service_permission" {
  statement_id  = "AuthorizationServiceExecutionPermission"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_authorizer_arn
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.game_analytics_api.execution_arn}/*/*/applications/*"
}

resource "aws_iam_policy" "admin_api_access_policy" {
  name        = "${var.stack_name}-AdminAPIAccess"
  description = "Allow an IAM identity to perform administrator actions on the API for ${var.stack_name}"

  # Terraform's "jsonencode" function converts a
  # Terraform expression result to valid JSON syntax.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "execute-api:Invoke"
        Effect   = "Allow"
        Resource = "${aws_api_gateway_stage.game_analytics_api_stage.execution_arn}/*/*"
      },
    ]
  })
}
