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
  item_prices_table_name                 = "item_prices"
  daily_item_store_metrics_table_name    = "daily_item_store_metrics"
  daily_user_purchase_metrics_table_name = "daily_user_purchase_metrics"
  user_first_join_table_name             = "user_first_join"
  user_ltv_table_name                    = "user_ltv"

  // Materialized view name for Redshift (contains SUPER type payload)
  event_data_mv_name = "event_data_mv"
}


# -----------------------------------------------------------------------------
# Glue Catalog Tables (Iceberg) - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

# Item prices reference table - static reference data for item pricing
resource "aws_glue_catalog_table" "item_prices" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.item_prices_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "Item prices reference table for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.item_prices_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "item_name"
            required = false
            type     = "string"
          }
          fields {
            id       = 2
            name     = "price"
            required = false
            type     = "decimal(10,2)"
          }
        }

        properties = {
          "format-version" = "2"
        }
      }
    }
  }
}


# Daily item store metrics table - silver layer aggregation
resource "aws_glue_catalog_table" "daily_item_store_metrics" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.daily_item_store_metrics_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "Daily item store metrics for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.daily_item_store_metrics_table_name}"

        schema {
          type = "struct"

          fields {
            id       = 1
            name     = "store_date"
            required = false
            type     = "date"
          }
          fields {
            id       = 2
            name     = "item_id"
            required = false
            type     = "string"
          }
          fields {
            id       = 3
            name     = "clicks"
            required = false
            type     = "bigint"
          }
          fields {
            id       = 4
            name     = "quantity"
            required = false
            type     = "int"
          }
          fields {
            id       = 5
            name     = "gross"
            required = false
            type     = "decimal(38,2)"
          }
          fields {
            id       = 6
            name     = "transactions"
            required = false
            type     = "bigint"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "store_date_day"
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


# Daily user purchase metrics table - silver layer
resource "aws_glue_catalog_table" "daily_user_purchase_metrics" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.daily_user_purchase_metrics_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "Daily user purchase metrics for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.daily_user_purchase_metrics_table_name}"

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
            name     = "gross"
            required = false
            type     = "decimal(38,2)"
          }
          fields {
            id       = 3
            name     = "first_purchase_time"
            required = false
            type     = "timestamp"
          }
          fields {
            id       = 4
            name     = "session_date"
            required = false
            type     = "date"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "session_date_day"
            source_id = 4
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

        properties = {
          "format-version" = "2"
        }
      }
    }
  }
}


