CREATE OR REPLACE VIEW
  new_users_last_month AS
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
  count(*) as new_accounts
FROM
  detail
WHERE
  event_type = 'user_registration'
GROUP BY
  date_trunc ('month', event_month)
WITH
  NO SCHEMA BINDING;