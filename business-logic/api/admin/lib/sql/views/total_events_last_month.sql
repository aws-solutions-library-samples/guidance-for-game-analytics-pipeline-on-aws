CREATE OR REPLACE VIEW
  total_events_last_month AS
WITH
  detail AS (
    SELECT
      date_trunc (
        'month',
        date (
          timestamp 'epoch' + events.payload.event.event_timestamp::BIGINT * interval '1 second'
        )
      ) as event_month,
      events.payload.application_id::VARCHAR as application_id,
      events.payload.event.event_id::VARCHAR as event_id
    FROM
      "{db_name}"."public"."event_data" events
  )
SELECT
  date_trunc ('month', event_month) as month,
  application_id,
  count(DISTINCT event_id) as event_count
FROM
  detail
GROUP BY
  date_trunc ('month', event_month),
  application_id
WITH
  NO SCHEMA BINDING;