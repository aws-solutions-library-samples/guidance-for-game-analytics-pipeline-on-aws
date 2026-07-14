CREATE OR REPLACE VIEW
  user_reported_reasons_count AS
SELECT
  COUNT(events.payload.event.event_data.report_reason::VARCHAR) as count_of_reports,
  events.payload.event.event_data.report_reason::VARCHAR as report_reason
FROM
  "{db_name}"."public"."event_data" events
GROUP BY
  events.payload.event.event_data.report_reason::VARCHAR
ORDER BY
  events.payload.event.event_data.report_reason::VARCHAR DESC
WITH
  NO SCHEMA BINDING;