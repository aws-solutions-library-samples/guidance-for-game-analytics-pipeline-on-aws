CREATE OR REPLACE VIEW total_failures_by_level AS
SELECT
  events.event_data.event.event_data.level_id::VARCHAR AS level,
  count(*) AS failures
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_type::VARCHAR = 'level_failed'
GROUP BY level
WITH NO SCHEMA BINDING;