# User LTV table - gold layer
resource "aws_glue_catalog_table" "user_ltv" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = local.user_ltv_table_name
  database_name = local.events_database
  catalog_id    = local.account_id
  description   = "User lifetime value metrics for workload ${local.workload_name}"

  open_table_format_input {
    iceberg_input {
      metadata_operation = "CREATE"
      version            = 2

      iceberg_table_input {
        location = "s3://${local.analytics_bucket_name}/${local.user_ltv_table_name}"

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
            name     = "lifetime_value"
            required = false
            type     = "decimal(38,2)"
          }
          fields {
            id       = 3
            name     = "days_to_first_monetization"
            required = false
            type     = "int"
          }
          fields {
            id       = 4
            name     = "monetization_date"
            required = false
            type     = "date"
          }
        }

        partition_spec {
          spec_id = 0

          fields {
            name      = "monetization_date_day"
            source_id = 4
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


# -----------------------------------------------------------------------------
# Glue ETL Jobs - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

# SILVER LAYER Glue Job - Process store events into silver tables
resource "aws_glue_job" "store_metrics_silver" {
  count = local.is_data_lake_mode ? 1 : 0

  name         = "${local.workload_name}-Store-Metrics-Silver"
  description  = "Glue job to process store events into silver tables for workload ${local.workload_name}."
  role_arn     = local.glue_etl_role_arn
  glue_version = "5.0"
  max_retries  = 0
  timeout      = 30

  execution_class = "FLEX"

  command {
    name            = "glueetl"
    python_version  = "3"
    script_location = "s3://${local.analytics_bucket_name}/glue-scripts/samples/store_metrics_silver.py"
  }

  execution_property {
    max_concurrent_runs = 1
  }

  default_arguments = {
    "--INPUT_DB_NAME"                          = local.events_database
    "--OUTPUT_DB_NAME"                         = local.events_database
    "--INPUT_TABLE_NAME"                       = local.raw_events_table
    "--ITEM_PRICES_TABLE_NAME"                 = local.item_prices_table_name
    "--SESSIONS_TABLE_NAME"                    = "sessions"
    "--USER_FIRST_JOIN_TABLE_NAME"             = local.user_first_join_table_name
    "--DAILY_ITEM_STORE_METRICS_TABLE_NAME"    = local.daily_item_store_metrics_table_name
    "--DAILY_USER_PURCHASE_METRICS_TABLE_NAME" = local.daily_user_purchase_metrics_table_name
    "--conf"                                   = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://${local.analytics_bucket_name} --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO"
    "--datalake-formats"                       = "iceberg"
    "--enable-glue-datacatalog"                = "true"
  }
}


# GOLD LAYER Glue Job - Aggregate silver data into gold tables
resource "aws_glue_job" "store_metrics_gold" {
  count = local.is_data_lake_mode ? 1 : 0

  name         = "${local.workload_name}-Store-Metrics-Gold"
  description  = "Glue job to aggregate silver data into gold tables for workload ${local.workload_name}."
  role_arn     = local.glue_etl_role_arn
  glue_version = "5.0"
  max_retries  = 0
  timeout      = 10

  execution_class = "FLEX"

  command {
    name            = "glueetl"
    python_version  = "3"
    script_location = "s3://${local.analytics_bucket_name}/glue-scripts/samples/store_metrics_gold.py"
  }

  execution_property {
    max_concurrent_runs = 1
  }

  default_arguments = {
    "--OUTPUT_DB_NAME"                         = local.events_database
    "--USER_FIRST_JOIN_TABLE_NAME"             = local.user_first_join_table_name
    "--DAILY_USER_PURCHASE_METRICS_TABLE_NAME" = local.daily_user_purchase_metrics_table_name
    "--USER_LTV_TABLE_NAME"                    = local.user_ltv_table_name
    "--conf"                                   = "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=s3://${local.analytics_bucket_name} --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO"
    "--datalake-formats"                       = "iceberg"
    "--enable-glue-datacatalog"                = "true"
  }
}

# -----------------------------------------------------------------------------
# Glue Workflow for Scheduled Execution - Only when DATA_STACK == "DATA_LAKE"
# -----------------------------------------------------------------------------

resource "aws_glue_workflow" "store_metrics_daily" {
  count = local.is_data_lake_mode ? 1 : 0

  name        = "${local.workload_name}-Store-Metrics-ETL-Daily"
  description = "Daily workflow for store metrics analytics ETL"
}

# Scheduled trigger to start the workflow
resource "aws_glue_trigger" "store_metrics_daily_schedule" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = "${local.workload_name}-Store-Metrics-ETL-Daily-Trigger"
  type          = "SCHEDULED"
  workflow_name = aws_glue_workflow.store_metrics_daily[0].name

  # Run daily at 01:00 UTC (after user_activity which runs at 00:30)
  schedule = "cron(0 1 * * ? *)"

  actions {
    job_name = aws_glue_job.store_metrics_silver[0].name
  }

  start_on_creation = true
}

# Conditional trigger to run gold job after silver completes
resource "aws_glue_trigger" "store_metrics_gold_after_silver" {
  count = local.is_data_lake_mode ? 1 : 0

  name          = "${local.workload_name}-Store-Metrics-Gold-After-Silver"
  type          = "CONDITIONAL"
  workflow_name = aws_glue_workflow.store_metrics_daily[0].name

  actions {
    job_name = aws_glue_job.store_metrics_gold[0].name
  }

  predicate {
    conditions {
      job_name         = aws_glue_job.store_metrics_silver[0].name
      state            = "SUCCEEDED"
      logical_operator = "EQUALS"
    }
  }
}


# -----------------------------------------------------------------------------
# Redshift Resources - Only when DATA_STACK == "REDSHIFT"
# -----------------------------------------------------------------------------

# Create item_prices reference table in Redshift
resource "aws_redshiftdata_statement" "item_prices" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.item_prices_table_name} (
      item_name VARCHAR(255),
      price DECIMAL(10,2)
    )
    DISTSTYLE KEY
    DISTKEY (item_name)
    SORTKEY (item_name);
  SQL
}

