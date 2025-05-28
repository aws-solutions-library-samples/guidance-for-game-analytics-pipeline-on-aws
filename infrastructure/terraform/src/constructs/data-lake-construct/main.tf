data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Glue Database
resource "aws_glue_catalog_database" "game_events_database" {
  name        = "game_events_database"
  description = "Database for game analytics events for stack: ${var.stack_name}"
  location_uri = "s3://${var.analytics_bucket_name}"
}

resource "aws_glue_data_catalog_encryption_settings" "data_catalog_encryption_settings" {
  data_catalog_encryption_settings {
    connection_password_encryption {
      return_connection_password_encrypted = true
    }

    encryption_at_rest {
      catalog_encryption_mode         = "SSE-KMS"
    }
  }
}

# Glue Table for raw events
resource "aws_glue_catalog_table" "raw_events_table" {
  name          = var.raw_events_table_name
  database_name = aws_glue_catalog_database.game_events_database.name
  description = "Stores raw event data from the game analytics pipeline for stack ${var.stack_name}"
  table_type = "EXTERNAL_TABLE"
  
  parameters = {
    classification   = "parquet"
    compressionType  = "none"
    typeOfData       = "file"
  }
  
  dynamic open_table_format_input {
    for_each = var.enable_apache_iceberg_support ? [1] : []
    content {
      iceberg_input {
        metadata_operation = "CREATE"
        version = "2"
      }
    }
  }

  storage_descriptor {
    location      = "s3://${var.analytics_bucket_name}/${var.raw_events_prefix}"
    input_format  = var.enable_apache_iceberg_support ? null : "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format = var.enable_apache_iceberg_support ? null : "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"
    compressed = var.enable_apache_iceberg_support ? null : false
    number_of_buckets = var.enable_apache_iceberg_support ? null : -1
    
    dynamic ser_de_info {
      for_each = var.enable_apache_iceberg_support ? [] : [1]
      content {
        name                  = "ParquetHiveSerDe"
        serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
        
        parameters = {
          "serialization.format" = 1
        }
      }
    }

    bucket_columns = var.enable_apache_iceberg_support ? null : []
    stored_as_sub_directories = false
    columns {
      name = "event_id"
      type = "string"
    }
    columns {
      name = "event_type"
      type = "string"
    }
    columns {
      name = "event_name"
      type = "string"
    }
    columns {
      name = "event_version"
      type = "string"
    }
    columns {
      name = "event_timestamp"
      type = "bigint"
    }
    columns {
      name = "app_version"
      type = "string"
    }
    columns {
      name = "application_id"
      type = "string"
    }
    columns {
      name = "application_name"
      type = "string"
    }
    columns {
      name = "event_data"
      type = "string"
    }
    columns {
      name = "metadata"
      type = "string"
    }
  }
}

// Define the resources for the `GameAnalyticsWorkgroup` Athena workgroup
resource "aws_athena_workgroup" "game_analytics_workgroup" {
  name        = "${local.config.WORKLOAD_NAME}-GameAnalyticsWorkgroup-${random_string.stack-random-id-suffix.result}"
  description = "Default workgroup for the solution workload"
  force_destroy = true

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true

    result_configuration {
      output_location = "s3://${aws_s3_bucket.analytics_bucket.id}/athena_query_results/"

      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }
}

### IAM Role for Glue ETL Job
resource "aws_iam_role" "game_events_etl_role" {
  name = "${var.stack_name}-GameEventsEtlRole"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "glue.amazonaws.com"
        }
      }
    ]
  })
}

# Attach AWSGlueServiceRole managed policy to Glue ETL Job
resource "aws_iam_role_policy_attachment" "glue_service_role_attachment" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
  role       = aws_iam_role.game_events_etl_role.name
}

# IAM Policy for S3 access for Glue ETL Job
resource "aws_iam_role_policy" "etl_s3_access_policy" {
  role = aws_iam_role.game_events_etl_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.analytics_bucket_name}",
          "arn:aws:s3:::${var.analytics_bucket_name}/*"
        ]
      }
    ]
  })
}

