CREATE OR REPLACE VIEW
  total_iap_transactions_last_month AS
WITH
  detail AS (
    SELECT
      date_trunc (
        'month',
        date (
          timestamp 'epoch' + events.payload.event.event_timestamp::BIGINT * interval '1 second'
        )
      ) as event_month,
      events.payload.application_id::VARCHAR as application_id,
      events.payload.event.event_type::VARCHAR as event_type,
      events.payload.event.event_data.transaction_id::VARCHAR as transaction_id
    FROM
      "{db_name}"."public"."event_data_mv" events
  )
SELECT
  date_trunc ('month', event_month) as month,
  application_id,
  count(DISTINCT transaction_id) as transaction_count
FROM
  detail
WHERE
  transaction_id IS NOT NULL
  AND event_type = 'iap_transaction'
GROUP BY
  date_trunc ('month', event_month),
  application_id
WITH
  NO SCHEMA BINDING;