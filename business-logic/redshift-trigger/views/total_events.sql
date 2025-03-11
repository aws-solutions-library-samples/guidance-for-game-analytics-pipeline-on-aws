CREATE VIEW
  total_events AS
SELECT
  application_id,
  COUNT(DISTINCT event_id) AS event_count
FROM
  "events"."public"."event_data"
GROUP BY
  application_id;