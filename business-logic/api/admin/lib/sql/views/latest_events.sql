-- NOTE: Materialized views do not support ORDER BY or LIMIT.
-- This remains a regular view for the "latest 10 events" use case.
CREATE OR REPLACE VIEW
  latest_events AS
SELECT
  events.payload.event.event_id::VARCHAR AS event_id,
  events.payload.event.event_type::VARCHAR AS event_type,
  events.payload.event.event_name::VARCHAR AS event_name,
  events.payload.event.event_timestamp::BIGINT AS event_timestamp
FROM
  "{db_name}"."public"."event_data" events
ORDER BY
  events.payload.event.event_timestamp::BIGINT DESC
LIMIT
  10
WITH
  NO SCHEMA BINDING;