# Create daily_item_store_metrics table in Redshift
resource "aws_redshiftdata_statement" "daily_item_store_metrics" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.daily_item_store_metrics_table_name} (
      store_date DATE,
      item_id VARCHAR(255),
      clicks BIGINT,
      quantity INTEGER,
      gross DECIMAL(38,2),
      transactions BIGINT
    )
    DISTSTYLE KEY
    DISTKEY (item_id)
    SORTKEY (store_date);
  SQL
}

# Create daily_user_purchase_metrics table in Redshift
resource "aws_redshiftdata_statement" "daily_user_purchase_metrics" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.daily_user_purchase_metrics_table_name} (
      user_id VARCHAR(255),
      gross DECIMAL(38,2),
      first_purchase_time TIMESTAMP,
      session_date DATE
    )
    DISTSTYLE KEY
    DISTKEY (user_id)
    SORTKEY (session_date);
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

# Create user_ltv table in Redshift
resource "aws_redshiftdata_statement" "user_ltv" {
  count = local.is_data_lake_mode ? 0 : 1

  workgroup_name = local.redshift_workgroup_name
  database       = local.events_database
  sql            = <<-SQL
    CREATE TABLE IF NOT EXISTS ${local.user_ltv_table_name} (
      user_id VARCHAR(255),
      lifetime_value DECIMAL(38,2),
      days_to_first_monetization INTEGER,
      monetization_date DATE
    )
    DISTSTYLE KEY
    DISTKEY (user_id)
    SORTKEY (monetization_date);
  SQL
}


# -----------------------------------------------------------------------------
# Step Functions State Machine for Redshift ETL - Only when DATA_STACK == "REDSHIFT"
# -----------------------------------------------------------------------------

# IAM role for Step Functions state machine
resource "aws_iam_role" "redshift_etl_state_machine" {
  count = local.is_data_lake_mode ? 0 : 1

  name = "${local.workload_name}-store-metrics-redshift-etl-state-machine"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "states.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

# IAM policy for X-Ray tracing
resource "aws_iam_role_policy" "redshift_etl_state_machine_xray" {
  count = local.is_data_lake_mode ? 0 : 1

  name = "${local.workload_name}-store-metrics-redshift-etl-xray"
  role = aws_iam_role.redshift_etl_state_machine[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ]
      Resource = ["*"]
    }]
  })
}

# IAM policy for Redshift Data API
resource "aws_iam_role_policy" "redshift_etl_state_machine_redshift" {
  count = local.is_data_lake_mode ? 0 : 1

  name = "${local.workload_name}-store-metrics-redshift-etl-redshift-data"
  role = aws_iam_role.redshift_etl_state_machine[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "redshift-data:BatchExecuteStatement",
          "redshift-data:DescribeStatement",
          "redshift-data:GetStatementResult"
        ]
        Resource = [
          "arn:${local.partition}:redshift-serverless:${local.region}:${local.account_id}:workgroup/*",
          "arn:${local.partition}:redshift:${local.region}:${local.account_id}:cluster:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "redshift-serverless:GetWorkgroup"
        ]
        Resource = [
          "arn:${local.partition}:redshift-serverless:${local.region}:${local.account_id}:workgroup/*"
        ]
      }
    ]
  })
}


