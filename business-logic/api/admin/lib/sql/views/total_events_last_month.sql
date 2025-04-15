CREATE OR REPLACE VIEW
  total_events_last_month AS
WITH
  detail AS (
    SELECT
      date_trunc (
        'month',
        date (
          timestamp 'epoch' + event_timestamp * interval '1 second'
        )
      ) as event_month,
      *
    FROM
      "events"."public"."event_data"
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