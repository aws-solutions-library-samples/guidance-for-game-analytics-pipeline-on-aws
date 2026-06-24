CREATE OR REPLACE VIEW total_events_last_month AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + events.event_data.event.event_timestamp::BIGINT * interval '1 second')
  ) AS month,
  events.event_data.application_id::VARCHAR AS application_id,
  count(*) AS event_count
FROM "{db_name}"."public"."event_data" events
GROUP BY month, application_id
WITH NO SCHEMA BINDING;
