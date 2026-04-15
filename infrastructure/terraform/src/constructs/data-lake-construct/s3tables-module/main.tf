data "aws_region" "current" {}

data "aws_caller_identity" "current" {}


resource "awscc_s3tables_table_bucket" "game_analytics_bucket" {
  table_bucket_name = var.stack_name
  encryption_configuration = {
    kms_key_arn   = null
    sse_algorithm = "AES256"
  }
  storage_class_configuration = {
    storage_class = "INTELLIGENT_TIERING"
  }
}

resource "aws_s3tables_namespace" "game_analytics_db" {
  namespace        = var.events_database_name
  table_bucket_arn = awscc_s3tables_table_bucket.game_analytics_bucket.table_bucket_arn
}

resource "awscc_s3tables_table" "event_data_table" {
  table_name        = var.raw_events_table_name
  namespace         = aws_s3tables_namespace.game_analytics_db.namespace
  table_bucket_arn  = awscc_s3tables_table_bucket.game_analytics_bucket.table_bucket_arn
  open_table_format = "ICEBERG"
  iceberg_metadata = {
    iceberg_schema = {
      schema_field_list = [
        {
          id       = 0
          name     = "event_id"
          type     = "string"
          required = true
        },
        {
          id       = 1
          name     = "event_type"
          type     = "string"
          required = true
        },
        {
          id       = 2
          name     = "event_name"
          type     = "string"
          required = true
        },
        {
          id       = 3
          name     = "event_version"
          type     = "string"
          required = true
        },
        {
          id       = 4
          name     = "event_timestamp"
          type     = "timestamp"
          required = true
        },
        {
          id       = 5
          name     = "app_version"
          type     = "string"
          required = true
        },
        {
          id       = 6
          name     = "application_id"
          type     = "string"
          required = true
        },
        {
          id       = 7
          name     = "application_name"
          type     = "string"
          required = true
        },
        {
          id       = 8
          name     = "event_data"
          type     = "string"
          required = true
        },
        {
          id       = 9
          name     = "metadata"
          type     = "string"
          required = true
        }
      ]
    }
    iceberg_partition_spec = {
      fields = [
        {
          name      = "application_id"
          source_id = 6
          transform = "identity"
        },
        {
          name      = "event_timestamp"
          source_id = 4
          transform = "day"
        }
      ]
    }
  }
}
