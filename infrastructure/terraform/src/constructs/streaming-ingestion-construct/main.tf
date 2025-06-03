# CloudWatch Log Group and Streams for Firehose
resource "aws_cloudwatch_log_group" "firehose_log_group" {
  name = "${var.stack_name}-firehose-log-group"
  retention_in_days = var.cloudwatch_retention_days
}

resource "aws_cloudwatch_log_stream" "firehose_s3_delivery_log_stream" {
  name           = "${var.stack_name}-firehose-s3-delivery-log-stream"
  log_group_name = aws_cloudwatch_log_group.firehose_log_group.name
}

resource "aws_cloudwatch_log_stream" "firehose_backup_delivery_log_stream" {
  name           = "${var.stack_name}-firehose-backup-delivery-log-stream"
  log_group_name = aws_cloudwatch_log_group.firehose_log_group.name
}

# IAM Role for Kinesis Firehose
resource "aws_iam_role" "firehose_role" {
  name = "${var.stack_name}-games-events-firehose-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for Firehose Role
resource "aws_iam_role_policy" "firehose_delivery_policy" {
  name = "${var.stack_name}-firehose_delivery_policy"
  role = aws_iam_role.firehose_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "kinesis:DescribeStream",
          "kinesis:GetShardIterator",
          "kinesis:GetRecords",
          "kinesis:ListShards"
        ]
        Effect = "Allow"
        Resource = var.game_events_stream_arn
      },
      {
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Effect = "Allow"
        Resource = [
          var.analytics_bucket_arn,
          "${var.analytics_bucket_arn}/*"
        ]
      },
      {
        Action = [
          "lambda:InvokeFunction",
          "lambda:GetFunctionConfiguration"
        ]
        Effect = "Allow"
        Resource = var.events_processing_function_arn
      },
      {
        Action = [
          "glue:GetTable",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:GetSchema",
          "glue:GetSchemaVersion",
          "glue:CreateTable",
          "glue:UpdateTable",
          "glue:StartTransaction",
          "glue:CommitTransaction",
          "glue:GetDatabase",
        ]
        Effect = "Allow"
        Resource = [
          "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.game_events_database_name}/*",
          "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:database/${var.game_events_database_name}",
          "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog",
          "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:registry/*",
          "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:schema/*"
        ]
      },
      {
        Action = "logs:PutLogEvents"
        Effect = "Allow"
        Resource = aws_cloudwatch_log_group.firehose_log_group.arn
      }
    ]
  })
}

# Local variables
locals {
  s3_timestamp_prefix = "year=!{timestamp:YYYY}/month=!{timestamp:MM}/day=!{timestamp:dd}"
}

