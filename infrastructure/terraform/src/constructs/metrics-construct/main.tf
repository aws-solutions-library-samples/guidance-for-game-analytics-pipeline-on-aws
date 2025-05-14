# Kinesis Analytics Errors Metric Filter
resource "aws_cloudwatch_log_metric_filter" "kinesis_analytics_errors_filter" {
  count = var.ingest_mode == "KINESIS_DATA_STREAMS" ? 1 : 0

  name           = "${var.stack_name}-KinesisAnalyticsErrorsFilter"
  pattern        = "{$.KinesisAnalyticsErrors > 0}"
  log_group_name = var.kinesis_analytics_log_group_name

  metric_transformation {
    name      = "${var.stack_name}-KinesisAnalyticsErrors"
    namespace = "${var.stack_name}/AWSGameAnalytics"
    value     = "$.KinesisAnalyticsErrors"
  }
}

# Kinesis Analytics Errors Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_analytics_errors_alarm" {
  count = var.ingest_mode == "KINESIS_DATA_STREAMS" ? 1 : 0

  alarm_name          = "${var.stack_name}-KinesisAnalyticsErrorsAlarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  datapoints_to_alarm = 1
  metric_name         = "KinesisAnalyticsErrors"
  namespace           = "${var.stack_name}/AWSGameAnalytics"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Kinesis Analytics Errors is > 0, as logged by the Analytics Processing function. Stack ${var.stack_name}"
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Streaming Analytics Lambda Errors Alarm
resource "aws_cloudwatch_metric_alarm" "streaming_analytics_lambda_errors_alarm" {
  count = var.ingest_mode == "KINESIS_DATA_STREAMS" ? 1 : 0

  alarm_name          = "StreamingAnalyticsLambdaErrorsAlarm (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  threshold           = 0
  datapoints_to_alarm = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  dimensions = {
    FunctionName = var.analytics_processing_function_name
  }
  alarm_description  = "Lambda Errors > 0, for stack ${var.stack_name} streaming analytics"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Streaming Analytics Lambda Throttles Alarm
resource "aws_cloudwatch_metric_alarm" "streaming_analytics_lambda_throttles_alarm" {
  count = var.ingest_mode == "KINESIS_DATA_STREAMS" ? 1 : 0

  alarm_name          = "StreamingAnalyticsLambdaThrottlesAlarm (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 0
  datapoints_to_alarm = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  dimensions = {
    FunctionName = var.analytics_processing_function_name
  }
  alarm_description  = "Lambda Throttles > 0, for stack ${var.stack_name} streaming analytics"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# DynamoDB Errors Alarm
resource "aws_cloudwatch_metric_alarm" "dynamodb_errors_alarm" {
  alarm_name          = "DynamoDBErrorsAlarm (${var.stack_name})"
  alarm_description  = "DynamoDB Errors > 0, for stack ${var.stack_name}"
  evaluation_periods  = 6
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  datapoints_to_alarm = 1
  treat_missing_data = "notBreaching"
  metric_query {
    id          = "e1"
    expression  = "SUM(METRICS())"
    label       = "DynamoDB Errors"
    return_data = "true"
  }
  dynamic "metric_query" {
    for_each = var.dynamodb_table_names
    content {
      id = "m${metric_query.key * 2}"
      metric {
        metric_name = "UserErrors"
        namespace   = "AWS/DynamoDB"
        period      = 300
        stat        = "Sum"
        dimensions = {
          TableName = metric_query.value
        }
      }
    }
  }
  dynamic "metric_query" {
    for_each = var.dynamodb_table_names
    content {
      id = "m${metric_query.key * 2 + 1}"
      metric {
        metric_name = "SystemErrors"
        namespace   = "AWS/DynamoDB"
        period      = 300
        stat        = "Sum"
        dimensions = {
          TableName = metric_query.value
        }
      }
    }
  }

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Metrics Stream for Real Time Read Provisioned Throughput Exceeded Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_metrics_read_provisioned_throughput_exceeded" {
  alarm_name          = "KinesisMetricStreamReadProvisionedThroughputExceeded (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadProvisionedThroughputExceeded"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  actions_enabled     = true
  dimensions = {
    StreamName = var.kinesis_metrics_stream_name
  }
  alarm_description  = "Kinesis stream is being throttled on reads and may need to be scaled to support more read throughput, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Metrics Stream for Real Time Write Provisioned Throughput Exceeded Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_metrics_write_provisioned_throughput_exceeded" {
  alarm_name          = "KinesisMetricStreamWriteProvisionedThroughputExceeded (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "WriteProvisionedThroughputExceeded"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  actions_enabled     = true
  dimensions = {
    StreamName = var.kinesis_metrics_stream_name
  }
  alarm_description  = "Kinesis stream is being throttled on writes and may need to be scaled to support more write throughput, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# DynamoDB Table Read Limit Alarms
resource "aws_cloudwatch_metric_alarm" "dynamodb_table_read_limit_alarm" {
  count = length(var.dynamodb_table_names)

  alarm_name          = "${var.dynamodb_table_names[count.index]}OnDemandTableReadLimitAlarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 90
  metric_query {
    id          = "e1"
    expression  = "((m1 / 300) / m2) * 100"
    label       = "TableReadsOverMaxReadLimit"
    return_data = "true"
  }
  metric_query {
    id = "m1"
    metric {
      metric_name = "ConsumedReadCapacityUnits"
      namespace   = "AWS/DynamoDB"
      period      = 300
      stat        = "SampleCount"
      dimensions = {
        TableName = var.dynamodb_table_names[count.index]
      }
    }
  }
  metric_query {
    id = "m2"
    metric {
      metric_name = "AccountMaxTableLevelReads"
      namespace   = "AWS/DynamoDB"
      period      = 300
      stat        = "Maximum"
    }
  }
  alarm_description = "Alarm when consumed table reads approach the account limit for ${var.dynamodb_table_names[count.index]}, for stack ${var.stack_name}"

  alarm_actions = [var.notifications_topic_arn]
}

# API Gateway 4XX Errors Alarm
resource "aws_cloudwatch_metric_alarm" "api_gateway_4xx_errors_alarm" {
  alarm_name          = "ApiGateway4XXErrorsAlarm-${var.stack_name}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 6
  threshold           = 1
  datapoints_to_alarm = 1
  actions_enabled = true
  metric_query {
    id          = "e1"
    expression  = "m1 / m2 * 100"
    label       = "4XX Error Rate"
    return_data = "true"
  }
  metric_query {
    id = "m1"
    metric {
      metric_name = "4XXError"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }
  metric_query {
    id = "m2"
    metric {
      metric_name = "Count"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }
  alarm_description  = "API Gateway 4XX Errors > 1%, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# API Gateway 5XX Errors Alarm
resource "aws_cloudwatch_metric_alarm" "api_gateway_5xx_errors_alarm" {
  alarm_name          = "ApiGateway5XXErrorsAlarm-${var.stack_name}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  datapoints_to_alarm = 1
  threshold           = 1
  metric_query {
    id          = "e1"
    expression  = "m1 / m2 * 100"
    label       = "5XX Error Rate"
    return_data = "true"
  }
  metric_query {
    id = "m1"
    metric {
      metric_name = "5XXError"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }
  metric_query {
    id = "m2"
    metric {
      metric_name = "Count"
      namespace   = "AWS/ApiGateway"
      period      = 300
      stat        = "Sum"
      dimensions = {
        ApiName = var.api_gateway_name
      }
    }
  }
  alarm_description  = "API Gateway 5XX Errors > 1%, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Firehose Failed Conversions Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_firehose_failed_conversions" {
  alarm_name          = "KinesisFirehoseFailedConversions (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FailedConversion.Records"
  namespace           = "AWS/Firehose"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  actions_enabled     = true
  dimensions = {
    DeliveryStreamName = var.firehose_delivery_stream_name
  }
  alarm_description  = "Alarm to track when Firehose Format Conversion fails, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Firehose S3 Data Freshness Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_firehose_s3_data_freshness" {
  alarm_name          = "KinesisFirehoseS3DataFreshness (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DeliveryToS3.DataFreshness"
  namespace           = "AWS/Firehose"
  period              = 300
  statistic           = "Average"
  threshold           = 900
  actions_enabled     = true
  dimensions = {
    DeliveryStreamName = var.firehose_delivery_stream_name
  }
  alarm_description  = "Alarm to track when age of oldest record delivered to S3 exceeds 15 minutes for two consecutive periods, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Read Provisioned Throughput Exceeded Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_read_provisioned_throughput_exceeded" {
  alarm_name          = "KinesisReadProvisionedThroughputExceeded (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadProvisionedThroughputExceeded"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  actions_enabled     = true
  dimensions = {
    StreamName = var.kinesis_stream_name
  }
  alarm_description  = "Kinesis stream is being throttled on reads and may need to be scaled to support more read throughput, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Kinesis Write Provisioned Throughput Exceeded Alarm
resource "aws_cloudwatch_metric_alarm" "kinesis_write_provisioned_throughput_exceeded" {
  alarm_name          = "KinesisWriteProvisionedThroughputExceeded (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "WriteProvisionedThroughputExceeded"
  namespace           = "AWS/Kinesis"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  actions_enabled     = true
  dimensions = {
    StreamName = var.kinesis_stream_name
  }
  alarm_description  = "Kinesis stream is being throttled on writes and may need to be scaled to support more write throughput, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Lambda Errors Alarm
resource "aws_cloudwatch_metric_alarm" "lambda_errors_alarm" {
  alarm_name          = "Lambda Errors (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6
  threshold           = 0
  datapoints_to_alarm = 1
  metric_query {
    id          = "e1"
    expression  = "SUM(METRICS())"
    label       = "Lambda Errors"
    return_data = "true"
  }
  dynamic "metric_query" {
    for_each = var.lambda_function_names
    content {
      id = "m${metric_query.key + 1}"
      metric {
        metric_name = "Errors"
        namespace   = "AWS/Lambda"
        period      = 300
        stat        = "Sum"
        dimensions = {
          FunctionName = metric_query.value
        }
      }
    }
  }
  alarm_description  = "Lambda Errors > 0, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}

# Lambda Throttles Alarm
resource "aws_cloudwatch_metric_alarm" "lambda_throttles_alarm" {
  alarm_name          = "Lambda Throttles > 0 (${var.stack_name})"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 0
  datapoints_to_alarm = 1
  metric_query {
    id          = "e1"
    expression  = "SUM(METRICS())"
    label       = "Lambda Throttles"
    return_data = "true"
  }
  dynamic "metric_query" {
    for_each = var.lambda_function_names
    content {
      id = "m${metric_query.key + 1}"
      metric {
        metric_name = "Throttles"
        namespace   = "AWS/Lambda"
        period      = 300
        stat        = "Sum"
        dimensions = {
          FunctionName = metric_query.value
        }
      }
    }
  }
  alarm_description  = "Lambda Throttles > 0, for stack ${var.stack_name}"
  treat_missing_data = "notBreaching"

  alarm_actions = [var.notifications_topic_arn]
}