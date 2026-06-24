CREATE OR REPLACE VIEW total_completions_by_level AS
SELECT
  events.event_data.event.event_data.level_id::VARCHAR AS level,
  count(*) AS completions
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_type::VARCHAR = 'level_completed'
GROUP BY level
WITH NO SCHEMA BINDING;
