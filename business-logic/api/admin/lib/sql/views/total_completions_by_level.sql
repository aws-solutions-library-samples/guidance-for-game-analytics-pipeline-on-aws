CREATE OR REPLACE VIEW
  total_completions_by_level AS
SELECT
  events.payload.event.event_data.level_id::VARCHAR as level,
  count(events.payload.event.event_data.level_id::VARCHAR) as number_of_completions
FROM
  "{db_name}"."public"."event_data_mv" events
WHERE
  events.payload.event.event_type::VARCHAR = 'level_completed'
GROUP BY
  events.payload.event.event_data.level_id::VARCHAR
ORDER by
  events.payload.event.event_data.level_id::VARCHAR
WITH
  NO SCHEMA BINDING;