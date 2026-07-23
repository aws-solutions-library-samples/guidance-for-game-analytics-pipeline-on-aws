/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
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

  // Table names
  in_game_events_table_name = "daily_item_actions"
  in_game_trades_table_name = "daily_item_trades"

  // Redshift workgroup name (used when DATA_STACK == "REDSHIFT")
  redshift_workgroup_name = "${lower(local.pipeline_config.DATA_STACK)}-workgroup"
}

# -----------------------------------------------------------------------------
# Glue Catalog Tables (Iceberg) - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

# Glue table for in-game event actions
resource "aws_glue_catalog_table" "in_game_events" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.in_game_events_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "in-game event actions for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${lower(local.in_game_events_table_name)}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "item_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "item_action"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "event_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 4
            name     = "app_version"
            required = false
            type     = "string"
          }
          fields {
            id       = 5
            name     = "occurrences"
            required = false
            type     = "long"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "event_date_day"
            source_id = 3
            transform = "day"
          }
        }
      }
    }
  }
}

# Glue table for in-game trades
resource "aws_glue_catalog_table" "in_game_trades" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.in_game_trades_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "in-game trade actions for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${lower(local.in_game_trades_table_name)}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "traded_item"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "received_item"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "event_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 4
            name     = "app_version"
            required = false
            type     = "string"
          }
          fields {
            id       = 5
            name     = "occurrences"
            required = false
            type     = "long"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "event_date_day"
            source_id = 3
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

resource "aws_glue_job" "in_game_events_etl" {
  count = local.is_data_lake_mode ? 1 : 0

  name         = "${local.workload_name}-In-Game-ETL"
  description  = "Glue job to process raw events to in-game analytics, for workload ${local.workload_name}."
  role_arn     = local.glue_etl_role_arn
  glue_version = "5.0"
  max_retries  = 0
  timeout      = 30

  # Use Glue Flex execution class for cost savings
  # Flex jobs can start with a delay but cost significantly less
  execution_class = "FLEX"

  command {
    name            = "glueetl"
    python_version  = "3"
    script_location = "s3://${local.analytics_bucket_name}/glue-scripts/samples/in_game_analysis.py"
  }

  execution_property {
    max_concurrent_runs = 1
  }

  default_arguments = {
    "--INPUT_DB_NAME"            = local.events_database
    "--OUTPUT_DB_NAME"           = local.events_database
    "--INPUT_TABLE_NAME"         = local.raw_events_table
    "--OUTPUT_ACTION_TABLE_NAME" = local.in_game_events_table_name
    "--OUTPUT_TRADE_TABLE_NAME"  = local.in_game_trades_table_name
    "--conf"                     = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://${local.analytics_bucket_name} --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO"
    "--datalake-formats"         = "iceberg"
    "--enable-glue-datacatalog"  = "true"
  }
}

# -----------------------------------------------------------------------------
# Glue Workflow for Scheduled Execution - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

resource "aws_glue_workflow" "in_game_events_daily" {
  count = local.is_data_lake_mode ? 1 : 0

  name        = "${local.workload_name}-In-Game-ETL-Daily"
  description = "Daily workflow for in-game event analytics ETL"
}

resource "aws_glue_trigger" "daily_schedule" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = "${local.workload_name}-In-Game-ETL-Daily-Trigger"
  type          = "SCHEDULED"
  workflow_name = aws_glue_workflow.in_game_events_daily[0].name

  # Run daily at 00:00 UTC
  schedule = "cron(0 0 * * ? *)"

  actions {
    job_name = aws_glue_job.in_game_events_etl[0].name
  }

  # Start the workflow on apply so the schedule becomes active
  start_on_creation = true
}

# -----------------------------------------------------------------------------
# Redshift Resources - Only when DATA_STACK == "REDSHIFT"
# -----------------------------------------------------------------------------

# Create the daily_item_actions table in Redshift
resource "aws_redshiftdata_statement" "in_game_events" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.in_game_events_table_name} (
      item_id VARCHAR(255),
      item_action VARCHAR(255),
      event_date DATE,
      app_version VARCHAR(50),
      occurrences BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (item_id)
    SORTKEY (event_date);
  SQL
}

