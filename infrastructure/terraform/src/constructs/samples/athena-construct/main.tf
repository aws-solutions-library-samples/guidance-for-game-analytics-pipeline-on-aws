# Create the Athena queries
#
# Queries are defined in a single map. Each entry has:
#   - description: shown in the Athena console
#   - query:       the SQL string (for schema-agnostic queries)
#   - query_iceberg / query_hive: schema-specific SQL variants, used when the
#                                  query depends on the raw_events_table schema.
#                                  Iceberg: event_timestamp is a native timestamp.
#                                  Hive:    year/month/day are partition columns
#                                           and event_timestamp is a Unix epoch.
#
# The resource below prefers the schema-specific variant and falls back to the
# generic `query` field when only one was provided.

locals {
  athena_named_queries = {
    LatestEventsQuery = {
      description   = "Get latest events by event_timestamp"
      query_iceberg = <<-EOT
        SELECT *, event_timestamp AT TIME ZONE 'America/New_York' as event_timestamp_america_new_york
        FROM "${var.events_database}"."${var.raw_events_table}"
        ORDER BY event_timestamp_america_new_york DESC
        LIMIT 10;
      EOT
      query_hive    = <<-EOT
        SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
        FROM "${var.events_database}"."${var.raw_events_table}"
        ORDER BY event_timestamp_america_new_york DESC
        LIMIT 10;
      EOT
    }

    TotalEventsQuery = {
      description = "Total events"
      query       = <<-EOT
        SELECT application_id, count(DISTINCT event_id) as event_count 
        FROM "${var.events_database}"."${var.raw_events_table}"
        GROUP BY application_id;
      EOT
    }

    TotalEventsMonthQuery = {
      description   = "Total events over last month"
      query_iceberg = <<-EOT
        WITH detail AS
        (SELECT date_trunc('month', event_timestamp) as event_month, * 
        FROM "${var.events_database}"."${var.raw_events_table}") 
        SELECT event_month as month, application_id, count(DISTINCT event_id) as event_count 
        FROM detail 
        GROUP BY event_month, application_id
      EOT
      query_hive    = <<-EOT
        WITH detail AS
        (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
        FROM "${var.events_database}"."${var.raw_events_table}") 
        SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
        FROM detail 
        GROUP BY date_trunc('month', event_month), application_id
      EOT
    }

    TotalIapTransactionsLastMonth = {
      description   = "Total IAP Transactions over the last month"
      query_iceberg = <<-EOT
        WITH detail AS 
        (SELECT date_trunc('month', event_timestamp) as event_month, * 
        FROM "${var.events_database}"."${var.raw_events_table}") 
        SELECT event_month as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
        FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
        AND event_type = 'iap_transaction'
        GROUP BY event_month, application_id
      EOT
      query_hive    = <<-EOT
        WITH detail AS 
        (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
        FROM "${var.events_database}"."${var.raw_events_table}") 
        SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
        FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
        AND event_type = 'iap_transaction'
        GROUP BY date_trunc('month', event_month), application_id
      EOT
    }

    NewUsersLastMonth = {
      description   = "New Users over the last month"
      query_iceberg = <<-EOT
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
      query_hive    = <<-EOT
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

    TotalPlaysByLevel = {
      description = "Total number of times each level has been played"
      query       = <<-EOT
        SELECT json_extract_scalar(event_data, '$.level_id') as level,
        count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
        FROM "${var.events_database}"."${var.raw_events_table}"
        WHERE event_type = 'level_started'
        GROUP BY json_extract_scalar(event_data, '$.level_id')
        ORDER by json_extract_scalar(event_data, '$.level_id');
      EOT
    }

    TotalFailuresByLevel = {
      description = "Total number of failures on each level"
      query       = <<-EOT
        SELECT json_extract_scalar(event_data, '$.level_id') as level,
        count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
        FROM "${var.events_database}"."${var.raw_events_table}"
        WHERE event_type='level_failed'
        GROUP BY json_extract_scalar(event_data, '$.level_id')
        ORDER by json_extract_scalar(event_data, '$.level_id');
      EOT
    }

    TotalCompletionsByLevel = {
      description = "Total number of completions on each level"
      query       = <<-EOT
        SELECT json_extract_scalar(event_data, '$.level_id') as level,
        count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
        FROM "${var.events_database}"."${var.raw_events_table}"
        WHERE event_type='level_completed'
        GROUP BY json_extract_scalar(event_data, '$.level_id')
        ORDER by json_extract_scalar(event_data, '$.level_id');
      EOT
    }

    LevelCompletionRate = {
      description = "Rate of completion for each level"
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

    AverageUserSentimentPerDay = {
      description   = "User sentiment score by day"
      query_iceberg = <<-EOT
        SELECT
        avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
        date(event_timestamp) as event_date
        FROM "${var.events_database}"."${var.raw_events_table}"
        WHERE json_extract_scalar(event_data, '$.user_rating') is not null
        GROUP BY date(event_timestamp);
      EOT
      query_hive    = <<-EOT
        SELECT
        avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
        date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
        FROM "${var.events_database}"."${var.raw_events_table}"
        WHERE json_extract_scalar(event_data, '$.user_rating') is not null
        GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));
      EOT
    }

    UserReportedReasonsCount = {
      description = "Reasons users are being reported, grouped by reason code"
      query       = <<-EOT
        SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
        FROM "${var.events_database}"."${var.raw_events_table}"
        GROUP BY json_extract_scalar(event_data, '$.report_reason')
        ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;
      EOT
    }

    CTASCreateIcebergTables = {
      description   = "Create table as (CTAS) from existing tables to iceberg"
      query_iceberg = <<-EOT
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
      query_hive    = <<-EOT
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
  }
}

resource "aws_athena_named_query" "queries" {
  for_each = local.athena_named_queries

  name        = each.key
  database    = var.events_database
  workgroup   = var.game_events_workgroup
  description = each.value.description
  query       = var.enable_apache_iceberg_support ? try(each.value.query_iceberg, each.value.query) : try(each.value.query_hive, each.value.query)
}
