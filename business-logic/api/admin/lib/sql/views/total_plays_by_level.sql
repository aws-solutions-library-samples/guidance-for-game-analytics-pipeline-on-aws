CREATE OR REPLACE VIEW total_plays_by_level AS
SELECT
  events.payload.event.event_data.level_id::VARCHAR AS level,
  count(*) AS number_of_plays
FROM "{db_name}"."public"."event_data" events
WHERE events.payload.event.event_type::VARCHAR = 'level_started'
GROUP BY level
WITH NO SCHEMA BINDING;
