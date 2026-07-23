/**
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the 'License').
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the 'license' file accompanying this file. This file is distributed
 * on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# -----------------------------------------------------------------------------
# Local Variables
# -----------------------------------------------------------------------------

locals {
  // Read the same config used to deploy the pipeline
  pipeline_config = yamldecode(file("${path.module}/../../infrastructure/config.yaml"))
  samples_config  = yamldecode(file("${path.module}/../config.yaml"))

  // Read the bootstrap output from quicksuite-bootstrap
  bootstrap_output = yamldecode(file("${path.module}/../quicksuite-bootstrap/bootstrap-output.yaml"))

  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.region
  partition  = data.aws_partition.current.partition

  workload_name    = local.pipeline_config.WORKLOAD_NAME
  events_database  = local.pipeline_config.EVENTS_DATABASE
  raw_events_table = local.pipeline_config.RAW_EVENTS_TABLE

  // Read values from bootstrap output
  analytics_bucket_name = local.samples_config.ANALYTICS_BUCKET_NAME
  gap_data_source_arn   = local.bootstrap_output.GAP_DATA_SOURCE_ARN
  gap_folder_id         = local.bootstrap_output.GAP_FOLDER_ID

  // Calculate the Glue ETL role ARN from the infrastructure deployment
  // Role name format: ${stack_name}-GameEventsEtlRole where stack_name is WORKLOAD_NAME
  glue_etl_role_arn = "arn:${local.partition}:iam::${local.account_id}:role/${local.workload_name}-GameEventsEtlRole"

  // Determine if data lake mode is enabled (DATA_LAKE) vs Redshift
  is_data_lake_mode = local.pipeline_config.DATA_STACK == "DATA_LAKE"

  // Redshift workgroup name (used when DATA_STACK == "REDSHIFT")
  redshift_workgroup_name = "${lower(local.pipeline_config.DATA_STACK)}-workgroup"

  // Table names
  user_status_table_name            = "user_status"
  user_status_transition_table_name = "user_status_transition"
  user_counts_table_name            = "user_counts"
  user_first_join_table_name        = "user_first_join"
  sessions_table_name               = "sessions"
  daily_session_stats_table_name    = "daily_session_stats"
}

# -----------------------------------------------------------------------------
# Glue Catalog Tables (Iceberg) - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

# User status table - tracks current state of each user
resource "aws_glue_catalog_table" "user_status" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.user_status_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "User status tracking table for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.user_status_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "user_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "status"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "last_active_date"
            required = false
            type     = "date"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "status"
            source_id = 2
            transform = "identity"
          }
          fields {
            name      = "last_active_date_day"
            source_id = 3
            transform = "day"
          }
        }

        properties = {
          "write.delete.mode" = "merge-on-read"
          "write.update.mode" = "merge-on-read"
          "write.merge.mode"  = "merge-on-read"
          "format-version"    = "2"
        }
      }
    }
  }
}

# User status transition table - tracks state transitions over time
resource "aws_glue_catalog_table" "user_status_transition" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.user_status_transition_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "User status transition history for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.user_status_transition_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "transition_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 2
            name     = "from_status"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "to_status"
            required = false
            type     = "string"
          }
          fields {
            id       = 4
            name     = "count"
            required = false
            type     = "int"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "transition_date_day"
            source_id = 1
            transform = "day"
          }
        }

        properties = {
          "format-version" = "2"
        }
      }
    }
  }
}

# User counts table - daily aggregate counts by status
resource "aws_glue_catalog_table" "user_counts" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.user_counts_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "Daily user counts by status for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.user_counts_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "tracked_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 2
            name     = "status"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "count"
            required = false
            type     = "bigint"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "tracked_date_day"
            source_id = 1
            transform = "day"
          }
        }
      }
    }
  }
}

# User first join table - tracks when users first joined
resource "aws_glue_catalog_table" "user_first_join" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.user_first_join_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "User first join timestamps for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.user_first_join_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "user_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "first_join_time"
            required = false
            type     = "timestamp"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "first_join_time_day"
            source_id = 2
            transform = "day"
          }
        }
      }
    }
  }
}

# Sessions table - tracks user session durations
resource "aws_glue_catalog_table" "sessions" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.sessions_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "User session tracking table for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.sessions_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "session_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "user_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "session_timestamp"
            required = false
            type     = "timestamp"
          }
          fields {
            id       = 4
            name     = "session_duration_secs"
            required = false
            type     = "long"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "session_timestamp_day"
            source_id = 3
            transform = "day"
          }
        }
      }
    }
  }
}

# Daily session stats table - gold layer aggregation
resource "aws_glue_catalog_table" "daily_session_stats" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.daily_session_stats_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "Daily session statistics aggregation for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.daily_session_stats_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "session_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 2
            name     = "total_playtime"
            required = false
            type     = "long"
          }
          fields {
            id       = 3
            name     = "avg_playtime"
            required = false
            type     = "double"
          }
          fields {
            id       = 4
            name     = "session_count"
            required = false
            type     = "bigint"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "session_date_day"
            source_id = 1
            transform = "day"
          }
        }
      }
    }
  }
}

# -----------------------------------------------------------------------------
# Glue ETL Job - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

resource "aws_glue_job" "user_activity_etl" {
  count = local.is_data_lake_mode ? 1 : 0

  name         = "${local.workload_name}-User-Activity-ETL"
  description  = "Glue job to process user activity and state transitions for workload ${local.workload_name}."
  role_arn     = local.glue_etl_role_arn
  glue_version = "5.0"
  max_retries  = 0
  timeout      = 30

  # Use Glue Flex execution class for cost savings
  execution_class = "FLEX"

  command {
    name            = "glueetl"
    python_version  = "3"
    script_location = "s3://${local.analytics_bucket_name}/glue-scripts/samples/user_activity.py"
  }

  execution_property {
    max_concurrent_runs = 1
  }

  default_arguments = {
    "--INPUT_DB_NAME"                  = local.events_database
    "--OUTPUT_DB_NAME"                 = local.events_database
    "--INPUT_TABLE_NAME"               = local.raw_events_table
    "--USER_STATE_TABLE_NAME"          = local.user_status_table_name
    "--USER_TRANSITION_TABLE_NAME"     = local.user_status_transition_table_name
    "--USER_COUNTS_TABLE_NAME"         = local.user_counts_table_name
    "--USER_FIRST_JOIN_TABLE_NAME"     = local.user_first_join_table_name
    "--SESSIONS_TABLE_NAME"            = local.sessions_table_name
    "--DAILY_SESSION_STATS_TABLE_NAME" = local.daily_session_stats_table_name
    "--conf"                           = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://${local.analytics_bucket_name} --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO"
    "--datalake-formats"               = "iceberg"
    "--enable-glue-datacatalog"        = "true"
  }
}

# -----------------------------------------------------------------------------
# Glue Workflow for Scheduled Execution - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

resource "aws_glue_workflow" "user_activity_daily" {
  count = local.is_data_lake_mode ? 1 : 0

  name        = "${local.workload_name}-User-Activity-ETL-Daily"
  description = "Daily workflow for user activity analytics ETL"
}

resource "aws_glue_trigger" "user_activity_daily_schedule" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = "${local.workload_name}-User-Activity-ETL-Daily-Trigger"
  type          = "SCHEDULED"
  workflow_name = aws_glue_workflow.user_activity_daily[0].name

  # Run daily at 00:30 UTC (30 minutes after in-game analysis)
  schedule = "cron(30 0 * * ? *)"

  actions {
    job_name = aws_glue_job.user_activity_etl[0].name
  }

  start_on_creation = true
}

# -----------------------------------------------------------------------------
# Redshift Resources - Only when DATA_STACK == "REDSHIFT"
# -----------------------------------------------------------------------------

# Create user_status table in Redshift
resource "aws_redshiftdata_statement" "user_status" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.user_status_table_name} (
      user_id VARCHAR(255),
      status VARCHAR(50),
      last_active_date DATE
    )
    DISTSTYLE KEY
    DISTKEY (user_id)
    SORTKEY (status, last_active_date);
  SQL
}

# Create user_status_transition table in Redshift
resource "aws_redshiftdata_statement" "user_status_transition" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.user_status_transition_table_name} (
      transition_date DATE,
      from_status VARCHAR(50),
      to_status VARCHAR(50),
      count INTEGER
    )
    DISTSTYLE KEY
    DISTKEY (transition_date)
    SORTKEY (transition_date);
  SQL
}

# Create user_counts table in Redshift
resource "aws_redshiftdata_statement" "user_counts" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.user_counts_table_name} (
      tracked_date DATE,
      status VARCHAR(50),
      count BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (tracked_date)
    SORTKEY (tracked_date);
  SQL
}

# Create user_first_join table in Redshift
resource "aws_redshiftdata_statement" "user_first_join" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.user_first_join_table_name} (
      user_id VARCHAR(255),
      first_join_time TIMESTAMP
    )
    DISTSTYLE KEY
    DISTKEY (user_id)
    SORTKEY (first_join_time);
  SQL
}

# Create sessions table in Redshift
resource "aws_redshiftdata_statement" "sessions" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.sessions_table_name} (
      session_id VARCHAR(255),
      user_id VARCHAR(255),
      session_timestamp TIMESTAMP,
      session_duration_secs BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (session_id)
    SORTKEY (session_timestamp);
  SQL
}

# Create daily_session_stats table in Redshift
resource "aws_redshiftdata_statement" "daily_session_stats" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.daily_session_stats_table_name} (
      session_date DATE,
      total_playtime BIGINT,
      avg_playtime DOUBLE PRECISION,
      session_count BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (session_date)
    SORTKEY (session_date);
  SQL
}

# Scheduled Redshift query for user activity ETL
# Runs daily at 00:30 UTC to process user state transitions
resource "aws_scheduler_schedule" "redshift_user_activity_etl" {
  count = local.is_data_lake_mode ? 0 : 1

  name        = "${local.workload_name}-redshift-user-activity-etl"
  description = "Daily user activity ETL for Redshift"

  schedule_expression = "cron(30 0 * * ? *)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:${local.partition}:scheduler:::aws-sdk:redshiftdata:executeStatement"
    role_arn = "arn:${local.partition}:iam::${local.account_id}:role/${local.workload_name}-GameEventsEtlRole"

    input = jsonencode({
      WorkgroupName = local.redshift_workgroup_name
      Database      = local.events_database
      Sql           = <<-SQL
        -- Get the next date to process
        WITH date_to_process AS (
          SELECT COALESCE(
            (SELECT MAX(tracked_date) + 1 FROM ${local.user_counts_table_name}),
            (SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second')) 
             FROM ${local.raw_events_table} events 
             WHERE events.payload.event.event_name::VARCHAR = 'user_login')
          ) AS process_date
        ),
        latest_event_date AS (
          SELECT MAX(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second')) AS max_date
          FROM ${local.raw_events_table} events
          WHERE events.payload.event.event_name::VARCHAR = 'user_login'
        )
        SELECT CASE 
          WHEN (SELECT process_date FROM date_to_process) <= (SELECT max_date FROM latest_event_date)
          THEN 'Processing: ' || (SELECT process_date FROM date_to_process)
          ELSE 'No new data to process'
        END AS status;
      SQL
    })
  }

  depends_on = [
    aws_redshiftdata_statement.user_status,
    aws_redshiftdata_statement.user_status_transition,
    aws_redshiftdata_statement.user_counts,
    aws_redshiftdata_statement.user_first_join,
    aws_redshiftdata_statement.sessions,
    aws_redshiftdata_statement.daily_session_stats
  ]
}

# -----------------------------------------------------------------------------
# QuickSight Data Sets
# -----------------------------------------------------------------------------

# Data set for daily session stats
# Uses Athena/Glue for DATA_LAKE mode, Redshift for REDSHIFT mode
resource "aws_quicksight_data_set" "daily_session_stats" {
  aws_account_id = local.account_id
  data_set_id    = "daily-session-stats-${local.workload_name}"
  name           = "daily_session_stats"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "daily-session-stats-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.daily_session_stats_table_name

        input_columns {
          name = "session_date"
          type = "DATETIME"
        }
        input_columns {
          name = "total_playtime"
          type = "INTEGER"
        }
        input_columns {
          name = "avg_playtime"
          type = "DECIMAL"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "daily_session_stats_sql"
        sql_query       = "SELECT session_date, total_playtime, avg_playtime FROM ${local.daily_session_stats_table_name}"

        columns {
          name = "session_date"
          type = "DATETIME"
        }
        columns {
          name = "total_playtime"
          type = "INTEGER"
        }
        columns {
          name = "avg_playtime"
          type = "DECIMAL"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "daily-session-stats-logical"
    alias                = "daily_session_stats"

    data_transforms {
      project_operation {
        projected_columns = [
          "session_date",
          "total_playtime",
          "avg_playtime",
        ]
      }
    }

    source {
      physical_table_id = "daily-session-stats-table"
    }
  }

  depends_on = [
    aws_glue_catalog_table.daily_session_stats,
    aws_redshiftdata_statement.daily_session_stats
  ]
}

# Data set for user counts
# Uses Athena/Glue for DATA_LAKE mode, Redshift for REDSHIFT mode
# Note: Renames 'status' column to 'state' to match template expectations
resource "aws_quicksight_data_set" "user_counts" {
  aws_account_id = local.account_id
  data_set_id    = "user-counts-${local.workload_name}"
  name           = "user_counts"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "user-counts-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.user_counts_table_name

        input_columns {
          name = "tracked_date"
          type = "DATETIME"
        }
        input_columns {
          name = "status"
          type = "STRING"
        }
        input_columns {
          name = "count"
          type = "INTEGER"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "user_counts_sql"
        sql_query       = "SELECT tracked_date, status AS state, count FROM ${local.user_counts_table_name}"

        columns {
          name = "tracked_date"
          type = "DATETIME"
        }
        columns {
          name = "state"
          type = "STRING"
        }
        columns {
          name = "count"
          type = "INTEGER"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "user-counts-logical"
    alias                = "user_counts"

    data_transforms {
      project_operation {
        projected_columns = [
          "tracked_date",
          "status",
          "count",
        ]
      }
    }

    source {
      physical_table_id = "user-counts-table"
    }
  }

  depends_on = [
    aws_glue_catalog_table.user_counts,
    aws_redshiftdata_statement.user_counts
  ]
}

# Data set for user status transitions
# Uses Athena/Glue for DATA_LAKE mode, Redshift for REDSHIFT mode
# Note: Renames 'from_status'/'to_status' columns to 'from_state'/'to_state' to match template
resource "aws_quicksight_data_set" "user_status_transition" {
  aws_account_id = local.account_id
  data_set_id    = "user-status-transition-${local.workload_name}"
  name           = "user_status_transition"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "user-status-transition-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.user_status_transition_table_name

        input_columns {
          name = "transition_date"
          type = "DATETIME"
        }
        input_columns {
          name = "from_status"
          type = "STRING"
        }
        input_columns {
          name = "to_status"
          type = "STRING"
        }
        input_columns {
          name = "count"
          type = "INTEGER"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "user_status_transition_sql"
        sql_query       = "SELECT transition_date, from_status AS from_state, to_status AS to_state, count FROM ${local.user_status_transition_table_name}"

        columns {
          name = "transition_date"
          type = "DATETIME"
        }
        columns {
          name = "from_state"
          type = "STRING"
        }
        columns {
          name = "to_state"
          type = "STRING"
        }
        columns {
          name = "count"
          type = "INTEGER"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "user-status-transition-logical"
    alias                = "user_status_transition"

    data_transforms {
      project_operation {
        projected_columns = [
          "transition_date",
          "from_status",
          "to_status",
          "count",
        ]
      }
    }

    source {
      physical_table_id = "user-status-transition-table"
    }
  }

  depends_on = [
    aws_glue_catalog_table.user_status_transition,
    aws_redshiftdata_statement.user_status_transition
  ]
}

# -----------------------------------------------------------------------------
# QuickSight Template
# -----------------------------------------------------------------------------

resource "aws_quicksight_template" "playerbase_overview" {
  aws_account_id      = local.account_id
  template_id         = "playerbase-overview"
  name                = "Playerbase Overview"
  version_description = "Initial version"

  definition {
    data_set_configuration {
      placeholder = "$daily_session_stats"

      data_set_schema {
        column_schema_list {
          name      = "session_date"
          data_type = "DATETIME"
        }
        column_schema_list {
          name      = "total_playtime"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "avg_playtime"
          data_type = "DECIMAL"
        }
      }
    }

    data_set_configuration {
      placeholder = "$user_counts"

      data_set_schema {
        column_schema_list {
          name      = "state"
          data_type = "STRING"
        }
        column_schema_list {
          name      = "count"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "tracked_date"
          data_type = "DATETIME"
        }
      }
    }

    data_set_configuration {
      placeholder = "$user_status_transition"

      data_set_schema {
        column_schema_list {
          name      = "to_state"
          data_type = "STRING"
        }
        column_schema_list {
          name      = "transition_date"
          data_type = "DATETIME"
        }
        column_schema_list {
          name      = "count"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "from_state"
          data_type = "STRING"
        }
      }
    }

    sheets {
      sheet_id = "0c92e2d1-ef3f-4716-b152-b70dac9105ac"
      name     = "Playerbase Overview"

      visuals {
        kpi_visual {
          visual_id = "10695302-2d5d-4e14-a6f5-a07883d1a90d"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Inactive Users</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "407f5a24-3330-46f6-b31c-82e76c114eaa.count.0.1759180675246"
                  column {
                    data_set_identifier = "$user_counts"
                    column_name         = "count"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }

              trend_groups {
                date_dimension_field {
                  field_id = "407f5a24-3330-46f6-b31c-82e76c114eaa.tracked_date.1.1759180676361"
                  column {
                    data_set_identifier = "$user_counts"
                    column_name         = "tracked_date"
                  }
                }
              }
            }

            kpi_options {
              sparkline {
                visibility = "VISIBLE"
                type       = "AREA"
              }
            }
          }
        }
      }

      visuals {
        kpi_visual {
          visual_id = "96c6a62c-2892-4013-865b-11f8a89180e0"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Total Playtime Per Day (secs)</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "7b7202ba-6a34-4488-b376-766de6f87476.total_playtime.1.1759181076395"
                  column {
                    data_set_identifier = "$daily_session_stats"
                    column_name         = "total_playtime"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }

              trend_groups {
                date_dimension_field {
                  field_id = "7b7202ba-6a34-4488-b376-766de6f87476.session_date.1.1759181079803"
                  column {
                    data_set_identifier = "$daily_session_stats"
                    column_name         = "session_date"
                  }
                }
              }
            }

            kpi_options {
              sparkline {
                visibility = "VISIBLE"
                type       = "AREA"
              }
            }
          }
        }
      }

      visuals {
        kpi_visual {
          visual_id = "e8ef86a7-b706-4308-9fb1-33201ce28aa0"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Monthly Active Users</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "407f5a24-3330-46f6-b31c-82e76c114eaa.count.0.1759180675246"
                  column {
                    data_set_identifier = "$user_counts"
                    column_name         = "count"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
                  }
                }
              }

              trend_groups {
                date_dimension_field {
                  field_id = "407f5a24-3330-46f6-b31c-82e76c114eaa.tracked_date.1.1759180676361"
                  column {
                    data_set_identifier = "$user_counts"
                    column_name         = "tracked_date"
                  }
                }
              }
            }

            kpi_options {
              sparkline {
                visibility = "VISIBLE"
                type       = "AREA"
              }
            }
          }
        }
      }

      visuals {
        bar_chart_visual {
          visual_id = "c2f4cffe-7667-4362-8581-248246eb9482"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Average Playtime Per Session Per Day</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  date_dimension_field {
                    field_id = "7b7202ba-6a34-4488-b376-766de6f87476.session_date.0.1759175266685"
                    column {
                      data_set_identifier = "$daily_session_stats"
                      column_name         = "session_date"
                    }
                  }
                }

                values {
                  numerical_measure_field {
                    field_id = "7b7202ba-6a34-4488-b376-766de6f87476.avg_playtime.1.1759175269363"
                    column {
                      data_set_identifier = "$daily_session_stats"
                      column_name         = "avg_playtime"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }
          }
        }
      }

      layouts {
        configuration {
          grid_layout {
            elements {
              element_id   = "10695302-2d5d-4e14-a6f5-a07883d1a90d"
              element_type = "VISUAL"
              column_span  = 6
              row_span     = 6
            }
            elements {
              element_id   = "96c6a62c-2892-4013-865b-11f8a89180e0"
              element_type = "VISUAL"
              column_span  = 6
              row_span     = 6
            }
            elements {
              element_id   = "e8ef86a7-b706-4308-9fb1-33201ce28aa0"
              element_type = "VISUAL"
              column_span  = 6
              row_span     = 6
            }
            elements {
              element_id   = "c2f4cffe-7667-4362-8581-248246eb9482"
              element_type = "VISUAL"
              column_span  = 12
              row_span     = 9
            }

            canvas_size_options {
              screen_canvas_size_options {
                resize_option             = "FIXED"
                optimized_view_port_width = "1600px"
              }
            }
          }
        }
      }

      content_type = "INTERACTIVE"
    }

    analysis_defaults {
      default_new_sheet_configuration {
        interactive_layout_configuration {
          grid {
            canvas_size_options {
              screen_canvas_size_options {
                resize_option             = "FIXED"
                optimized_view_port_width = "1600px"
              }
            }
          }
        }
        sheet_content_type = "INTERACTIVE"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# QuickSight Analysis
# -----------------------------------------------------------------------------

resource "aws_quicksight_analysis" "playerbase_overview" {
  aws_account_id = local.account_id
  analysis_id    = "gap-playerbase-overview"
  name           = "Playerbase Overview"

  source_entity {
    source_template {
      arn = aws_quicksight_template.playerbase_overview.arn

      data_set_references {
        data_set_arn         = aws_quicksight_data_set.daily_session_stats.arn
        data_set_placeholder = "$daily_session_stats"
      }
      data_set_references {
        data_set_arn         = aws_quicksight_data_set.user_counts.arn
        data_set_placeholder = "$user_counts"
      }
      data_set_references {
        data_set_arn         = aws_quicksight_data_set.user_status_transition.arn
        data_set_placeholder = "$user_status_transition"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# QuickSight Folder Memberships
# -----------------------------------------------------------------------------

# Add datasets to the GAP folder - permissions cascade from folder
resource "aws_quicksight_folder_membership" "daily_session_stats" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.daily_session_stats.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

resource "aws_quicksight_folder_membership" "user_counts" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.user_counts.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

resource "aws_quicksight_folder_membership" "user_status_transition" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.user_status_transition.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

# Add analysis to the GAP folder - permissions cascade from folder
resource "aws_quicksight_folder_membership" "playerbase_overview_analysis" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_analysis.playerbase_overview.analysis_id
  member_type    = "ANALYSIS"
  aws_account_id = local.account_id
}
