CREATE OR REPLACE VIEW
  total_plays_by_level AS
SELECT
  events.payload.event.event_data.level_id::VARCHAR as level,
  count(events.payload.event.event_data.level_id::VARCHAR) as number_of_plays
FROM
  "{db_name}"."public"."event_data" events
WHERE
  events.payload.event.event_type::VARCHAR = 'level_started'
GROUP BY
  events.payload.event.event_data.level_id::VARCHAR
ORDER by
  events.payload.event.event_data.level_id::VARCHAR
WITH
  NO SCHEMA BINDING;