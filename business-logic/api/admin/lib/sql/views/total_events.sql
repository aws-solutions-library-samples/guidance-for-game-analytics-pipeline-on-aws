CREATE MATERIALIZED VIEW total_events
AUTO REFRESH YES AS
SELECT
  application_id,
  COUNT(DISTINCT event_id) AS event_count
FROM
  "{db_name}"."public"."event_data"
GROUP BY
  application_id;
