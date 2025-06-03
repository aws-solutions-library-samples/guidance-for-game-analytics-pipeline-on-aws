# Create the Athena queries
resource "aws_athena_named_query" "latest_events_query" {
  name     = "LatestEventsQuery"
  database = var.events_database
  description = "Get latest events by event_timestamp"
  workgroup = var.game_events_workgroup
  query    = <<-EOT
    SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
    FROM "${var.events_database}"."${var.raw_events_table}"
    ORDER BY event_timestamp_america_new_york DESC
    LIMIT 10;
  EOT
}

resource "aws_athena_named_query" "total_events_query" {
  name      = "TotalEventsQuery"
  database  = var.events_database
  description = "Total events"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT application_id, count(DISTINCT event_id) as event_count 
    FROM "${var.events_database}"."${var.raw_events_table}"
    GROUP BY application_id;
  EOT
}

resource "aws_athena_named_query" "total_events_month_query" {
  name      = "TotalEventsMonthQuery"
  database  = var.events_database
  description = "Total events over last month"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    WITH detail AS
    (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
    FROM detail 
    GROUP BY date_trunc('month', event_month), application_id;
  EOT
}

resource "aws_athena_named_query" "total_iap_transactions_last_month_query" {
  name      = "TotalIapTransactionsLastMonth"
  database  = var.events_database
  description = "Total IAP Transactions over the last month"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    WITH detail AS 
    (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
    FROM "${var.events_database}"."${var.raw_events_table}") 
    SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
    FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
    AND event_type = 'iap_transaction'
    GROUP BY date_trunc('month', event_month), application_id;
  EOT
}

resource "aws_athena_named_query" "new_users_last_month_query" {
  name      = "NewUsersLastMonth"
  database  = var.events_database
  description = "New Users over the last month"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
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

resource "aws_athena_named_query" "total_plays_by_level_query" {
  name      = "TotalPlaysByLevel"
  database  = var.events_database
  description = "Total number of times each level has been played"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type = 'level_started'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

resource "aws_athena_named_query" "total_failures_by_level_query" {
  name      = "TotalFailuresByLevel"
  database  = var.events_database
  description = "Total number of failures on each level"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_failed'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

resource "aws_athena_named_query" "total_completions_by_level_query" {
  name      = "TotalCompletionsByLevel"
  database  = var.events_database
  description = "Total number of completions on each level"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT json_extract_scalar(event_data, '$.level_id') as level,
    count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE event_type='level_completed'
    GROUP BY json_extract_scalar(event_data, '$.level_id')
    ORDER by json_extract_scalar(event_data, '$.level_id');
  EOT
}

resource "aws_athena_named_query" "level_completion_rate_query" {
  name      ="LevelCompletionRate"
  database  = var.events_database
  description = "Rate of completion for each level"
  workgroup = var.game_events_workgroup
  query    = <<-EOT
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

resource "aws_athena_named_query" "average_user_sentiments_per_day_query" {
  name      = "AverageUserSentimentPerDay"
  database  = var.events_database
  description = "User sentiment score by day"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
    date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
    FROM "${var.events_database}"."${var.raw_events_table}"
    WHERE json_extract_scalar(event_data, '$.user_rating') is not null
    GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));
  EOT
}

resource "aws_athena_named_query" "user_reported_reasons_count_query" {
  name      = "UserReportedReasonsCount"
  database  = var.events_database
  description = "Reasons users are being reported, grouped by reason code"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
    FROM "${var.events_database}"."${var.raw_events_table}"
    GROUP BY json_extract_scalar(event_data, '$.report_reason')
    ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;
  EOT
}

resource "aws_athena_named_query" "ctas_create_iceberg_tables_query" {
  name      = "CTASCreateIcebergTables"
  database  = var.events_database
  description = "Create table as (CTAS) from existing tables to iceberg"
  workgroup = var.game_events_workgroup
  query     = <<-EOT
    CREATE TABLE "${var.raw_events_table}"."raw_events_iceberg"
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