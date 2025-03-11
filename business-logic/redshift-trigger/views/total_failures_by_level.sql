CREATE VIEW
  total_failures_by_level AS
SELECT
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
  count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as number_of_failures
FROM
  "events"."public"."event_data"
WHERE
  event_type = 'level_failed'
GROUP BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
ORDER by
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id');