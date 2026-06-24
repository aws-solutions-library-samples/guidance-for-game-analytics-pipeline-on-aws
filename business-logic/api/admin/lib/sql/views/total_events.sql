CREATE OR REPLACE VIEW total_events AS
SELECT
  events.payload.application_id::VARCHAR AS application_id,
  count(*) AS event_count
FROM "{db_name}"."public"."event_data" events
GROUP BY application_id
WITH NO SCHEMA BINDING;
