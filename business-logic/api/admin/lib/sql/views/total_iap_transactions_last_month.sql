CREATE OR REPLACE VIEW total_iap_transactions_last_month AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + events.event_data.event.event_timestamp::BIGINT * interval '1 second')
  ) AS month,
  events.event_data.application_id::VARCHAR AS application_id,
  count(*) AS transaction_count
FROM "{db_name}"."public"."event_data" events
WHERE events.event_data.event.event_type::VARCHAR = 'iap_transaction'
  AND events.event_data.event.event_data.transaction_id IS NOT NULL
GROUP BY month, application_id
WITH NO SCHEMA BINDING;
