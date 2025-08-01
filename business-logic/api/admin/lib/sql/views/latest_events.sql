CREATE OR REPLACE VIEW
  latest_events AS
SELECT
  *,
  timestamp 'epoch' + event_timestamp * interval '1 second' AS parsed_date
FROM
  "{db_name}"."public"."event_data"
ORDER BY
  parsed_date DESC
LIMIT
  10
WITH
  NO SCHEMA BINDING;