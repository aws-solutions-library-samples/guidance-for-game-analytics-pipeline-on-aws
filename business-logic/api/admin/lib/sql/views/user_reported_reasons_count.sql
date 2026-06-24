CREATE OR REPLACE VIEW user_reported_reasons_count AS
SELECT
  events.event_data.event.event_data.report_reason::VARCHAR AS reason,
  count(*) AS reason_count
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_type::VARCHAR = 'user_report'
GROUP BY reason
WITH NO SCHEMA BINDING;
