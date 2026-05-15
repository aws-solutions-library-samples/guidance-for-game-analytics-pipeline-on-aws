CREATE MATERIALIZED VIEW user_reported_reasons_count
AUTO REFRESH YES AS
SELECT
  JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason') as reason,
  COUNT(
    JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason')
  ) as reason_count
FROM
  "{db_name}"."public"."event_data"
WHERE
  event_type = 'user_report'
GROUP BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'report_reason');
