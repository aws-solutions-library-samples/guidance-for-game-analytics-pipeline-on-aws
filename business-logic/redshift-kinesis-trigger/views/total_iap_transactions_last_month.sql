CREATE OR REPLACE VIEW
  total_iap_transactions_last_month AS
WITH
  detail AS (
    SELECT
      date_trunc (
        'month',
        date (
          timestamp 'epoch' + event_timestamp * interval '1 second'
        )
      ) as event_month,
      *
    FROM
      "events"."public"."event_data"
  )
SELECT
  date_trunc ('month', event_month) as month,
  application_id,
  count(
    DISTINCT JSON_EXTRACT_PATH_TEXT (event_data, 'transaction_id')
  ) as transaction_count
FROM
  detail
WHERE
  JSON_EXTRACT_PATH_TEXT (event_data, 'transaction_id') is NOT null
  AND event_type = 'iap_transaction'
GROUP BY
  date_trunc ('month', event_month),
  application_id
WITH
  NO SCHEMA BINDING;