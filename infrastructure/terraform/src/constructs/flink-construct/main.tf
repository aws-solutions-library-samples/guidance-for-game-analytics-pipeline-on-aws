data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

// Input stream for applications
resource "aws_kinesis_stream" "metric_output_stream" {
  name        = "${var.stack_name}-MetricOutputStream-${var.suffix}"
  shard_count = var.stream_shard_count

  stream_mode_details {
    stream_mode = "PROVISIONED"
  }
}

resource "aws_s3_object" "flink_artifact" {
  bucket = var.analytics_bucket_name
  key    = "flink-scripts/${var.flink_deploy_artifact}"
  source = "${path.root}/../../../business-logic/flink-event-processing/target/${var.flink_deploy_artifact}"
}

# IAM roles for Flink
resource "aws_iam_role" "flink_app_role" {
  name = "${var.stack_name}-flink-app-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "kinesisanalytics.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "metric_processing_function_role_policy" {
  role = aws_iam_role.metric_processing_function_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStreamConsumer",
          "kinesis:RegisterStreamConsumer",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:DescribeLimits",
          "kinesis:ListStreamConsumers",
          "kinesis:SubscribeToShard"
        ]
        Effect   = "Allow"
        Resource = aws_kinesis_stream.game_events_stream.arn
      },
      {
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Effect   = "Allow"
        Resource = aws_kinesis_stream.metric_output_stream.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "flink_app_role_policy" {
  role = aws_iam_role.flink_app_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "s3:GetObject"
        Effect   = "Allow"
        Resource = aws_s3_object.flink_artifact.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "flink_app_role_access_policy" {
  role = aws_iam_role.flink_app_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "logs:DescribeLogGroups"
        Effect   = "Allow"
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:*"
      },
      {
        Action   = "logs:DescribeLogStreams"
        Effect   = "Allow"
        Resource = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:${aws_cloudwatch_log_group.flink_log_group.name}:log-stream:*"
      },
      {
        Action   = "logs:PutLogEvents"
        Effect   = "Allow"
        Resource = "${aws_cloudwatch_log_stream.flink_log_stream.arn}"
      },
      {
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:DescribeStreamConsumer",
          "kinesis:RegisterStreamConsumer",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:DescribeLimits",
          "kinesis:ListStreamConsumers",
          "kinesis:SubscribeToShard"
        ]
        Effect   = "Allow"
        Resource = aws_kinesis_stream.game_events_stream.arn
      },
      {
        Action = [
          "kinesis:DescribeStream",
          "kinesis:DescribeStreamSummary",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards",
          "kinesis:PutRecord",
          "kinesis:PutRecords"
        ]
        Effect   = "Allow"
        Resource = aws_kinesis_stream.metric_output_stream.arn
      }
    ]
  })
}

# Kinesis Analytics Log Group
resource "aws_cloudwatch_log_group" "flink_log_group" {
  name              = "/aws/kinesis-analytics/${var.stack_name}-AnalyticsApplication"
  retention_in_days = var.cloudwatch_retention_days
}

resource "aws_cloudwatch_log_stream" "flink_log_stream" {
  name           = "${var.stack_name}-kinesis-analytics-log-stream"
  log_group_name = aws_cloudwatch_log_group.flink_log_group.name
}

resource "aws_kinesisanalyticsv2_application" "managed_flink_app" {
  name                   = "${var.stack_name}-AnalyticsApplication"
  description            = "Real-time game analytics application, for ${var.stack_name}"
  runtime_environment    = "FLINK-1_20"
  service_execution_role = aws_iam_role.flink_app_role.arn

  cloudwatch_logging_options {
    log_stream_arn = aws_cloudwatch_log_stream.flink_log_stream.arn
  }

  application_configuration {

    flink_application_configuration {
      checkpoint_configuration {
        configuration_type = "DEFAULT"
      }

      monitoring_configuration {
        configuration_type = "CUSTOM"
        log_level          = "INFO"
        metrics_level      = "APPLICATION"
      }
    }

    application_code_configuration {
      code_content {
        s3_content_location {
          bucket_arn = var.analytics_bucket_arn
          file_key   = "flink-scripts/${var.flink_deploy_artifact}"
        }
      }

      code_content_type = "ZIPFILE"
    }

    environment_properties {
      property_group {
        property_group_id = "kinesis.analytics.flink.run.options"

        property_map = {
          "python"  = "main.py"
          "jarfile" = "lib/pyflink-dependencies.jar"
        }
      }

      property_group {
        property_group_id = "sourceConfig"

        property_map = {
          "kinesis.stream.arn"            = "${var.game_events_stream_arn}"
          "kinesis.stream.name"           = "${var.game_events_stream_name}"
          "aws.region"                    = "${data.aws_region.current.name}"
          "flink.stream.initpos"          = "LATEST"
          "flink.stream.max_record_count" = "10000"
          "kinesis.stream.interval"       = "500"
        }
      }

      property_group {
        property_group_id = "sinkConfig"

        property_map = {
          "kinesis.stream.arn" = aws_kinesis_stream.metric_output_stream.arn
          "aws.region"         = "${data.aws_region.current.name}"
        }
      }
    }
  }
}

