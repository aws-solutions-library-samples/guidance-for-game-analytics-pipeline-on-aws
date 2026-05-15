CREATE MATERIALIZED VIEW total_iap_transactions_last_month
AUTO REFRESH YES AS
SELECT
  date_trunc (
    'month',
    date (
      timestamp 'epoch' + event_timestamp * interval '1 second'
    )
  ) as month,
  application_id,
  count(
    DISTINCT JSON_EXTRACT_PATH_TEXT (event_data, 'transaction_id')
  ) as transaction_count
FROM
  "{db_name}"."public"."event_data"
WHERE
  JSON_EXTRACT_PATH_TEXT (event_data, 'transaction_id') is NOT null
  AND event_type = 'iap_transaction'
GROUP BY
  month,
  application_id;