# Create the daily_item_trades table in Redshift
resource "aws_redshiftdata_statement" "in_game_trades" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.in_game_trades_table_name} (
      traded_item VARCHAR(255),
      received_item VARCHAR(255),
      event_date DATE,
      app_version VARCHAR(50),
      occurrences BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (traded_item)
    SORTKEY (event_date);
  SQL
}

# Scheduled Redshift query for incremental item actions ETL
# Runs daily at 00:00 UTC to insert new records
resource "aws_scheduler_schedule" "redshift_item_actions_etl" {
  count = local.is_data_lake_mode ? 0 : 1

  name        = "${local.workload_name}-redshift-item-actions-etl"
  description = "Daily incremental ETL for item actions to Redshift"

  # Run daily at 00:00 UTC
  schedule_expression = "cron(0 0 * * ? *)"

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
        INSERT INTO ${local.in_game_events_table_name}
        SELECT
          events.payload.event.event_data.item::VARCHAR AS item_id,
          events.payload.event.event_data.action::VARCHAR AS item_action,
          DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') AS event_date,
          events.payload.event.app_version::VARCHAR AS app_version,
          COUNT(*) AS occurrences
        FROM ${local.raw_events_table} events
        WHERE events.payload.event.event_name::VARCHAR = 'item_action'
          AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') > COALESCE(
            (SELECT MAX(event_date) FROM ${local.in_game_events_table_name}),
            '1900-01-01'::DATE
          )
        GROUP BY item_id, item_action, event_date, app_version;
      SQL
    })
  }

  # Wait for the target table to be created
  depends_on = [
    aws_redshiftdata_statement.in_game_events
  ]
}

# Scheduled Redshift query for incremental item trades ETL
# Runs daily at 00:05 UTC (5 minutes after item actions) to insert new records
resource "aws_scheduler_schedule" "redshift_item_trades_etl" {
  count = local.is_data_lake_mode ? 0 : 1

  name        = "${local.workload_name}-redshift-item-trades-etl"
  description = "Daily incremental ETL for item trades to Redshift"

  # Run daily at 00:05 UTC (staggered to avoid conflicts)
  schedule_expression = "cron(5 0 * * ? *)"

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
        INSERT INTO ${local.in_game_trades_table_name}
        SELECT
          events.payload.event.event_data.item::VARCHAR AS traded_item,
          events.payload.event.event_data.recieved_item::VARCHAR AS received_item,
          DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') AS event_date,
          events.payload.event.app_version::VARCHAR AS app_version,
          COUNT(*) AS occurrences
        FROM ${local.raw_events_table} events
        WHERE events.payload.event.event_name::VARCHAR = 'item_action'
          AND events.payload.event.event_data.action::VARCHAR = 'traded'
          AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') > COALESCE(
            (SELECT MAX(event_date) FROM ${local.in_game_trades_table_name}),
            '1900-01-01'::DATE
          )
        GROUP BY traded_item, received_item, event_date, app_version;
      SQL
    })
  }

  # Wait for the target table to be created
  depends_on = [
    aws_redshiftdata_statement.in_game_trades
  ]
}

# -----------------------------------------------------------------------------
# QuickSight Data Sets
# -----------------------------------------------------------------------------

