CREATE OR REPLACE VIEW
  level_completion_rate AS
with
  t1 as (
    SELECT
      events.payload.event.event_data.level_id::VARCHAR as level,
      count(events.payload.event.event_data.level_id::VARCHAR) as level_count
    FROM
      "{db_name}"."public"."event_data_mv" events
    WHERE
      events.payload.event.event_type::VARCHAR = 'level_started'
    GROUP BY
      events.payload.event.event_data.level_id::VARCHAR
  ),
  t2 as (
    SELECT
      events.payload.event.event_data.level_id::VARCHAR as level,
      count(events.payload.event.event_data.level_id::VARCHAR) as level_count
    FROM
      "{db_name}"."public"."event_data_mv" events
    WHERE
      events.payload.event.event_type::VARCHAR = 'level_completed'
    GROUP BY
      events.payload.event.event_data.level_id::VARCHAR
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