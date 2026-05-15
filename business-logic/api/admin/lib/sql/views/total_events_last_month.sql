CREATE MATERIALIZED VIEW total_events_last_month
AUTO REFRESH YES AS
SELECT
  date_trunc (
    'month',
    date (
      timestamp 'epoch' + event_timestamp * interval '1 second'
    )
  ) as month,
  application_id,
  count(DISTINCT event_id) as event_count
FROM
  "{db_name}"."public"."event_data"
GROUP BY
  month,
  application_id;
