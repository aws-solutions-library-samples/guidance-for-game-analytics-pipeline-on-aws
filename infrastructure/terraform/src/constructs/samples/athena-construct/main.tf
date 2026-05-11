# Create the Athena queries
#
# Each named query has two variants controlled by var.enable_apache_iceberg_support:
#   - *_iceberg: query targets the Iceberg schema, where event_timestamp is a
#                native timestamp column (no year/month/day partitions).
#   - *_hive:    query targets the legacy Hive-partitioned schema, where
#                year/month/day are partition columns and event_timestamp is a
#                Unix epoch integer.

# --------------------------------------------------------------------------
# LatestEventsQuery
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "latest_events_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "LatestEventsQuery"
  database    = var.events_database
  description = "Get latest events by event_timestamp"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT *, event_timestamp AT TIME ZONE 'America/New_York' as event_timestamp_america_new_york
    FROM "${var.events_database}"."${var.raw_events_table}"
    ORDER BY event_timestamp_america_new_york DESC
    LIMIT 10;
  EOT
}

resource "aws_athena_named_query" "latest_events_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "LatestEventsQuery"
  database    = var.events_database
  description = "Get latest events by event_timestamp"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
    FROM "${var.events_database}"."${var.raw_events_table}"
    ORDER BY event_timestamp_america_new_york DESC
    LIMIT 10;
  EOT
}

# --------------------------------------------------------------------------
# TotalEventsQuery (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_events_query" {
  name        = "TotalEventsQuery"
  database    = var.events_database
  description = "Total events"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT application_id, count(DISTINCT event_id) as event_count 
    FROM "${var.events_database}"."${var.raw_events_table}"
    GROUP BY application_id;
  EOT
}

# --------------------------------------------------------------------------
# TotalEventsMonthQuery
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_events_month_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "TotalEventsMonthQuery"
  database    = var.events_database
  description = "Total events over last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS
    (SELECT date_trunc('month', event_timestamp) as event_month, * 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT event_month as month, application_id, count(DISTINCT event_id) as event_count 
    FROM detail 
    GROUP BY event_month, application_id
  EOT
}

resource "aws_athena_named_query" "total_events_month_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "TotalEventsMonthQuery"
  database    = var.events_database
  description = "Total events over last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS
    (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
    FROM detail 
    GROUP BY date_trunc('month', event_month), application_id
  EOT
}

# --------------------------------------------------------------------------
# TotalIapTransactionsLastMonth
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_iap_transactions_last_month_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "TotalIapTransactionsLastMonth"
  database    = var.events_database
  description = "Total IAP Transactions over the last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS 
    (SELECT date_trunc('month', event_timestamp) as event_month, * 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT event_month as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
    FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
    AND event_type = 'iap_transaction'
    GROUP BY event_month, application_id
  EOT
}

resource "aws_athena_named_query" "total_iap_transactions_last_month_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "TotalIapTransactionsLastMonth"
  database    = var.events_database
  description = "Total IAP Transactions over the last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS 
    (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
    FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
    AND event_type = 'iap_transaction'
    GROUP BY date_trunc('month', event_month), application_id
  EOT
}

# --------------------------------------------------------------------------
# NewUsersLastMonth
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "new_users_last_month_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "NewUsersLastMonth"
  database    = var.events_database
  description = "New Users over the last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS (
    SELECT date_trunc('month', event_timestamp) as event_month, *
    FROM "${var.events_database}"."${var.raw_events_table}")
    SELECT
    event_month as month,
    count(*) as new_accounts
    FROM detail
    WHERE event_type = 'user_registration'
    GROUP BY event_month;
  EOT
}

resource "aws_athena_named_query" "new_users_last_month_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "NewUsersLastMonth"
  database    = var.events_database
  description = "New Users over the last month"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    WITH detail AS (
    SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, *
    FROM "${var.events_database}"."${var.raw_events_table}")
    SELECT
    date_trunc('month', event_month) as month,
    count(*) as new_accounts
    FROM detail
    WHERE event_type = 'user_registration'
    GROUP BY date_trunc('month', event_month);
  EOT
}

# --------------------------------------------------------------------------
# TotalPlaysByLevel (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_plays_by_level_query" {
  name        = "TotalPlaysByLevel"
  database    = var.events_database
  description = "Total number of times each level has been played"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type = 'level_started'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

