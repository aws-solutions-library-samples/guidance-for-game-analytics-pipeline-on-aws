-- NOTE: Materialized views do not support ORDER BY or LIMIT.
-- This remains a regular view for the "latest 10 events" use case.
CREATE OR REPLACE VIEW
  latest_events AS
SELECT
  event_id,
  event_type,
  event_name,
  event_timestamp
FROM
  "{db_name}"."public"."event_data"
ORDER BY
  event_timestamp DESC
LIMIT
  10
WITH
  NO SCHEMA BINDING;