# Data set for daily item actions
# Uses Athena/Glue for DATA_LAKE mode, Redshift for REDSHIFT mode
resource "aws_quicksight_data_set" "daily_item_actions" {
  aws_account_id = local.account_id
  data_set_id    = "daily-item-actions-${local.workload_name}"
  name           = "daily_item_actions"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "daily-item-actions-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.in_game_events_table_name

        input_columns {
          name = "item_id"
          type = "STRING"
        }
        input_columns {
          name = "item_action"
          type = "STRING"
        }
        input_columns {
          name = "event_date"
          type = "DATETIME"
        }
        input_columns {
          name = "app_version"
          type = "STRING"
        }
        input_columns {
          name = "occurrences"
          type = "INTEGER"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "daily_item_actions_sql"
        sql_query       = "SELECT item_id, item_action, event_date, app_version, occurrences FROM ${local.in_game_events_table_name}"

        columns {
          name = "item_id"
          type = "STRING"
        }
        columns {
          name = "item_action"
          type = "STRING"
        }
        columns {
          name = "event_date"
          type = "DATETIME"
        }
        columns {
          name = "app_version"
          type = "STRING"
        }
        columns {
          name = "occurrences"
          type = "INTEGER"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "daily-item-actions-logical"
    alias                = "daily_item_actions"

    data_transforms {
      project_operation {
        projected_columns = [
          "item_id",
          "item_action",
          "event_date",
          "app_version",
          "occurrences",
        ]
      }
    }

    source {
      physical_table_id = "daily-item-actions-table"
    }
  }

  # Wait for tables to be created before creating dataset
  depends_on = [
    aws_glue_catalog_table.in_game_events,
    aws_redshiftdata_statement.in_game_events
  ]
}

# Data set for daily item trades
# Uses Athena/Glue for DATA_LAKE mode, Redshift for REDSHIFT mode
resource "aws_quicksight_data_set" "daily_item_trades" {
  aws_account_id = local.account_id
  data_set_id    = "daily-item-trades-${local.workload_name}"
  name           = "daily_item_trades"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "daily-item-trades-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.in_game_trades_table_name

        input_columns {
          name = "traded_item"
          type = "STRING"
        }
        input_columns {
          name = "received_item"
          type = "STRING"
        }
        input_columns {
          name = "event_date"
          type = "DATETIME"
        }
        input_columns {
          name = "app_version"
          type = "STRING"
        }
        input_columns {
          name = "occurrences"
          type = "INTEGER"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "daily_item_trades_sql"
        sql_query       = "SELECT traded_item, received_item, event_date, app_version, occurrences FROM ${local.in_game_trades_table_name}"

        columns {
          name = "traded_item"
          type = "STRING"
        }
        columns {
          name = "received_item"
          type = "STRING"
        }
        columns {
          name = "event_date"
          type = "DATETIME"
        }
        columns {
          name = "app_version"
          type = "STRING"
        }
        columns {
          name = "occurrences"
          type = "INTEGER"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "daily-item-trades-logical"
    alias                = "daily_item_trades"

    data_transforms {
      project_operation {
        projected_columns = [
          "traded_item",
          "received_item",
          "event_date",
          "app_version",
          "occurrences",
        ]
      }
    }

    source {
      physical_table_id = "daily-item-trades-table"
    }
  }

  # Wait for tables to be created before creating dataset
  depends_on = [
    aws_glue_catalog_table.in_game_trades,
    aws_redshiftdata_statement.in_game_trades
  ]
}

# -----------------------------------------------------------------------------
# QuickSight Template
# -----------------------------------------------------------------------------

resource "aws_quicksight_template" "in_game" {
  aws_account_id      = local.account_id
  template_id         = "in_game_event_analysis"
  name                = "In-Game Event Analysis"
  version_description = "Initial version"

  definition {
    data_set_configuration {
      placeholder = "$daily_item_actions"

      data_set_schema {
        column_schema_list {
          name      = "occurrences"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "item_id"
          data_type = "STRING"
        }
        column_schema_list {
          name      = "item_action"
          data_type = "STRING"
        }
      }
    }

    data_set_configuration {
      placeholder = "$daily_item_trades"

      data_set_schema {
        column_schema_list {
          name      = "occurrences"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "traded_item"
          data_type = "STRING"
        }
        column_schema_list {
          name      = "received_item"
          data_type = "STRING"
        }
      }
    }

    sheets {
      sheet_id = "187ecdaa-f9de-47ec-a91e-3c22ac3640e0"
      name     = "In-Game Actions"

      visuals {
        bar_chart_visual {
          visual_id = "3ec615f8-0520-4166-a2b8-605f2adcebd1"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>In-game actions per item</visual-title>"
            }
          }

          subtitle {
            visibility = "VISIBLE"
          }

          chart_configuration {
            field_wells {
              bar_chart_aggregated_field_wells {
                category {
                  categorical_dimension_field {
                    field_id = "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_id.1.1762198413825"
                    column {
                      data_set_identifier = "$daily_item_actions"
                      column_name         = "item_id"
                    }
                  }
                }

                values {
                  numerical_measure_field {
                    field_id = "9d28bc32-8025-4d2b-b4db-b4e416f827a2.occurrences.0.1762198408993"
                    column {
                      data_set_identifier = "$daily_item_actions"
                      column_name         = "occurrences"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }

                colors {
                  categorical_dimension_field {
                    field_id = "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_action.2.1762198415225"
                    column {
                      data_set_identifier = "$daily_item_actions"
                      column_name         = "item_action"
                    }
                  }
                }
              }
            }

            sort_configuration {
              category_sort {
                field_sort {
                  field_id  = "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_id.1.1762198413825"
                  direction = "DESC"
                }
              }
            }

            orientation      = "HORIZONTAL"
            bars_arrangement = "STACKED"

            data_labels {
              visibility = "HIDDEN"
              overlap    = "DISABLE_OVERLAP"
            }

            tooltip {
              tooltip_visibility    = "VISIBLE"
              selected_tooltip_type = "DETAILED"
            }
          }
        }
      }

      visuals {
        sankey_diagram_visual {
          visual_id = "1ac54e0b-c147-482b-81ba-459cd2f9c028"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>In-game trades</visual-title>"
            }
          }

          subtitle {
            visibility = "VISIBLE"
          }

          chart_configuration {
            field_wells {
              sankey_diagram_aggregated_field_wells {
                source {
                  categorical_dimension_field {
                    field_id = "b632f422-b0d2-47b3-9bb7-805e129630b9.traded_item.0.1762198438257"
                    column {
                      data_set_identifier = "$daily_item_trades"
                      column_name         = "traded_item"
                    }
                  }
                }

                destination {
                  categorical_dimension_field {
                    field_id = "b632f422-b0d2-47b3-9bb7-805e129630b9.received_item.1.1762198438591"
                    column {
                      data_set_identifier = "$daily_item_trades"
                      column_name         = "received_item"
                    }
                  }
                }

                weight {
                  numerical_measure_field {
                    field_id = "b632f422-b0d2-47b3-9bb7-805e129630b9.occurrences.2.1762198439158"
                    column {
                      data_set_identifier = "$daily_item_trades"
                      column_name         = "occurrences"
                    }
                    aggregation_function {
                      simple_numerical_aggregation = "SUM"
                    }
                  }
                }
              }
            }

            sort_configuration {
              weight_sort {
                field_sort {
                  field_id  = "b632f422-b0d2-47b3-9bb7-805e129630b9.occurrences.2.1762198439158"
                  direction = "DESC"
                }
              }
            }

            data_labels {
              visibility = "VISIBLE"
              overlap    = "DISABLE_OVERLAP"
            }
          }
        }
      }

      layouts {
        configuration {
          grid_layout {
            elements {
              element_id   = "3ec615f8-0520-4166-a2b8-605f2adcebd1"
              element_type = "VISUAL"
              column_span  = 18
              row_span     = 12
            }
            elements {
              element_id   = "1ac54e0b-c147-482b-81ba-459cd2f9c028"
              element_type = "VISUAL"
              column_span  = 18
              row_span     = 12
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

resource "aws_quicksight_analysis" "in_game_events" {
  aws_account_id = local.account_id
  analysis_id    = "gap-in-game-event-analysis"
  name           = "In-Game Events Analysis"

  source_entity {
    source_template {
      arn = aws_quicksight_template.in_game.arn

      data_set_references {
        data_set_arn         = aws_quicksight_data_set.daily_item_actions.arn
        data_set_placeholder = "$daily_item_actions"
      }
      data_set_references {
        data_set_arn         = aws_quicksight_data_set.daily_item_trades.arn
        data_set_placeholder = "$daily_item_trades"
      }
    }
  }
}

# -----------------------------------------------------------------------------
# QuickSight Folder Memberships
# -----------------------------------------------------------------------------

# Add datasets to the GAP folder - permissions cascade from folder
resource "aws_quicksight_folder_membership" "daily_item_actions" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.daily_item_actions.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

resource "aws_quicksight_folder_membership" "daily_item_trades" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.daily_item_trades.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

# Add analysis to the GAP folder - permissions cascade from folder
resource "aws_quicksight_folder_membership" "in_game_events_analysis" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_analysis.in_game_events.analysis_id
  member_type    = "ANALYSIS"
  aws_account_id = local.account_id
}
