CREATE VIEW
  user_reported_reasons_count AS
SELECT
  COUNT(
    JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason')
  ) as count_of_reports,
  JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason') as report_reason
FROM
  "events"."public"."event_data"
GROUP BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason')
ORDER BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason') DESC
WITH
  NO SCHEMA BINDING;