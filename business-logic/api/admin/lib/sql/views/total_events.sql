CREATE OR REPLACE VIEW
  total_events AS
SELECT
  events.payload.application_id::VARCHAR as application_id,
  COUNT(DISTINCT events.payload.event.event_id::VARCHAR) AS event_count
FROM
  "{db_name}"."public"."event_data" events
GROUP BY
  events.payload.application_id::VARCHAR
WITH
  NO SCHEMA BINDING;