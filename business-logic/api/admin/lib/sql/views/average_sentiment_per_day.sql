CREATE OR REPLACE VIEW
  average_sentiment_per_day AS
SELECT
  avg(
    CAST(
      JSON_EXTRACT_PATH_TEXT (event_data, 'user_rating') AS real
    )
  ) AS average_user_rating,
  date (
    timestamp 'epoch' + event_timestamp * interval '1 second'
  ) as event_date
FROM
  "{db_name}"."public"."event_data"
WHERE
  JSON_EXTRACT_PATH_TEXT (event_data, 'user_rating') is not null
GROUP BY
  event_date
WITH
  NO SCHEMA BINDING;