# Kinesis Firehose Delivery Stream
resource "aws_kinesis_firehose_delivery_stream" "game_events_firehose" {
  name        = "${var.stack_name}-game-events-firehose"
  destination = var.enable_apache_iceberg_support ? "iceberg" : "extended_s3"

  dynamic "kinesis_source_configuration" {
    for_each = var.ingest_mode == "KINESIS_DATA_STREAMS" ? [1] : []
    content {
      kinesis_stream_arn = var.game_events_stream_arn
      role_arn           = aws_iam_role.firehose_role.arn
    }
  }

  dynamic "iceberg_configuration" {
    for_each = var.enable_apache_iceberg_support ? [1] : []
    content {
      role_arn           = aws_iam_role.firehose_role.arn
      catalog_arn        = "arn:${data.aws_partition.current.partition}:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog"
      buffering_size     = 128
      buffering_interval   = var.dev_mode ? 60 : 900

      s3_configuration {
        role_arn = aws_iam_role.firehose_role.arn
        bucket_arn = var.analytics_bucket_arn // Replace with S3 table bucket later
      }

      destination_table_configuration {
        database_name = var.game_events_database_name
        table_name = var.raw_events_table_name
        s3_error_output_prefix = "firehose-errors/!{firehose:error-output-type}/"
        unique_keys = ["event_timestamp"]
      }

      cloudwatch_logging_options {
        enabled = true
        log_group_name = aws_cloudwatch_log_group.firehose_log_group.name
        log_stream_name = aws_cloudwatch_log_stream.firehose_s3_delivery_log_stream.name
      }

      s3_backup_mode = "FailedDataOnly"

      processing_configuration {
        enabled = true
        processors {
          type = "Lambda"
          parameters {
            parameter_name   = "LambdaArn"
            parameter_value  = var.events_processing_function_arn
          }
          parameters {
            parameter_name   = "BufferIntervalInSeconds"
            parameter_value  = "60"
          }
          parameters {
            parameter_name   = "BufferSizeInMBs"
            parameter_value  = "3"
          }
          parameters {
            parameter_name   = "NumberOfRetries"
            parameter_value  = "3"
          }
        }
      }
    }
  }

  dynamic "extended_s3_configuration" {
    for_each = var.enable_apache_iceberg_support ? [] : [1]
    content {
      role_arn           = aws_iam_role.firehose_role.arn
      bucket_arn         = var.analytics_bucket_arn
      prefix             = "${var.raw_events_prefix}/year=!{partitionKeyFromQuery:year}/month=!{partitionKeyFromQuery:month}/day=!{partitionKeyFromQuery:day}/"
      buffering_size     = 128
      compression_format = "UNCOMPRESSED"
      buffering_interval   = var.dev_mode ? 60 : 900
      error_output_prefix = "firehose-errors/!{firehose:error-output-type}/"
      dynamic_partitioning_configuration {
        enabled = true
      }
      processing_configuration {
        enabled = true
        processors {
          type = "Lambda"
          parameters {
            parameter_name   = "LambdaArn"
            parameter_value  = var.events_processing_function_arn
          }
          parameters {
            parameter_name   = "BufferIntervalInSeconds"
            parameter_value  = "60"
          }
          parameters {
            parameter_name   = "BufferSizeInMBs"
            parameter_value  = "3"
          }
          parameters {
            parameter_name   = "NumberOfRetries"
            parameter_value  = "3"
          }
        }
        processors {
          type = "MetadataExtraction"
          parameters {
            parameter_name   = "MetadataExtractionQuery"
            parameter_value  = "{year: .event_timestamp| strftime(\"%Y\"), month: .event_timestamp| strftime(\"%m\"), day: .event_timestamp| strftime(\"%d\")}"
          }
          parameters {
            parameter_name   = "JsonParsingEngine"
            parameter_value  = "JQ-1.6"
          }
        }
      }

      cloudwatch_logging_options {
        enabled = true
        log_group_name = aws_cloudwatch_log_group.firehose_log_group.name
        log_stream_name = aws_cloudwatch_log_stream.firehose_s3_delivery_log_stream.name
      }

      s3_backup_mode = var.s3_backup_mode ? "Enabled" : "Disabled"

      s3_backup_configuration {
        role_arn           = aws_iam_role.firehose_role.arn
        bucket_arn         = var.analytics_bucket_arn
        prefix             = "FirehoseS3SourceRecordBackup/${local.s3_timestamp_prefix}/"
        error_output_prefix = "FirehoseS3SourceRecordBackup/firehose-errors/${local.s3_timestamp_prefix}/!{firehose:error-output-type}/"
        compression_format = "GZIP"
        buffering_size        = 128
        buffering_interval    = 900
      }

      data_format_conversion_configuration {
        enabled = true
        input_format_configuration {
          deserializer {
            open_x_json_ser_de {
              case_insensitive = true
              convert_dots_in_json_keys_to_underscores = false
            }
          }
        }

        output_format_configuration {
          serializer {
            parquet_ser_de {
              compression = "SNAPPY"
            }
          }
        }

        schema_configuration {
          catalog_id    = data.aws_caller_identity.current.account_id
          role_arn      = aws_iam_role.firehose_role.arn
          database_name = var.game_events_database_name
          table_name    = var.raw_events_table_name
          region        = data.aws_region.current.name
          version_id    = "LATEST"
        }
      }
    }
  }
}

# Data sources
data "aws_partition" "current" {}
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