# Step Functions state machine for Redshift ETL
resource "aws_sfn_state_machine" "redshift_store_metrics_etl" {
  count = local.is_data_lake_mode ? 0 : 1

  name     = "${local.workload_name}-redshift-store-metrics-etl"
  role_arn = aws_iam_role.redshift_etl_state_machine[0].arn

  definition = jsonencode({
    Comment = "State machine for store metrics ETL on Redshift - runs silver then gold layer"
    StartAt = "BatchExecuteSilverStatement"
    States = {
      BatchExecuteSilverStatement = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:redshiftdata:batchExecuteStatement.waitForTaskToken"
        Parameters = {
          WorkgroupName = local.redshift_workgroup_name
          Database      = local.events_database
          Sqls = [
            <<-SQL
              MERGE INTO ${local.daily_item_store_metrics_table_name} target
              USING (
                  WITH process_date AS (
                      SELECT COALESCE(
                          (SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),
                          (SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second'))
                           FROM ${local.event_data_mv_name} AS events
                           WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))
                      ) AS process_date
                  ),
                  purchases AS (
                      SELECT 
                          events.payload.event.event_data.item::VARCHAR AS item_id, 
                          CAST(events.payload.event.event_data.quantity AS INT) AS quantity
                      FROM ${local.event_data_mv_name} events, process_date
                      WHERE events.payload.event.event_name::VARCHAR = 'store_purchase'
                          AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') = process_date.process_date
                  ),
                  purchase_metrics AS (
                      SELECT 
                          purchases.item_id, 
                          CAST(SUM(purchases.quantity) AS INT) AS quantity, 
                          CAST(SUM(purchases.quantity * prices.price) AS DECIMAL(38, 2)) AS gross, 
                          COUNT(*) AS transactions
                      FROM purchases
                      JOIN ${local.item_prices_table_name} prices ON purchases.item_id = prices.item_name
                      GROUP BY purchases.item_id
                  ),
                  clicks AS (
                      SELECT 
                          events.payload.event.event_data.item::VARCHAR AS item_id, 
                          COUNT(*) AS clicks
                      FROM ${local.event_data_mv_name} events, process_date
                      WHERE events.payload.event.event_name::VARCHAR = 'store_click'
                          AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') = process_date.process_date
                      GROUP BY events.payload.event.event_data.item::VARCHAR
                  )
                  SELECT 
                      clicks.item_id AS item_id, 
                      clicks.clicks AS clicks,
                      COALESCE(purchase_metrics.quantity, 0) AS quantity,
                      COALESCE(purchase_metrics.gross, 0) AS gross,
                      COALESCE(purchase_metrics.transactions, 0) AS transactions
                  FROM clicks
                  LEFT JOIN purchase_metrics ON clicks.item_id = purchase_metrics.item_id
              ) source
              ON target.item_id = source.item_id AND target.store_date = (SELECT process_date FROM (SELECT COALESCE((SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),(SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second')) FROM ${local.event_data_mv_name} AS events WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))))) AS pd(process_date))
              WHEN MATCHED THEN UPDATE SET
                  target.clicks = source.clicks,
                  target.quantity = source.quantity,
                  target.gross = source.gross,
                  target.transactions = source.transactions
              WHEN NOT MATCHED THEN 
                  INSERT (store_date, item_id, clicks, quantity, gross, transactions) 
                  VALUES ((SELECT process_date FROM (SELECT COALESCE((SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),(SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second')) FROM ${local.event_data_mv_name} AS events WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))))) AS pd(process_date)), source.item_id, source.clicks, source.quantity, source.gross, source.transactions);
            SQL
            ,
            <<-SQL
              INSERT INTO ${local.daily_user_purchase_metrics_table_name}
              WITH process_date AS (
                  SELECT COALESCE(
                      (SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),
                      (SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second'))
                       FROM ${local.event_data_mv_name} AS events
                       WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))
                  ) AS process_date
              ),
              purchases AS (
                  SELECT 
                      events.payload.event.event_data.item::VARCHAR AS item_id, 
                      events.payload.event.event_data.session_id::VARCHAR AS session_id, 
                      CAST(events.payload.event.event_data.quantity AS INT) AS quantity
                  FROM ${local.event_data_mv_name} events, process_date
                  WHERE events.payload.event.event_name::VARCHAR = 'store_purchase'
                      AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') = process_date.process_date
              ),
              session_purchases AS (
                  SELECT    
                      pu.session_id,
                      CAST(SUM(pu.quantity * pr.price) AS DECIMAL(38, 2)) AS gross, 
                      MIN(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') AS first_purchase_time
                  FROM purchases AS pu
                  JOIN ${local.item_prices_table_name} AS pr ON pu.item_id = pr.item_name
                  JOIN ${local.event_data_mv_name} events ON pu.session_id = events.payload.event.event_data.session_id::VARCHAR
                  GROUP BY pu.session_id
              )
              SELECT
                  s.user_id,
                  p.gross,
                  p.first_purchase_time,
                  CAST(s.session_timestamp AS DATE) AS session_date
              FROM session_purchases AS p
              JOIN sessions AS s ON p.session_id = s.session_id
              WHERE CAST(s.session_timestamp AS DATE) = (SELECT process_date FROM process_date);
            SQL
            ,
            <<-SQL
              MERGE INTO ${local.user_first_join_table_name} target
              USING (
                  SELECT 
                      events.payload.event.event_data.user_id::VARCHAR AS user_id, 
                      MIN(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') AS first_join_time
                  FROM ${local.event_data_mv_name} events
                  WHERE events.payload.event.event_name::VARCHAR = 'user_login'
                      AND DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second') = (
                          SELECT COALESCE(
                              (SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),
                              (SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second'))
                               FROM ${local.event_data_mv_name} AS events
                               WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))
                          )
                      )
                  GROUP BY events.payload.event.event_data.user_id::VARCHAR
              ) source
              ON target.user_id = source.user_id
              WHEN NOT MATCHED THEN 
                  INSERT (user_id, first_join_time) 
                  VALUES (source.user_id, source.first_join_time);
            SQL
          ]
        }
        Next = "BatchExecuteGoldStatement"
      }
      BatchExecuteGoldStatement = {
        Type     = "Task"
        Resource = "arn:aws:states:::aws-sdk:redshiftdata:batchExecuteStatement.waitForTaskToken"
        Parameters = {
          WorkgroupName = local.redshift_workgroup_name
          Database      = local.events_database
          Sqls = [
            <<-SQL
              MERGE INTO ${local.user_ltv_table_name} target
              USING (
                  WITH user_gross AS (
                      SELECT 
                          user_id,
                          SUM(gross) AS lifetime_value,
                          MIN(first_purchase_time) AS very_first_purchase
                      FROM ${local.daily_user_purchase_metrics_table_name}
                      GROUP BY user_id
                  )
                  SELECT 
                      user_gross.user_id,
                      user_gross.lifetime_value,
                      DATEDIFF(DAY, f.first_join_time, user_gross.very_first_purchase) AS days_to_first_monetization,
                      CAST(user_gross.very_first_purchase AS DATE) AS monetization_date
                  FROM user_gross
                  JOIN ${local.user_first_join_table_name} AS f ON user_gross.user_id = f.user_id
                  WHERE CAST(user_gross.very_first_purchase AS DATE) = (
                      SELECT COALESCE(
                          (SELECT MAX(store_date) + 1 FROM ${local.daily_item_store_metrics_table_name}),
                          (SELECT MIN(DATE(TIMESTAMP 'epoch' + events.payload.event.event_timestamp::BIGINT * INTERVAL '1 second'))
                           FROM ${local.event_data_mv_name} AS events
                           WHERE events.payload.event.event_name::VARCHAR IN ('store_purchase', 'store_click'))
                      )
                  )
              ) source
              ON target.user_id = source.user_id
              WHEN MATCHED THEN UPDATE SET
                  target.lifetime_value = source.lifetime_value,
                  target.days_to_first_monetization = source.days_to_first_monetization,
                  target.monetization_date = source.monetization_date
              WHEN NOT MATCHED THEN 
                  INSERT (user_id, lifetime_value, days_to_first_monetization, monetization_date) 
                  VALUES (source.user_id, source.lifetime_value, source.days_to_first_monetization, source.monetization_date);
            SQL
          ]
        }
        End = true
      }
    }
  })

  depends_on = [
    aws_redshiftdata_statement.item_prices,
    aws_redshiftdata_statement.daily_item_store_metrics,
    aws_redshiftdata_statement.daily_user_purchase_metrics,
    aws_redshiftdata_statement.user_first_join,
    aws_redshiftdata_statement.user_ltv
  ]
}

# EventBridge Scheduler to trigger the state machine daily
resource "aws_scheduler_schedule" "redshift_store_metrics_etl" {
  count = local.is_data_lake_mode ? 0 : 1

  name        = "${local.workload_name}-redshift-store-metrics-etl"
  description = "Daily store metrics ETL state machine for Redshift"

  schedule_expression = "cron(0 1 * * ? *)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sfn_state_machine.redshift_store_metrics_etl[0].arn
    role_arn = aws_iam_role.redshift_etl_state_machine[0].arn
  }
}


# -----------------------------------------------------------------------------
# QuickSight Data Sets
# -----------------------------------------------------------------------------

# Data set for daily item store metrics
resource "aws_quicksight_data_set" "daily_item_store_metrics" {
  aws_account_id = local.account_id
  data_set_id    = "daily-item-store-metrics-${local.workload_name}"
  name           = "daily_item_store_metrics"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "daily-item-store-metrics-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.daily_item_store_metrics_table_name

        input_columns {
          name = "store_date"
          type = "DATETIME"
        }
        input_columns {
          name = "item_id"
          type = "STRING"
        }
        input_columns {
          name = "clicks"
          type = "INTEGER"
        }
        input_columns {
          name = "quantity"
          type = "INTEGER"
        }
        input_columns {
          name = "gross"
          type = "DECIMAL"
        }
        input_columns {
          name = "transactions"
          type = "INTEGER"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "daily_item_store_metrics_sql"
        sql_query       = "SELECT store_date, item_id, clicks, quantity, gross, transactions FROM ${local.daily_item_store_metrics_table_name}"

        columns {
          name = "store_date"
          type = "DATETIME"
        }
        columns {
          name = "item_id"
          type = "STRING"
        }
        columns {
          name = "clicks"
          type = "INTEGER"
        }
        columns {
          name = "quantity"
          type = "INTEGER"
        }
        columns {
          name = "gross"
          type = "DECIMAL"
        }
        columns {
          name = "transactions"
          type = "INTEGER"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "daily-item-store-metrics-logical"
    alias                = "daily_item_store_metrics"

    data_transforms {
      project_operation {
        projected_columns = [
          "store_date",
          "item_id",
          "clicks",
          "quantity",
          "gross",
          "transactions",
        ]
      }
    }

    data_transforms {
      create_columns_operation {
        columns {
          column_id   = "units_per_transaction"
          column_name = "units_per_transaction"
          expression  = "quantity / transactions"
        }
        columns {
          column_id   = "gross_per_transaction"
          column_name = "gross_per_transaction"
          expression  = "gross / transactions"
        }
      }
    }

    source {
      physical_table_id = "daily-item-store-metrics-table"
    }
  }

  depends_on = [
    aws_glue_catalog_table.daily_item_store_metrics,
    aws_redshiftdata_statement.daily_item_store_metrics
  ]
}


# Data set for user LTV
resource "aws_quicksight_data_set" "user_ltv" {
  aws_account_id = local.account_id
  data_set_id    = "user-ltv-${local.workload_name}"
  name           = "user_ltv"
  import_mode    = "SPICE"

  physical_table_map {
    physical_table_map_id = "user-ltv-table"

    dynamic "relational_table" {
      for_each = local.is_data_lake_mode ? [1] : []

      content {
        data_source_arn = local.gap_data_source_arn
        catalog         = "AwsDataCatalog"
        schema          = local.events_database
        name            = local.user_ltv_table_name

        input_columns {
          name = "user_id"
          type = "STRING"
        }
        input_columns {
          name = "lifetime_value"
          type = "DECIMAL"
        }
        input_columns {
          name = "days_to_first_monetization"
          type = "INTEGER"
        }
        input_columns {
          name = "monetization_date"
          type = "DATETIME"
        }
      }
    }

    dynamic "custom_sql" {
      for_each = local.is_data_lake_mode ? [] : [1]

      content {
        data_source_arn = local.gap_data_source_arn
        name            = "user_ltv_sql"
        sql_query       = "SELECT user_id, lifetime_value, days_to_first_monetization, monetization_date FROM ${local.user_ltv_table_name}"

        columns {
          name = "user_id"
          type = "STRING"
        }
        columns {
          name = "lifetime_value"
          type = "DECIMAL"
        }
        columns {
          name = "days_to_first_monetization"
          type = "INTEGER"
        }
        columns {
          name = "monetization_date"
          type = "DATETIME"
        }
      }
    }
  }

  logical_table_map {
    logical_table_map_id = "user-ltv-logical"
    alias                = "user_ltv"

    data_transforms {
      project_operation {
        projected_columns = [
          "user_id",
          "lifetime_value",
          "days_to_first_monetization",
          "monetization_date",
        ]
      }
    }

    source {
      physical_table_id = "user-ltv-table"
    }
  }

  depends_on = [
    aws_glue_catalog_table.user_ltv,
    aws_redshiftdata_statement.user_ltv
  ]
}


# -----------------------------------------------------------------------------
# QuickSight Template
# -----------------------------------------------------------------------------

resource "aws_quicksight_template" "store_metrics" {
  aws_account_id      = local.account_id
  template_id         = "store-metrics-${local.workload_name}"
  name                = "Store Metrics"
  version_description = "Store metrics template with KPIs and charts"

  definition {
    # Dataset configuration for daily_item_store_metrics
    data_set_configuration {
      placeholder = "$daily_item_store_metrics"

      data_set_schema {
        column_schema_list {
          name      = "clicks"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "gross"
          data_type = "DECIMAL"
        }
        column_schema_list {
          name      = "transactions"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "item_id"
          data_type = "STRING"
        }
        column_schema_list {
          name      = "store_date"
          data_type = "DATETIME"
        }
        column_schema_list {
          name      = "quantity"
          data_type = "INTEGER"
        }
        column_schema_list {
          name      = "units_per_transaction"
          data_type = "DECIMAL"
        }
        column_schema_list {
          name      = "gross_per_transaction"
          data_type = "DECIMAL"
        }
      }
    }

    # Dataset configuration for user_ltv
    data_set_configuration {
      placeholder = "$user_ltv"

      data_set_schema {
        column_schema_list {
          name      = "lifetime_value"
          data_type = "DECIMAL"
        }
        column_schema_list {
          name      = "days_to_first_monetization"
          data_type = "INTEGER"
        }
      }
    }

    # Sheet: Transaction Statistics
    sheets {
      sheet_id = "c72e8f90-468c-4010-ac50-25457f805c3c"
      name     = "Transaction Statistics"

      # KPI: Total Gross Sales
      visuals {
        kpi_visual {
          visual_id = "46ee3aea-ed0e-43c3-97be-e03aa91a9714"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Total Gross Sales</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "9ab46bba-d652-4999-9891-fd45cc040d3c.gross.0.1759174531962"
                  column {
                    data_set_identifier = "$daily_item_store_metrics"
                    column_name         = "gross"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
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

      # KPI: Total Unit Sales
      visuals {
        kpi_visual {
          visual_id = "08a57b98-1461-4792-9b45-6e97bfcd9030"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Total Unit Sales</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "9ab46bba-d652-4999-9891-fd45cc040d3c.quantity.0.1759174553233"
                  column {
                    data_set_identifier = "$daily_item_store_metrics"
                    column_name         = "quantity"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
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

      # KPI: Total Transactions
      visuals {
        kpi_visual {
          visual_id = "9b2af654-949f-48c9-832b-7f1a597bd768"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Total Transactions</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "9ab46bba-d652-4999-9891-fd45cc040d3c.transactions.0.1759174562752"
                  column {
                    data_set_identifier = "$daily_item_store_metrics"
                    column_name         = "transactions"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "SUM"
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

      # KPI: Average Units per Transaction
      visuals {
        kpi_visual {
          visual_id = "8857546e-90d2-42ac-8fbc-9b8b8d5b50a3"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Average Units Sold per Transaction</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "097c58ba-e21a-46ba-9163-2c71800f7764.0.1759174630923"
                  column {
                    data_set_identifier = "$daily_item_store_metrics"
                    column_name         = "units_per_transaction"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "AVERAGE"
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

      # KPI: Average Gross per Transaction
      visuals {
        kpi_visual {
          visual_id = "b9032123-f896-4a5d-ae07-8680be7a048e"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Average Gross per Transaction</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              values {
                numerical_measure_field {
                  field_id = "c9267a9b-1ea1-4dee-a658-cde2434ad65a.0.1759174655138"
                  column {
                    data_set_identifier = "$daily_item_store_metrics"
                    column_name         = "gross_per_transaction"
                  }
                  aggregation_function {
                    simple_numerical_aggregation = "AVERAGE"
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

      # Line Chart: Transactions Per Day
      visuals {
        line_chart_visual {
          visual_id = "ecb93389-67f2-4d1f-b3bc-6b39a545cb88"

          title {
            visibility = "VISIBLE"
            format_text {
              rich_text = "<visual-title>Transactions Per Day</visual-title>"
            }
          }

          chart_configuration {
            field_wells {
              line_chart_aggregated_field_wells {
                category {
                  date_dimension_field {
                    field_id = "9ab46bba-d652-4999-9891-fd45cc040d3c.store_date.0.1759174679442"
                    column {
                      data_set_identifier = "$daily_item_store_metrics"
                      column_name         = "store_date"
                    }
                  }
                }

                values {
                  numerical_measure_field {
                    field_id = "9ab46bba-d652-4999-9891-fd45cc040d3c.transactions.1.1759174681839"
                    column {
                      data_set_identifier = "$daily_item_store_metrics"
                      column_name         = "transactions"
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

      # Layout configuration
      layouts {
        configuration {
          grid_layout {
            elements {
              element_id   = "46ee3aea-ed0e-43c3-97be-e03aa91a9714"
              element_type = "VISUAL"
              column_span  = 4
              row_span     = 6
            }
            elements {
              element_id   = "08a57b98-1461-4792-9b45-6e97bfcd9030"
              element_type = "VISUAL"
              column_span  = 4
              row_span     = 6
            }
            elements {
              element_id   = "9b2af654-949f-48c9-832b-7f1a597bd768"
              element_type = "VISUAL"
              column_span  = 4
              row_span     = 6
            }
            elements {
              element_id   = "8857546e-90d2-42ac-8fbc-9b8b8d5b50a3"
              element_type = "VISUAL"
              column_span  = 4
              row_span     = 6
            }
            elements {
              element_id   = "b9032123-f896-4a5d-ae07-8680be7a048e"
              element_type = "VISUAL"
              column_span  = 4
              row_span     = 6
            }
            elements {
              element_id   = "ecb93389-67f2-4d1f-b3bc-6b39a545cb88"
              element_type = "VISUAL"
              column_span  = 12
              row_span     = 6
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

resource "aws_quicksight_analysis" "store_metrics" {
  aws_account_id = local.account_id
  analysis_id    = "store-metrics-${local.workload_name}"
  name           = "Store Metrics Analysis"

  source_entity {
    source_template {
      arn = aws_quicksight_template.store_metrics.arn

      data_set_references {
        data_set_arn         = aws_quicksight_data_set.daily_item_store_metrics.arn
        data_set_placeholder = "$daily_item_store_metrics"
      }
      data_set_references {
        data_set_arn         = aws_quicksight_data_set.user_ltv.arn
        data_set_placeholder = "$user_ltv"
      }
    }
  }

  depends_on = [
    aws_quicksight_data_set.daily_item_store_metrics,
    aws_quicksight_data_set.user_ltv,
    aws_quicksight_template.store_metrics
  ]
}


# -----------------------------------------------------------------------------
# QuickSight Folder Memberships
# -----------------------------------------------------------------------------

resource "aws_quicksight_folder_membership" "daily_item_store_metrics" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.daily_item_store_metrics.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

resource "aws_quicksight_folder_membership" "user_ltv" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_data_set.user_ltv.data_set_id
  member_type    = "DATASET"
  aws_account_id = local.account_id
}

resource "aws_quicksight_folder_membership" "analysis" {
  folder_id      = local.gap_folder_id
  member_id      = aws_quicksight_analysis.store_metrics.analysis_id
  member_type    = "ANALYSIS"
  aws_account_id = local.account_id
}
