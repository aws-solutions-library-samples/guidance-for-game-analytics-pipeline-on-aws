-- Reads directly from Kinesis so AUTO REFRESH YES is legal.
CREATE MATERIALIZED VIEW new_users_last_month
AUTO REFRESH YES AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_timestamp',true)::BIGINT * interval '1 second')
  ) AS month,
  count(*) AS new_accounts
FROM kds."{stream_name}"
WHERE json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_type',true) = 'user_registration'
GROUP BY month;
