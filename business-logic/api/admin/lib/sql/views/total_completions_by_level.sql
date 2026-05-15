CREATE MATERIALIZED VIEW total_completions_by_level
AUTO REFRESH YES AS
SELECT
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
  count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as completions
FROM
  "{db_name}"."public"."event_data"
WHERE
  event_type = 'level_completed'
GROUP BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id');