# IAM Policy for Glue Table access for Glue ETL Job
resource "aws_iam_role_policy" "etl_glue_table_access_policy" {
  role = aws_iam_role.game_events_etl_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GlueTableAccess"
        Effect = "Allow"
        Action = [
          "glue:BatchGetPartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchCreatePartition",
          "glue:CreatePartition",
          "glue:CreateTable",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:UpdatePartition",
          "glue:UpdateTable"
        ]
        Resource = [
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.game_events_database.name}/*",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.game_events_database.name}"
        ]
      }
    ]
  })
}

# IAM Policy for Glue Database access for Glue ETL Job
resource "aws_iam_role_policy" "etl_glue_database_access_policy" {
  role = aws_iam_role.game_events_etl_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GlueDBAccess"
        Effect = "Allow"
        Action = [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:UpdateDatabase",
        ]
        Resource = [
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.game_events_database.name}"
        ]
      }
    ]
  })
}

# IAM Policy for KMS access for Glue ETL Job
resource "aws_iam_role_policy" "etl_kms_access_policy" {
  role = aws_iam_role.game_events_etl_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KMSAccess"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
        ]
        Resource = [
          "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/glue",
        ]
      }
    ]
  })
}

### IAM Role for Glue Crawler
resource "aws_iam_role" "glue_crawler_role" {
  name = "${var.stack_name}-GlueCrawlerRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "glue.amazonaws.com"
        }
      }
    ]
  })
}

# Attach AWSGlueServiceRole managed policy to Glue Crawler
resource "aws_iam_role_policy_attachment" "glue_service" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"
  role       = aws_iam_role.glue_crawler_role.name
}

# IAM Policy for S3 access for Glue Crawler
resource "aws_iam_role_policy" "crawler_s3_access_policy" {
  role = aws_iam_role.glue_crawler_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.analytics_bucket_name}",
          "arn:aws:s3:::${var.analytics_bucket_name}/*"
        ]
      }
    ]
  })
}

# IAM Policy for Glue Table access for Glue Crawler
resource "aws_iam_role_policy" "crawler_glue_table_access_policy" {
  role = aws_iam_role.glue_crawler_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GlueTableAccess"
        Effect = "Allow"
        Action = [
          "glue:BatchGetPartition",
          "glue:GetPartition",
          "glue:GetPartitions",
          "glue:BatchCreatePartition",
          "glue:CreatePartition",
          "glue:CreateTable",
          "glue:GetTable",
          "glue:GetTables",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
          "glue:UpdatePartition",
          "glue:UpdateTable"
        ]
        Resource = [
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${aws_glue_catalog_database.game_events_database.name}/*",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.game_events_database.name}"
        ]
      }
    ]
  })
}

# IAM Policy for Glue Database access for Glue Crawler
resource "aws_iam_role_policy" "crawler_glue_database_access_policy" {
  role = aws_iam_role.glue_crawler_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "GlueDBAccess"
        Effect = "Allow"
        Action = [
          "glue:GetDatabase",
          "glue:GetDatabases",
          "glue:UpdateDatabase",
        ]
        Resource = [
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:catalog",
          "arn:aws:glue:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:database/${aws_glue_catalog_database.game_events_database.name}"
        ]
      }
    ]
  })
}

# IAM Policy for KMS access for Glue Crawler
resource "aws_iam_role_policy" "crawler_kms_access_policy" {
  role = aws_iam_role.glue_crawler_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KMSAccess"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey",
        ]
        Resource = [
          "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/glue",
        ]
      }
    ]
  })
}

# IAM Policy for CloudWatch Logs access for Glue Crawler
resource "aws_iam_role_policy" "crawler_cloudwatch_logs_access_policy" {
  role = aws_iam_role.glue_crawler_role.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LogAccess"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = [
          "arn:*:logs:*:*:/aws-glue/*",
        ]
      }
    ]
  })
}

# Glue ETL Job
resource "aws_glue_job" "game_events_etl_job" {
  name     = "${var.stack_name}-GameEventsEtlJob"
  description = "Etl job for processing raw game event data, for stack ${var.stack_name}."
  
  glue_version = "4.0"
  max_retries  = 0
  max_capacity = 10
  timeout      = 30

  execution_property {
    max_concurrent_runs = 1
  }

  command {
    name = "glueetl"
    python_version = "3"
    script_location = "s3://${var.analytics_bucket_name}/glue-scripts/game_events_etl.py"
  }

  role_arn = aws_iam_role.game_events_etl_role.arn

  default_arguments = {
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--enable-glue-datacatalog"          = "true"
    "--database_name"                    = aws_glue_catalog_database.game_events_database.name
    "--raw_events_table_name"            = var.raw_events_table_name
    "--analytics_bucket"                 = "s3://${var.analytics_bucket_name}/"
    "--processed_data_prefix"            = var.processed_events_prefix
    "--glue_tmp_prefix"                  = var.glue_tmp_prefix
    "--job-bookmark-option"              = "job-bookmark-enable"
    "--TempDir"                          = "s3://${var.analytics_bucket_name}/${var.glue_tmp_prefix}"
  }
  
}

# Glue Iceberg Conversion Job
resource "aws_glue_job" "game_events_etl_iceberg_job" {
  name     = "${var.stack_name}-IcebergEtl"
  description = "Etl job for processing existing raw game event data, for stack ${var.stack_name} to Apache Iceberg table."
  
  glue_version = "5.0"
  max_retries  = 0
  max_capacity = 10
  timeout      = 30

  execution_property {
    max_concurrent_runs = 1
  }

  command {
    name = "glueetl"
    python_version = "3"
    script_location = "s3://${var.analytics_bucket_name}/glue-scripts/convert_game_events_to_iceberg.py"
  }

  role_arn = aws_iam_role.game_events_etl_role.arn

  default_arguments = {
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--enable-glue-datacatalog"          = "true"
    "--datalake-formats"                 = "iceberg"
    "--database_name"                    = "iceberg_db"
    "--raw_events_table_name"            = var.raw_events_table_name
    "--iceberg_events_table_name"        = "${var.raw_events_table_name}_iceberg"
    "--analytics_bucket"                 = "s3://${var.analytics_bucket_name}/"
    "--iceberg_bucket"                   = "s3://your_bucket_here/"
    "--processed_data_prefix"            = var.processed_events_prefix
    "--glue_tmp_prefix"                  = var.glue_tmp_prefix
    "--job-bookmark-option"              = "job-bookmark-enable"
    "--TempDir"                          = "s3://${var.analytics_bucket_name}/${var.glue_tmp_prefix}"
    "--conf" = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO --conf spark.sql.catalog.glue_catalog.warehouse=file:///tmp/spark-warehouse"
  }
  
}

# Glue Crawler
resource "aws_glue_crawler" "events_crawler" {
  database_name = aws_glue_catalog_database.game_events_database.name
  name          = "${var.stack_name}-EventsCrawler"
  role          = aws_iam_role.glue_crawler_role.arn
  description = "AWS Glue Crawler for partitioned data, for stack ${var.stack_name}"
  
  s3_target {
    path = "s3://${var.analytics_bucket_name}/${var.processed_events_prefix}"
  }
  
  schema_change_policy {
    delete_behavior = "LOG"
    update_behavior = "UPDATE_IN_DATABASE"
  }

  configuration = <<-EOT
    {
      "Version":1.0,
      "CrawlerOutput":{
        "Partitions":{
          "AddOrUpdateBehavior":"InheritFromTable"
        },
        "Tables":{
          "AddOrUpdateBehavior":"MergeNewColumns"
        }
      }
    }
  EOT
}

# Glue Workflow
resource "aws_glue_workflow" "game_events_workflow" {
  name = "${var.stack_name}-GameEventsWorkflow"
  description = "Orchestrates a Glue ETL Job and Crawler to process data in S3 and update data catalog, for stack ${var.stack_name}"
  default_run_properties = {
    "--enable-metrics"                   = "true"
    "--enable-continuous-cloudwatch-log" = "true"
    "--enable-glue-datacatalog"          = "true"
    "--database_name"                    = aws_glue_catalog_database.game_events_database.name
    "--raw_events_table_name"            = aws_glue_catalog_table.raw_events_table.name
    "--analytics_bucket"                 = "s3://${var.analytics_bucket_name}/"
    "--processed_data_prefix"            = var.processed_events_prefix
    "--glue_tmp_prefix"                  = var.glue_tmp_prefix
    "--job-bookmark-option"              = "job-bookmark-enable"
    "--TempDir"                          = "s3://${var.analytics_bucket_name}/${var.glue_tmp_prefix}"
  }
}

# Glue Trigger for Crawler
resource "aws_glue_trigger" "game_events_crawler_trigger" {
  name          = "${var.stack_name}-GameEventsCrawlerTrigger"
  type          = "CONDITIONAL"
  workflow_name = aws_glue_workflow.game_events_workflow.name
  description = "Starts a crawler to update the Glue Data Catalog with any changes detected in the processed_events S3 prefix after the ETL job runs, for stack ${var.stack_name}"
  start_on_creation = true
  actions {
    crawler_name = aws_glue_crawler.events_crawler.name
  }
  
  predicate {
    conditions {
      logical_operator = "EQUALS"
      job_name = aws_glue_job.game_events_etl_job.name
      state    = "SUCCEEDED"
    }
  }
}

# Glue Trigger for ETL Job
resource "aws_glue_trigger" "game_events_etl_job_trigger" {
  name          = "${var.stack_name}-GameEventsTriggerETLJob"
  type          = "SCHEDULED"
  description = "Triggers the start of ETL job to process raw_events, for stack ${var.stack_name}."
  workflow_name = aws_glue_workflow.game_events_workflow.name
  schedule = "cron(0 * * * ? *)"
  
  actions {
    job_name = aws_glue_job.game_events_etl_job.name
  }
}

# CloudWatch Event Rule that starts ETL Job
resource "aws_cloudwatch_event_rule" "etl_job_status_events" {
  name        = "${var.stack_name}-EtlJobStatusEvents"
  description = "CloudWatch Events Rule for generating status events for the Glue ETL Job for ${var.stack_name}"
  
  event_pattern = jsonencode({
    source      = ["aws.glue"]
    detail-type = ["Glue Job State Change"]
    detail      = {
      jobName = [aws_glue_job.game_events_etl_job.name]
    }
  })
}

resource "aws_cloudwatch_event_target" "etl_job_status_events_target" {
  rule      = aws_cloudwatch_event_rule.etl_job_status_events.name
  target_id = "SendToSNS"
  arn       = var.notifications_topic_arn
}

# CloudWatch Event Rule for Glue Crawler Status
resource "aws_cloudwatch_event_rule" "glue_crawler_status_events" {
  name        = "${var.stack_name}-GlueCrawlerStatusEvents"
  description = "CloudWatch Events Rule for generating status events for Glue Crawler for stack ${var.stack_name}"
  
  event_pattern = jsonencode({
    source      = ["aws.glue"]
    detail-type = ["Glue Crawler State Change"]
    detail      = {
      crawlerName = [aws_glue_crawler.events_crawler.name]
    }
  })
}

resource "aws_cloudwatch_event_target" "glue_crawler_status_events_target" {
  rule      = aws_cloudwatch_event_rule.glue_crawler_status_events.name
  target_id = "SendToSNS"
  arn       = var.notifications_topic_arn
}