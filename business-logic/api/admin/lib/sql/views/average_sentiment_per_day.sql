CREATE OR REPLACE VIEW
  average_sentiment_per_day AS
SELECT
  avg(events.payload.event.event_data.user_rating::REAL) AS average_user_rating,
  date (
    timestamp 'epoch' + events.payload.event.event_timestamp::BIGINT * interval '1 second'
  ) as event_date
FROM
  "{db_name}"."public"."event_data" events
WHERE
  events.payload.event.event_data.user_rating IS NOT NULL
GROUP BY
  event_date
WITH
  NO SCHEMA BINDING;