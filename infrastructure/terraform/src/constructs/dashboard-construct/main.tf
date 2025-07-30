data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  // Title widget
  title_widget = {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n# **Game Analytics Pipeline - Operational Health**\nThis dashboard contains operational metrics for the Game Analytics Pipeline. Use these metrics to help you monitor the operational status of the AWS services used in the solution and track important application metrics.\n"
    }
  }

  // API Widget
  api_ingestion_widget = {
    "type": "metric",
    "width": 24,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Events Ingestion and Delivery",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/ApiGateway",
          "Count",
          "ApiName",
          "${var.api_gateway_name}",
          "Resource",
          "/applications/{applicationId}/events",
          "Stage",
          "${var.api_stage_name}",
          "Method",
          "POST",
          {
            "color": "#1f77b4",
            "label": "Events REST API Request Count"
          }
        ]
      ],
      "yAxis": {},
      "period": 60,
      "stat": "Sum"
    }
  }

  // KDS Widgets (If KDS Ingest Mode is enabled)
  stream_ingestion_title_widget = {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Kinesis Data Stream Ingestion \nThis section covers metrics related to ingestion of data into the solution's Events Stream and processing by Kinesis Data Streams. Use the metrics here to track data freshness/latency.\n",
    }
  }
  

  event_ingestion_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Events Ingestion and Delivery",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/Kinesis", 
          "IncomingRecords", 
          "StreamName",
          "${var.game_events_stream_name}",
          {
              "color": "#2ca02c",
              "label": "Events Stream Incoming Records (Kinesis)"
          }
        ]
      ],
      "yAxis": {},
      "period": 60,
      "stat": "Sum",
    }
  }

  stream_latency_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Events Stream Latency",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/Kinesis", 
          "PutRecord.Latency", 
          "StreamName",
          "${var.game_events_stream_name}",
          {
              "label": "PutRecord Write Latency"
          }
        ],
        [
          "AWS/Kinesis", 
          "PutRecords.Latency", 
          "StreamName",
          "${var.game_events_stream_name}",
          {
              "label": "PutRecords Write Latency"
          }
        ],
        [
          "AWS/Kinesis", 
          "GetRecords.Latency", 
          "StreamName",
          "${var.game_events_stream_name}",
          {
              "label": "Read Latency"
          }
        ],
        [
          "AWS/Kinesis", 
          "GetRecords.IteratorAgeMilliseconds", 
          "StreamName",
          "${var.game_events_stream_name}",
          {
              "label": "Consumer Iterator Age",
              "period": 60,
              "stat": "Maximum",
              "yAxis": "right"
          }
        ]
      ],
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": "Milliseconds"
        }
      },
      "period": 60,
      "stat": "Average"
    }
  }

  // Redshift Widgets (If Redshift Mode is enabled)

  redshift_title_widget = {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Redshift Serverless\nThis section covers metrics related to Redshift Serverless. Use the metrics here to track infrastructure and query performance.\n",
    }
  }

  redshift_queries_per_second_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Queries Completed Per Second",
      "region": "${data.aws_region.current.region}",
      "stacked": false,
      "metrics": [
        [
          "AWS/Redshift-Serverless", 
          "QueriesCompletedPerSecond", 
          "DatabaseName",
          "events",
          "Workgroup",
          "${var.redshift_workgroup_name}",
          "LatencyRange",
          "Short"
        ]
      ],
      "yAxis": {}
    }
  }

  redshift_database_connections_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Database Connections",
      "region": "${data.aws_region.current.region}",
      "stacked": false,
      "metrics": [
        [
          "AWS/Redshift-Serverless", 
          "DatabaseConnections", 
          "DatabaseName",
          "events",
          "Workgroup",
          "${var.redshift_workgroup_name}"
        ]
      ],
      "yAxis": {}
    }
  }

  redshift_query_execution_widget = {
    "type": "graph",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Query Planning / Execution",
      "region": "${data.aws_region.current.region}",
      "stacked": false,
      "metrics": [
        [
          "AWS/Redshift-Serverless", 
          "QueryRuntimeBreakdown",
          "stage",
          "QueryPlanning",
          "DatabaseName",
          "events",
          "Workgroup",
          "${var.redshift_workgroup_name}"
        ],
        [
          "AWS/Redshift-Serverless", 
          "QueryRuntimeBreakdown",
          "stage",
          "QueryExecutingRead",
          "DatabaseName",
          "events",
          "Workgroup",
          "${var.redshift_workgroup_name}"
        ]
      ],
      "yAxis": {}
    }
  }

  redshift_data_storage_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "singleValue",
      "title": "Data Storage",
      "region": "${data.aws_region.current.region}",
      "sparkline": true,
      "metrics": [
        [
          "AWS/Redshift-Serverless", 
          "DataStorage",
          "Namespace",
          "${var.redshift_namespace_db_name}"
        ]
      ]
    }
  }

  // Data Lake Mode Widgets (If Data Lake Mode is enabled)

  data_lake_title_widget = {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Stream Ingestion & Processing\nThis section covers metrics related to ingestion of data into the solution's Events Stream and processing by Kinesis Data Firehose and AWS Lambda Events Processing Function. Use the metrics here to track data freshness/latency and any issues with processor throttling/errors.\n",
    }
  }

  event_processing_health_widget = {
    "type": "metric",
    "width": 24,
    "height": 3,
    "properties": {
      "view": "singleValue",
      "title": "Events Processing Health",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/Firehose", 
          "DeliveryToS3.DataFreshness", 
          "DeliveryStreamName",
          "${var.game_events_stream_name}",
          {
              "label": "Data Freshness",
              "stat": "Maximum"
          }
        ],
        [
          "AWS/Firehose", 
          "DeliveryToS3.Records", 
          "DeliveryStreamName",
          "${var.game_events_stream_name}",
          {
              "color": "#17becf",
              "label": "Firehose Records Delivered to S3"
          }
        ],
        [
          "AWS/Lambda", 
          "Duration", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "label": "Lambda Duration"
          }
        ],
        [
          "AWS/Lambda", 
          "ConcurrentExecutions", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "label": "Lambda Concurrency",
              "stat": "Maximum"
          }
        ],
        [
          "AWS/Lambda", 
          "Throttles", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "label": "Lambda Throttles",
              "stat": "Sum"
          }
        ]
      ]
    }
  }

  ingestion_lambda_widget = {
    "type": "metric",
    "width": 24,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Event Transformation Lambda Error count and success rate (%)",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/Lambda", 
          "Errors", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "color": "#D13212",
              "label": "Errors"
          }
        ],
        [
          "AWS/Lambda", 
          "Invocations", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "label": "Invocations"
          }
        ],
        [
          {
            "label": "Success rate (%)",
            "expression": "100 - 100 * metricErrors / MAX([metricErrors, metricInvocations])",
            "yAxis": "right"
          }
        ],
        [
          "AWS/Lambda", 
          "Errors", 
          "FunctionName",
          "${var.events_processing_function}",
          "Resource",
          "${var.events_processing_function_arn}",
          {
              "stat": "Sum",
              "visible": false,
              "id": "metricErrors"
          }
        ],
        [
          "AWS/Lambda", 
          "Invocations", 
          "FunctionName",
          "${var.events_processing_function}",
          {
              "stat": "Sum",
              "visible": false,
              "id": "metricErrors"
          }
        ]
      ],
      "yAxis": {
        "left": {
          "showUnits": false,
          "label": ""
        },
        "right": {
          "max": 100,
          "label": "Percent",
          "showUnits": false
        }
      },
      "period": 60,
      "stat": "Sum"
    }
  }
  

  // Real time Widgets (If Real Time is enabled)
  realtime_title_widget = {
    "type": "text",
    "width": 24,
    "height": 2,
    "properties": {
      "markdown": "\n## Real-time Streaming Analytics\nThe below metrics can be used to monitor the real-time streaming SQL analytics of events. Use the Kinesis Data Analytics MillisBehindLatest metric to help you track the lag on the Kinesis SQL Application from the latest events. The Analytics Processing function that processes KDA application outputs can be tracked to measure function concurrency, success percentage, processing duration and throttles.\n"
    }
  }
  
  realtime_latency_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Managed Flink Records Intake",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          {
            "label": "Number of Records Recieved",
            "expression": "recInPerSec * 60 / 4"
          }
        ],
        [
          "AWS/KinesisAnalytics",
          "numRecordsInPerSecond",
          "Application",
          "${var.flink_app}",
          {
            "stat": "Sum",
            "visible": false,
            "id": "recInPerSec"
          }
        ],
        [
          {
            "label": "Number of Late Records Dropped",
            "expression": "recDroppedPerMin / 4"
          }
        ],
        [
          "AWS/KinesisAnalytics",
          "numLateRecordsDropped",
          "Application",
          "${var.flink_app}",
          {
            "stat": "Sum",
            "visible": false,
            "id": "recDroppedPerMin"
          }
        ]
      ],
      "yAxis": {
          "left": {
              "showUnits": false,
              "label": "Count"
          }
        },
        "period": 60
    }
  }

  flink_cpu_utilization_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Managed Flink Container CPU Utilization",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/KinesisAnalytics",
          "containerCPUUtilization",
          "Application",
          "${var.flink_app}"
        ]
      ],
      "annotations": {
        "horizontal": [
          {
            "value": 75,
            "label": "Scale Up Threshold",
            "color": "#d62728",
            "yAxis": "left"
          },
          {
            "value": 10,
            "label": "Scale Down Threshold",
            "color": "#2ca02c",
            "yAxis": "left"
          }
        ]
      },
      "yAxis": {
        "left": {
          "min": 1,
          "max": 100,
          "label": "Percent",
          "showUnits": false
        }
      },
      "period": 60
    }
  }
  
  realtime_health_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Managed Flink Container Resource Utilization",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/KinesisAnalytics",
          "containerMemoryUtilization",
          "Application",
          "${var.flink_app}"
        ],
        [
          "AWS/KinesisAnalytics",
          "containerDiskUtilization",
          "Application",
          "${var.flink_app}",
        ],
        [
          "AWS/KinesisAnalytics",
          "threadsCount",
          "Application",
          "${var.flink_app}",
          {
            "yAxis": "right"
          }
        ]
      ],
      "yAxis": {
        "left": {
          "min": 1,
          "max": 100,
          "label": "Percent",
          "showUnits": false
        }
      },
    }
  }

  opensearch_intake_widget = {
      "type": "metric",
      "width": 12,
      "height": 6,
      "properties": {
          "view": "timeSeries",
          "title": "OpenSearch Intake",
          "region": "${data.aws_region.current.region}",
          "metrics": [
              [
                  "AWS/AOSS",
                  "IngestionDocumentRate",
                  "ClientId",
                  data.aws_caller_identity.current.account_id,
                  "CollectionId",
                  var.collection_id,
                  "CollectionName",
                  var.collection_name
              ],
              [
                  "AWS/OSIS",
                  "${var.pipeline_name}.recordsProcessed.count",
                  "PipelineName",
                  var.pipeline_name
              ],
              [
                  "AWS/OSIS",
                  "${var.pipeline_name}.opensearch.documentsSuccess.count",
                  "PipelineName",
                  var.pipeline_name
              ],
              [
                  "AWS/AOSS",
                  "IngestionDocumentErrors",
                  "ClientId",
                  data.aws_caller_identity.current.account_id,
                  "CollectionId",
                  var.collection_id,
                  "CollectionName",
                  var.collection_name,
                  {
                      "yAxis": "right"
                  }
              ],
              [
                  "AWS/OSIS",
                  "${var.pipeline_name}.opensearch.documentErrors.count",
                  "PipelineName",
                  var.pipeline_name,
                  {
                      "yAxis": "right"
                  }
              ]
          ],
          "yAxis": {},
          "period": 60,
          "stat": "Average"
      }
  }
  
  metric_stream_latency_widget = {
    "type": "metric",
    "width": 12,
    "height": 6,
    "properties": {
      "view": "timeSeries",
      "title": "Metrics Stream Latency",
      "region": "${data.aws_region.current.region}",
      "metrics": [
        [
          "AWS/Kinesis",
          "PutRecord.Latency",
          "StreamName",
          "${var.metrics_stream_name}",
          {
            "label": "PutRecord Write Latency"
          }
        ],
        [
          "AWS/Kinesis",
          "PutRecords.Latency",
          "StreamName",
          "${var.metrics_stream_name}",
          {
            "label": "PutRecords Write Latency"
          }
        ],
        [
          "AWS/Kinesis",
          "GetRecords.Latency",
          "StreamName",
          "${var.metrics_stream_name}",
        {
          "label": "Read Latency"
        }
      ],
      [
        "AWS/Kinesis",
        "GetRecords.IteratorAgeMilliseconds",
        "StreamName",
        "${var.metrics_stream_name}",
        {
          "label": "Consumer Iterator Age",
          "period": 60,
          "stat": "Maximum",
          "yAxis": "right"
        }
      ]
    ],
    "yAxis": {
      "left": {
          "showUnits": false,
          "label": "Milliseconds"
      }
    },
    "period": 60,
    "stat": "Average"
    }
  }


  opensearch_latency_widget = {
      "type": "metric",
      "width": 12,
      "height": 6,
      "properties": {
          "view": "timeSeries",
          "title": "OpenSearch Latency",
          "region": "${data.aws_region.current.region}",
          "stacked": true,
          "metrics": [
              [
                  "AWS/AOSS",
                  "IngestionRequestLatency",
                  "ClientId",
                  data.aws_caller_identity.current.account_id,
                  "CollectionId",
                  var.collection_id,
                  "CollectionName",
                  var.collection_name
              ],
              [
                  "AWS/OSIS",
                  "${var.pipeline_name}.opensearch.EndToEndLatency.avg",
                  "PipelineName",
                  var.pipeline_name,
              ]
          ],
          "yAxis": {},
          "period": 60,
          "stat": "Average"
      }
  }
  
  widgets_list = [local.title_widget, local.api_ingestion_widget]
  kinesis_widgets = [local.stream_ingestion_title_widget, local.event_ingestion_widget, local.stream_latency_widget]
  redshift_widgets = [local.redshift_title_widget, local.redshift_queries_per_second_widget, local.redshift_database_connections_widget, local.redshift_query_execution_widget, local.redshift_data_storage_widget]
  datalake_widgets = [local.data_lake_title_widget, local.event_processing_health_widget, local.ingestion_lambda_widget]
  realtime_widgets = [local.realtime_title_widget, local.realtime_latency_widget, local.flink_cpu_utilization_widget, local.realtime_health_widget, local.opensearch_intake_widget, local.metric_stream_latency_widget,local.opensearch_latency_widget]

  combined_widgets_list = concat(
  local.widgets_list, 
  [for widget in local.kinesis_widgets: widget if var.ingest_mode == "KINESIS_DATA_STREAMS"],
  [for widget in local.redshift_widgets: widget if var.data_platform_mode == "REDSHIFT"],
  [for widget in local.realtime_widgets: widget if var.real_time_analytics == true])

  widgets = jsonencode(
  {
    "widgets": local.combined_widgets_list
  }
  )
}

resource "random_string" "stack_random_id_suffix" {
  length = 8
  special = false
}

resource "aws_cloudwatch_dashboard" "pipeline_ops_dashboard" {
  dashboard_name = "${var.workload_name}-PipelineOpsDashboard_${random_string.stack_random_id_suffix.result}"
  dashboard_body = local.widgets
}
