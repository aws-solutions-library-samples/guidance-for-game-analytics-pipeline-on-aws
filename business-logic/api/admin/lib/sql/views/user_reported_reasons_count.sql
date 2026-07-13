CREATE OR REPLACE VIEW user_reported_reasons_count AS
SELECT
  events.payload.event.event_data.report_reason::VARCHAR AS reason,
  count(*) AS reason_count
FROM "{db_name}"."public"."event_data" events
WHERE events.payload.event.event_type::VARCHAR = 'user_report'
GROUP BY reason
WITH NO SCHEMA BINDING;
