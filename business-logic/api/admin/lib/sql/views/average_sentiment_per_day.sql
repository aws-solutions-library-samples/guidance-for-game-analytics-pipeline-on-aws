-- Reads directly from Kinesis so AUTO REFRESH YES is legal.
CREATE MATERIALIZED VIEW average_sentiment_per_day
AUTO REFRESH YES AS
SELECT
  date(timestamp 'epoch' + json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_timestamp',true)::BIGINT * interval '1 second') AS event_date,
  avg(
    cast(
      json_extract_path_text(
        json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true),
        'user_rating'
      ) AS REAL
    )
  ) AS average_user_rating
FROM kds."{stream_name}"
WHERE json_extract_path_text(
        json_extract_path_text(from_varbyte(kinesis_data,'utf-8'),'event','event_data',true),
        'user_rating'
      ) IS NOT NULL
GROUP BY event_date;
