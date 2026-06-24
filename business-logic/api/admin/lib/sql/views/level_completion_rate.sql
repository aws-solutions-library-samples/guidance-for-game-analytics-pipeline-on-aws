-- NOTE: Materialized views do not support CTEs (WITH ... AS) or JOINs in all cases.
-- This remains a regular view due to the CTE + JOIN pattern.
CREATE OR REPLACE VIEW
  level_completion_rate AS
WITH
  t1 AS (
    SELECT
      events.event_data.event.event_data.level_id::VARCHAR as level,
      count(events.event_data.event.event_data.level_id) as level_count
    FROM
      "{db_name}"."public"."event_data" events
    WHERE
      events.event_data.event.event_type::VARCHAR = 'level_started'
    GROUP BY
      events.event_data.event.event_data.level_id::VARCHAR
  ),
  t2 AS (
    SELECT
      events.event_data.event.event_data.level_id::VARCHAR as level,
      count(events.event_data.event.event_data.level_id) as level_count
    FROM
      "{db_name}"."public"."event_data" events
    WHERE
      events.event_data.event.event_type::VARCHAR = 'level_completed'
    GROUP BY
      events.event_data.event.event_data.level_id::VARCHAR
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
