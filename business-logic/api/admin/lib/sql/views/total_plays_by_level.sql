-- Reads directly from Kinesis so AUTO REFRESH YES is legal.
CREATE MATERIALIZED VIEW total_plays_by_level
AUTO REFRESH YES AS
SELECT
  json_extract_path_text(
    json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true),
    'level_id'
  ) AS level,
  count(*) AS number_of_plays
FROM kds."{stream_name}"
WHERE json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_type',true) = 'level_started'
GROUP BY level;
