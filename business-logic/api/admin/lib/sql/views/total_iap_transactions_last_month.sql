CREATE OR REPLACE VIEW total_iap_transactions_last_month AS
SELECT
  date_trunc(
    'month',
    date(timestamp 'epoch' + events.payload.event.event_timestamp::BIGINT * interval '1 second')
  ) AS month,
  events.payload.application_id::VARCHAR AS application_id,
  count(*) AS transaction_count
FROM "{db_name}"."public"."event_data" events
WHERE events.payload.event.event_type::VARCHAR = 'iap_transaction'
  AND events.payload.event.event_data.transaction_id IS NOT NULL
GROUP BY month, application_id
WITH NO SCHEMA BINDING;
