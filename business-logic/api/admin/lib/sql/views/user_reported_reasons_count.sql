-- Reads directly from Kinesis so AUTO REFRESH YES is legal.
CREATE MATERIALIZED VIEW user_reported_reasons_count
AUTO REFRESH YES AS
SELECT
  json_extract_path_text(
    json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true),
    'report_reason'
  ) AS reason,
  count(*) AS reason_count
FROM kds."{stream_name}"
WHERE json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_type',true) = 'user_report'
GROUP BY reason;
