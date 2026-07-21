CREATE OR REPLACE VIEW
  new_users_last_month AS
WITH
  detail AS (
    SELECT
      date_trunc (
        'month',
        date (
          timestamp 'epoch' + events.payload.event.event_timestamp::BIGINT * interval '1 second'
        )
      ) as event_month,
      events.payload.event.event_type::VARCHAR as event_type
    FROM
      "{db_name}"."public"."event_data_mv" events
  )
SELECT
  date_trunc ('month', event_month) as month,
  count(*) as new_accounts
FROM
  detail
WHERE
  event_type = 'user_registration'
GROUP BY
  date_trunc ('month', event_month)
WITH
  NO SCHEMA BINDING;