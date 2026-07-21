CREATE OR REPLACE VIEW
  event_data AS
SELECT
  events.refresh_time,
  events.approximate_arrival_timestamp,
  events.partition_key,
  events.shard_id,
  events.sequence_number,
  events.payload.event.event_id::VARCHAR AS event_id,
  events.payload.event.event_type::VARCHAR AS event_type,
  events.payload.event.event_name::VARCHAR AS event_name,
  events.payload.event.event_version::VARCHAR AS event_version,
  events.payload.event.event_timestamp::BIGINT AS event_timestamp,
  events.payload.event.app_version::VARCHAR AS app_version,
  events.payload.application_id::VARCHAR AS application_id,
  events.payload.event.application_name::VARCHAR AS application_name,
  JSON_SERIALIZE(events.payload.event.event_data) AS event_data,
  JSON_SERIALIZE(events.payload.event.metadata) AS metadata
FROM
  "{db_name}"."public"."event_data_mv" events
WITH
  NO SCHEMA BINDING;
