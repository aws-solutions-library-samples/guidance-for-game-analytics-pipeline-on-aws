CREATE OR REPLACE VIEW total_completions_by_level AS
SELECT
  events.payload.event.event_data.level_id::VARCHAR AS level,
  count(*) AS completions
FROM "{db_name}"."public"."event_data" events
WHERE events.payload.event.event_type::VARCHAR = 'level_completed'
GROUP BY level
WITH NO SCHEMA BINDING;
