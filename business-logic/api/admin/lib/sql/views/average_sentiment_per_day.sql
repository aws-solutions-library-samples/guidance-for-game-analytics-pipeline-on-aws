CREATE OR REPLACE VIEW average_sentiment_per_day AS
SELECT
  date(timestamp 'epoch' + events.event_data.event.event_timestamp::BIGINT * interval '1 second') AS event_date,
  avg(events.event_data.event.event_data.user_rating::REAL) AS average_user_rating
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_data.user_rating IS NOT NULL
GROUP BY event_date
WITH NO SCHEMA BINDING;
