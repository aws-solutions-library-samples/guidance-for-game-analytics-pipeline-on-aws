-- NOTE: Materialized views do not support CTEs (WITH ... AS) or JOINs in all cases.
-- This remains a regular view due to the CTE + JOIN pattern.
CREATE OR REPLACE VIEW
  level_completion_rate AS
WITH
  t1 AS (
    SELECT
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
      count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as level_count
    FROM
      "{db_name}"."public"."event_data"
    WHERE
      event_type = 'level_started'
    GROUP BY
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
  ),
  t2 AS (
    SELECT
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
      count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as level_count
    FROM
      "{db_name}"."public"."event_data"
    WHERE
      event_type = 'level_completed'
    GROUP BY
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
  )
SELECT
  t2.level,
  (
    cast(t2.level_count AS DOUBLE PRECISION) / (
      cast(t2.level_count AS DOUBLE PRECISION) + cast(t1.level_count AS DOUBLE PRECISION)
    )
  ) * 100 as level_completion_rate
FROM
  t1
  JOIN t2 ON t1.level = t2.level
WITH
  NO SCHEMA BINDING;
