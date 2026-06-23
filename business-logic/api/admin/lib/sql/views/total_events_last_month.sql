-- Reads directly from Kinesis so AUTO REFRESH YES is legal.
-- Note: COUNT(*) instead of COUNT(DISTINCT event_id) for streaming-MV compatibility.
CREATE MATERIALIZED VIEW total_events_last_month
AUTO REFRESH YES AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_timestamp',true)::BIGINT * interval '1 second')
  ) AS month,
  json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'application_id',true)::TEXT AS application_id,
  count(*) AS event_count
FROM kds."{stream_name}"
GROUP BY month, application_id;
