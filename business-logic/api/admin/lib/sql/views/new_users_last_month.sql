CREATE OR REPLACE VIEW new_users_last_month AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + events.event_data.event.event_timestamp::BIGINT * interval '1 second')
  ) AS month,
  count(*) AS new_accounts
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_type::VARCHAR = 'user_registration'
GROUP BY month
WITH NO SCHEMA BINDING;