# --------------------------------------------------------------------------
# TotalFailuresByLevel (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_failures_by_level_query" {
  name        = "TotalFailuresByLevel"
  database    = var.events_database
  description = "Total number of failures on each level"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_failed'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

# --------------------------------------------------------------------------
# TotalCompletionsByLevel (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "total_completions_by_level_query" {
  name        = "TotalCompletionsByLevel"
  database    = var.events_database
  description = "Total number of completions on each level"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_completed'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

# --------------------------------------------------------------------------
# LevelCompletionRate (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "level_completion_rate_query" {
  name        = "LevelCompletionRate"
  database    = var.events_database
  description = "Rate of completion for each level"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    with t1 as
    (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_started' GROUP BY json_extract_scalar(event_data, '$.level_id') 
    ),
    t2 as
    (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_completed'GROUP BY json_extract_scalar(event_data, '$.level_id') 
    )
    select t2.level, (cast(t2.level_count AS DOUBLE) / (cast(t2.level_count AS DOUBLE) + cast(t1.level_count AS DOUBLE))) * 100 as level_completion_rate from 
    t1 JOIN t2 ON t1.level = t2.level
    ORDER by level;
  EOT
}

# --------------------------------------------------------------------------
# AverageUserSentimentPerDay
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "average_user_sentiments_per_day_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "AverageUserSentimentPerDay"
  database    = var.events_database
  description = "User sentiment score by day"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT
    avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
    date(event_timestamp) as event_date
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE json_extract_scalar(event_data, '$.user_rating') is not null
    GROUP BY date(event_timestamp);
  EOT
}

resource "aws_athena_named_query" "average_user_sentiments_per_day_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "AverageUserSentimentPerDay"
  database    = var.events_database
  description = "User sentiment score by day"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT
    avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
    date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE json_extract_scalar(event_data, '$.user_rating') is not null
    GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));
  EOT
}

# --------------------------------------------------------------------------
# UserReportedReasonsCount (schema-agnostic)
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "user_reported_reasons_count_query" {
  name        = "UserReportedReasonsCount"
  database    = var.events_database
  description = "Reasons users are being reported, grouped by reason code"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
    FROM "${var.events_database}"."${var.raw_events_table}"
    GROUP BY json_extract_scalar(event_data, '$.report_reason')
    ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;
  EOT
}

# --------------------------------------------------------------------------
# CTASCreateIcebergTables
# --------------------------------------------------------------------------
resource "aws_athena_named_query" "ctas_create_iceberg_tables_query_iceberg" {
  count       = var.enable_apache_iceberg_support ? 1 : 0
  name        = "CTASCreateIcebergTables"
  database    = var.events_database
  description = "Create table as (CTAS) from existing tables to iceberg"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    CREATE TABLE "${var.events_database}"."raw_events_iceberg"
    WITH (table_type = 'ICEBERG',
    format = 'PARQUET', 
    location = 's3://your_bucket/', 
    is_external = false,
    partitioning = ARRAY['application_id', 'month(event_timestamp)'],
    vacuum_min_snapshots_to_keep = 10,
    vacuum_max_snapshot_age_seconds = 604800
    ) 
    AS SELECT * FROM "${var.events_database}"."${var.raw_events_table}";
  EOT
}

resource "aws_athena_named_query" "ctas_create_iceberg_tables_query_hive" {
  count       = var.enable_apache_iceberg_support ? 0 : 1
  name        = "CTASCreateIcebergTables"
  database    = var.events_database
  description = "Create table as (CTAS) from existing tables to iceberg"
  workgroup   = var.game_events_workgroup
  query       = <<-EOT
    CREATE TABLE "${var.events_database}"."raw_events_iceberg"
    WITH (table_type = 'ICEBERG',
    format = 'PARQUET', 
    location = 's3://your_bucket/', 
    is_external = false,
    partitioning = ARRAY['application_id', 'year', 'month', 'day'],
    vacuum_min_snapshots_to_keep = 10,
    vacuum_max_snapshot_age_seconds = 604800
    ) 
    AS SELECT * FROM "${var.events_database}"."${var.raw_events_table}";
  EOT
}
