CREATE MATERIALIZED VIEW new_users_last_month
AUTO REFRESH YES AS
SELECT
  date_trunc (
    'month',
    date (
      timestamp 'epoch' + event_timestamp * interval '1 second'
    )
  ) as month,
  count(*) as new_accounts
FROM
  "{db_name}"."public"."event_data"
WHERE
  event_type = 'user_registration'
GROUP BY
  month;
