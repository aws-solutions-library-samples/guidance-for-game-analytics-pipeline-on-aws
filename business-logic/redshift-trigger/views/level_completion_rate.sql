CREATE VIEW
  level_completion_rate AS
with
  t1 as (
    SELECT
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
      count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as level_count
    FROM
      "events"."public"."event_data"
    WHERE
      event_type = 'level_started'
    GROUP BY
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
  ),
  t2 as (
    SELECT
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
      count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as level_count
    FROM
      "events"."public"."event_data"
    WHERE
      event_type = 'level_completed'
    GROUP BY
      JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
  )
select
  t2.level,
  (
    cast(t2.level_count AS DOUBLE PRECISION) / (
      cast(t2.level_count AS DOUBLE PRECISION) + cast(t1.level_count AS DOUBLE PRECISION)
    )
  ) * 100 as level_completion_rate
from
  t1
  JOIN t2 ON t1.level = t2.level
ORDER by
  level
WITH
  NO SCHEMA BINDING;