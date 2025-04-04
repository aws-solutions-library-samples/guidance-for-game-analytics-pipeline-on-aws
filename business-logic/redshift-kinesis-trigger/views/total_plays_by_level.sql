CREATE VIEW
  total_plays_by_level AS
SELECT
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id') as level,
  count(JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')) as number_of_plays
FROM
  "events"."public"."event_data"
WHERE
  event_type = 'level_started'
GROUP BY
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
ORDER by
  JSON_EXTRACT_PATH_TEXT (event_data, 'level_id')
WITH
  NO SCHEMA BINDING;