data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

# Glue Database
resource "aws_glue_catalog_database" "game_events_database" {
  name        = "game_events_database"
  description = "Database for game analytics events for stack: ${var.stack_name}"
  location_uri = "s3://${var.analytics_bucket_name}"
}

// ---- Athena ---- //
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