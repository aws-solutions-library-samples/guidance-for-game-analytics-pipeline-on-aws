-- Reads directly from Kinesis so AUTO REFRESH YES is legal (Redshift forbids auto-refresh on MVs of MVs).
-- Note: COUNT(*) instead of COUNT(DISTINCT event_id) because streaming MVs do not support DISTINCT aggregates.
-- Each event_id appears exactly once in the stream, so the result matches.
CREATE MATERIALIZED VIEW total_events
AUTO REFRESH YES AS
SELECT
  json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'application_id',true)::TEXT AS application_id,
  count(*) AS event_count
FROM kds."{stream_name}"
GROUP BY application_id;
