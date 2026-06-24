CREATE OR REPLACE VIEW total_failures_by_level AS
SELECT
  events.payload.event.event_data.level_id::VARCHAR AS level,
  count(*) AS failures
FROM "{db_name}"."public"."event_data" events
WHERE events.payload.event.event_type::VARCHAR = 'level_failed'
GROUP BY level
WITH NO SCHEMA BINDING;
