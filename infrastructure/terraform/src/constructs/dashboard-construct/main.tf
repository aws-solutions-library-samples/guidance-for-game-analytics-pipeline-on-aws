locals {
  // Title widget
  title_widget = <<-EOT
  {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n# **Game Analytics Pipeline - Operational Health**\nThis dashboard contains operational metrics for the Game Analytics Pipeline. Use these metrics to help you monitor the operational status of the AWS services used in the solution and track important application metrics.\n"
    }
  }
  EOT

  // Stream Ingestion Widgets
  stream_ingestion_title_widget = <<-EOT
  {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Stream Ingestion & Processing\nThis section covers metrics related to ingestion of data into the solution's Events Stream and processing by Kinesis Data Firehose and AWS Lambda Events Processing Function. Use the metrics here to track data freshness/latency and any issues with processor throttling/errors.\n"
    }
  }
  EOT

  event_processing_health_widget = <<-EOT
  {
    "type": "singleValue",
    "width": 12,
    "height": 3,
    "properties": {
      "metrics": [
        ["AWS/Firehose", "DeliveryToS3.DataFreshness", {
          "label": "Data Freshness",
          "period": 300,
          "stat": "Maximum",
          "dimensions": {
            "DeliveryStreamName": "${var.game_events_firehose_name}"
          }
        }],
        ["AWS/Lambda", "Duration", {
          "label": "Lambda Duration",
          "period": 300,
          "stat": "Average",
          "dimensions": {
            "FunctionName": "${var.events_processing_function}"
          }
        }],
        ["AWS/Lambda", "ConcurrentExecutions", {
          "label": "Lambda Concurrency",
          "period": 300,
          "stat": "Maximum",
          "dimensions": {
            "FunctionName": "${var.events_processing_function}"
          }
        }],
        ["AWS/Lambda", "Throttles", {
          "label": "Lambda Throttles",
          "period": 300,
          "stat": "Sum",
          "dimensions": {
            "FunctionName": "${var.events_processing_function}"
          }
        }]
      ],
      "title": "Events Processing Health",
      "region": "${data.aws_region.current.name}"
    }
  }
  EOT

  // Remember to add widgets for MSK
  event_ingestion_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/Kinesis", "IncomingRecords", {
          "label": "Events Stream Incoming Records (Kinesis)",
          "color": "#2ca02c",
          "dimensions": {
            "StreamName": "${var.game_events_stream_name}"
          }
        }],
        ["AWS/Firehose", "DeliveryToS3.Records", {
          "label": "Firehose Records Delivered to S3",
          "color": "#17becf",
          "dimensions": {
            "DeliveryStreamName": "${var.game_events_firehose_name}"
          }
        }],
        ["AWS/ApiGateway", "Count", {
          "label": "Events REST API Request Count",
          "color": "#1f77b4",
          "dimensions": {
            "ApiName": "${var.api_gateway_name}",
            "Resource": "/applications/{applicationId}/events",
            "Stage": "${var.api_stage_name}",
            "Method": "POST"
          }
        }]
      ],
      "title": "Events Ingestion and Delivery",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "stat": "Sum",
      "stacked": false,
      "yAxis": {
        "left": {
          "label": "Count",
          "showUnits": false
        }
      }
    }
  }
  EOT

  ingestion_lambda_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/Lambda", "Errors", {
          "label": "Errors",
          "color": "#D13212",
          "dimensions": {
            "FunctionName": "${var.events_processing_function}"
          }
        }],
        ["AWS/Lambda", "Invocations", {
          "label": "Invocations",
          "dimensions": {
            "FunctionName": "${var.events_processing_function}"
          }
        }],
        [{ 
          "expression": "100 - 100 * errors / MAX([errors, invocations])", 
          "label": "Success rate (%)",
          "id": "availability", 
          "yAxis": "right", 
          "region": "${data.aws_region.current.name}"
        }]
      ],
      "title": "Lambda Error count and success rate (%)",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "stat": "Sum",
      "stacked": false,
      "yAxis": {
        "right": {
          "max": 100,
          "label": "Percent",
          "showUnits": false
        },
        "left": {
          "showUnits": false,
          "label": ""
        }
      }
    }
  }
  EOT

  stream_latency_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/Kinesis", "PutRecord.Latency", {
          "label": "PutRecord Write Latency",
          "dimensions": {
            "FunctionName": "${var.game_events_stream_name}"
          }
        }],
        ["AWS/Kinesis", "PutRecords.Latency", {
          "label": "PutRecords Write Latency",
          "dimensions": {
            "FunctionName": "${var.game_events_stream_name}"
          }
        }],
        ["AWS/Kinesis", "GetRecords.Latency", {
          "label": "Read Latency",
          "dimensions": {
            "FunctionName": "${var.game_events_stream_name}"
          }
        }],
        ["AWS/Kinesis", "GetRecords.IteratorAgeMilliseconds", {
          "label": "Consumer Iterator Age",
          "period": 60,
          "stat": "Maximum",
          "yAxis": "right",
          "dimensions": {
            "FunctionName": "${var.game_events_stream_name}"
          }
        }]
      ],
      "title": "Events Stream Latency",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "stat": "Average",
      "stacked": false,
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Milliseconds"
        }
      }
    }
  }
  EOT

  // Real-time widgets
  realtime_title_widget = <<-EOT
  {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Real-time Streaming Analytics\nThe below metrics can be used to monitor the real-time streaming SQL analytics of events. Use the Kinesis Data Analytics MillisBehindLatest metric to help you track the lag on the Kinesis SQL Application from the latest events. The Analytics Processing function that processes KDA application outputs can be tracked to measure function concurrency, success percentage, processing duration and throttles.\n"
    }
  }
  EOT
  
  realtime_health_widget = <<-EOT
  {
    "type": "singleValue",
    "width": 12,
    "height": 3,
    "properties": {
      "metrics": [
        ["AWS/Lambda", "ConcurrentExecutions", {
          "label": "Metrics Processing Lambda Concurrent Executions",
          "stat": "Maximum",
          "dimensions": {
            "DeliveryStreamName": "${var.analytics_processing_function}"
          }
        }],
        ["AWS/Lambda", "Duration", {
          "label": "Lambda Duration",
          "stat": "Average",
          "dimensions": {
            "FunctionName": "${var.analytics_processing_function}"
          }
        }],
        ["AWS/Lambda", "Throttles", {
          "label": "Lambda Throttles",
          "dimensions": {
            "FunctionName": "${var.analytics_processing_function}"
          }
        }],
        ["AWS/KinesisAnalytics", "KPUs", {
          "label": "Managed Flink KPUs",
          "stat": "Maximum",
          "period": 7200,
          "dimensions": {
            "Application": "${var.flink_app}"
          }
        }]
      ],
      "title": "Real-time Analytics Health",
      "region": "${data.aws_region.current.name}"
    }
  }
  EOT

  realtime_latency_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/KinesisAnalytics", "numRecordsInPerSecond", {
          "label": "recinpersec",
          "period": 60,
          "stat": "Sum",
          "dimensions": {
            "FunctionName": "${var.flink_app}"
          }
        }],
        ["AWS/KinesisAnalytics", "numLateRecordsDropped", {
          "label": "recdroppedpermin",
          "period": 60,
          "stat": "Sum",
          "dimensions": {
            "FunctionName": "${var.flink_app}"
          }
        }],
        [{ 
          "expression": "recInPerSec * 60 / 4", 
          "label": "Number of Records Recieved",
          "id": "numRecRecieved", 
          "region": "${data.aws_region.current.name}"
        }],
        [{ 
          "expression": "recDroppedPerMin / 4", 
          "label": "Number of Late Records Dropped",
          "id": "recDroppedPerMin", 
          "region": "${data.aws_region.current.name}"
        }]
      ],
      "title": "Managed Flink Records Intake",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Count"
        }
      }
    }
  }
  EOT

  flink_cpu_utilization_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/KinesisAnalytics", "containerCPUUtilization", {
          "dimensions": {
            "DeliveryStreamName": "${var.flink_app}"
          }
        }]
      ],
      "title": "Managed Flink Container CPU Utilization",
      "period": 60,
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Percent",
          "min": 1,
          "max": 100
        }
      },
      "annotations": {
         "left": [
            {
               "color": "#d62728",
               "label": "Scale Up Threshold",
               "value": 75
            },
            {
               "color": "#2ca02c",
               "label": "Scale Down Threshold",
               "value": 10
            }
         ]
      },
      "region": "${data.aws_region.current.name}"
    }
  }
  EOT

  flink_resource_utilization_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/KinesisAnalytics", "containerMemoryUtilization", {
          "dimensions": {
            "FunctionName": "${var.flink_app}"
          }
        }],
        ["AWS/KinesisAnalytics", "containerDiskUtilization", {
          "dimensions": {
            "FunctionName": "${var.flink_app}"
          }
        }],
        ["AWS/KinesisAnalytics", "threadsCount", {
          "dimensions": {
            "FunctionName": "${var.flink_app}"
          }
        }]
      ],
      "title": "Managed Flink Container Resource Utilization",
      "region": "${data.aws_region.current.name}",
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Percent",
          "min": 1,
          "max": 100
        }
      }
    }
  }
  EOT

  realtime_lambda_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/Lambda", "Errors", {
          "label": "Errors",
          "color": "#D13212",
          "dimensions": {
            "FunctionName": "${var.analytics_processing_function}"
          }
        }],
        ["AWS/Lambda", "Invocations", {
          "label": "Invocations",
          "dimensions": {
            "FunctionName": "${var.analytics_processing_function}"
          }
        }],
        [{ 
          "expression": "100 - 100 * errors / MAX([errors, invocations])", 
          "label": "Success rate (%)",
          "id": "availability", 
          "yAxis": "right", 
          "region": "${data.aws_region.current.name}"
        }]
      ],
      "title": "Metrics Processing Lambda Error count and success rate (%)",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "stat": "Sum",
      "stacked": false,
      "yAxis": {
        "right": {
          "max": 100,
          "label": "Percent",
          "showUnits": false
        },
        "left": {
          "showUnits": false,
          "label": ""
        }
      }
    }
  }
  EOT

  metric_stream_latency_widget = <<-EOT
  {
    "type": "graph",
    "width": 8,
    "height": 6,
    "properties": {
      "metrics": [
        ["AWS/Kinesis", "PutRecord.Latency", {
          "label": "PutRecord Write Latency",
          "dimensions": {
            "FunctionName": "${var.metrics_stream_name}"
          }
        }],
        ["AWS/Kinesis", "PutRecords.Latency", {
          "label": "PutRecords Write Latency",
          "dimensions": {
            "FunctionName": "${var.metrics_stream_name}"
          }
        }],
        ["AWS/Kinesis", "GetRecords.Latency", {
          "label": "Read Latency",
          "dimensions": {
            "FunctionName": "${var.metrics_stream_name}"
          }
        }],
        ["AWS/Kinesis", "GetRecords.IteratorAgeMilliseconds", {
          "label": "Consumer Iterator Age",
          "period": 60,
          "stat": "Maximum",
          "yAxis": "right",
          "dimensions": {
            "FunctionName": "${var.metrics_stream_name}"
          }
        }]
      ],
      "title": "Metrics Stream Latency",
      "region": "${data.aws_region.current.name}",
      "period": 60,
      "stat": "Average",
      "stacked": false,
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Milliseconds"
        }
      }
    }
  }
  EOT


  widgets_without_analytics = <<-EOT
  {
    "widgets": [
      ${local.title_widget},
      ${local.event_processing_health_widget},
      ${local.stream_ingestion_title_widget},
      [${local.event_ingestion_widget}, ${local.ingestion_lambda_widget}, ${local.stream_latency_widget}]
    ]
  }
  EOT

  widgets_with_analytics = <<-EOT
  {
    "widgets": [
      ${local.title_widget},
      ${local.event_processing_health_widget},
      ${local.stream_ingestion_title_widget},
      [${local.event_ingestion_widget}, ${local.ingestion_lambda_widget}, ${local.stream_latency_widget}],
      ${local.realtime_title_widget},
      [${local.realtime_latency_widget}, ${local.flink_cpu_utilization_widget}, ${local.flink_resource_utilization_widget}],
      [${local.metric_stream_latency_widget}, ${local.realtime_lambda_widget}]
    ]
  }
  EOT

  widgets = var.ingest_mode == "REAL_TIME_KDS" ? local.widgets_with_analytics : local.widgets_without_analytics
}

resource "aws_cloudwatch_dashboard" "pipeline_ops_dashboard" {
  dashboard_name = "${var.workload_name}-PipelineOpsDashboard_${var.workload_name}_${random_string.stack-random-id-suffix.result}" // Need to output this and then properly propagate to the upstream stack
  dashboard_body = local.widgets
}
