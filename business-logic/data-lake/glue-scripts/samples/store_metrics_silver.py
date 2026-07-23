######################################################################################################################
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
# Permission is hereby granted, free of charge, to any person obtaining a copy of this
# software and associated documentation files (the "Software"), to deal in the Software
# without restriction, including without limitation the rights to use, copy, modify,
# merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
# permit persons to whom the Software is furnished to do so.
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
# INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
# PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
# HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
# OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
# SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
######################################################################################################################

"""
SILVER LAYER Glue Job - Process store events into silver tables

This job processes:
1. Daily item store metrics (clicks, purchases, gross revenue, transactions)
2. Daily user purchase metrics (user-level purchase data by session)
3. User first join timestamps (for LTV calculations)

This job should run AFTER the user_activity silver job (depends on sessions table).
"""

import sys
from datetime import datetime, timedelta
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

sc = SparkContext.getOrCreate()
sc.setLogLevel("INFO")
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

# Get Environmental variables

args = getResolvedOptions(
    sys.argv,
    [
        "JOB_NAME",
        "INPUT_DB_NAME",
        "OUTPUT_DB_NAME",
        "INPUT_TABLE_NAME",
        "ITEM_PRICES_TABLE_NAME",
        "SESSIONS_TABLE_NAME",
        "USER_FIRST_JOIN_TABLE_NAME",
        "DAILY_ITEM_STORE_METRICS_TABLE_NAME",
        "DAILY_USER_PURCHASE_METRICS_TABLE_NAME",
    ],
)

job.init(args["JOB_NAME"], args)

# Job parameters
INPUT_DB_NAME = args["INPUT_DB_NAME"]
OUTPUT_DB_NAME = args["OUTPUT_DB_NAME"]
INPUT_TABLE_NAME = args["INPUT_TABLE_NAME"]
ITEM_PRICES_TABLE_NAME = args["ITEM_PRICES_TABLE_NAME"]
SESSIONS_TABLE_NAME = args["SESSIONS_TABLE_NAME"]
USER_FIRST_JOIN_TABLE_NAME = args["USER_FIRST_JOIN_TABLE_NAME"]
DAILY_ITEM_STORE_METRICS_TABLE_NAME = args["DAILY_ITEM_STORE_METRICS_TABLE_NAME"]
DAILY_USER_PURCHASE_METRICS_TABLE_NAME = args["DAILY_USER_PURCHASE_METRICS_TABLE_NAME"]

# Fully qualified table names
input_table = f"glue_catalog.{INPUT_DB_NAME}.{INPUT_TABLE_NAME}"
item_prices_table = f"glue_catalog.{OUTPUT_DB_NAME}.{ITEM_PRICES_TABLE_NAME}"
sessions_table = f"glue_catalog.{OUTPUT_DB_NAME}.{SESSIONS_TABLE_NAME}"
user_first_join_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_FIRST_JOIN_TABLE_NAME}"
daily_item_store_metrics_table = f"glue_catalog.{OUTPUT_DB_NAME}.{DAILY_ITEM_STORE_METRICS_TABLE_NAME}"
daily_user_purchase_metrics_table = f"glue_catalog.{OUTPUT_DB_NAME}.{DAILY_USER_PURCHASE_METRICS_TABLE_NAME}"


def get_latest_processed_date(table_name: str) -> str | None:
    """
    Get the latest store_date from an output table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(store_date) as max_date
            FROM {table_name}
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max date from {table_name}: {e}")
        return None


def get_latest_event_date_from_input() -> str | None:
    """
    Get the latest event date from store events in the input table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(CAST(event_timestamp AS DATE)) as max_date
            FROM {input_table}
            WHERE event_name IN ('store_purchase', 'store_click')
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max date from input table: {e}")
        return None


# Get the latest processed date from daily_item_store_metrics (tracks daily processing progress)
latest_processed_date = get_latest_processed_date(daily_item_store_metrics_table)

# Get the latest event date from input
latest_event_date = get_latest_event_date_from_input()

print(f"Latest processed date: {latest_processed_date}")
print(f"Latest event date in input: {latest_event_date}")

# Determine the date to process (next day after last processed, or earliest event date if no prior processing)
if latest_processed_date is None:
    # First run - no prior processing, need to determine starting point
    # Process from the earliest event date
    try:
        result = spark.sql(f"""
            SELECT MIN(CAST(event_timestamp AS DATE)) as min_date
            FROM {input_table}
            WHERE event_name IN ('store_purchase', 'store_click')
        """)
        start_date = result.collect()[0][0]
        if start_date is None:
            print("No store events found in input table. Nothing to process.")
            job.commit()
            exit(0)
        process_date = str(start_date)
    except Exception as e:
        print(f"Could not determine start date: {e}")
        job.commit()
        exit(0)
else:
    # Incremental run - process the next day
    start_date = datetime.strptime(latest_processed_date, "%Y-%m-%d").date()
    process_date = (start_date + timedelta(days=1)).strftime("%Y-%m-%d")

# Check if we have data to process
if latest_event_date is None or process_date > latest_event_date:
    print(f"No new data to process. Process date: {process_date}, Latest event date: {latest_event_date}")
    job.commit()
    exit(0)

print(f"Processing date: {process_date}")

# Calculate date range for the day
start_range = process_date
end_range = (datetime.strptime(process_date, "%Y-%m-%d").date() + timedelta(days=1)).strftime("%Y-%m-%d")

# =============================================================================
# SILVER LAYER - Process raw events into silver tables
# =============================================================================

# -----------------------------------------------------------------------------
# Step 1: Update daily item store metrics (incremental MERGE)
# -----------------------------------------------------------------------------

spark.sql(f"""
MERGE INTO {daily_item_store_metrics_table} target
USING (
    WITH purchases AS (
        SELECT 
            get_json_object(event_data, '$.item') AS item_id, 
            CAST(get_json_object(event_data, '$.quantity') AS INT) AS quantity,
            event_timestamp
        FROM {input_table} 
        WHERE event_name = 'store_purchase'
            AND event_timestamp >= '{start_range}' 
            AND event_timestamp < '{end_range}'
    ),
    purchase_metrics AS (
        SELECT 
            purchases.item_id, 
            CAST(SUM(purchases.quantity) AS INT) AS quantity, 
            CAST(SUM(purchases.quantity * prices.price) AS DECIMAL(38, 2)) AS gross, 
            COUNT(*) AS transactions
        FROM purchases
        JOIN {item_prices_table} prices ON purchases.item_id = prices.item_name
        GROUP BY purchases.item_id
    ),
    clicks AS (
        SELECT 
            get_json_object(event_data, '$.item') AS item_id, 
            COUNT(*) AS clicks
        FROM {input_table} 
        WHERE event_name = 'store_click'
            AND event_timestamp >= '{start_range}' 
            AND event_timestamp < '{end_range}'
        GROUP BY get_json_object(event_data, '$.item')
    )
    SELECT 
        clicks.item_id AS item_id, 
        clicks.clicks AS clicks,
        COALESCE(purchase_metrics.quantity, 0) AS quantity,
        COALESCE(purchase_metrics.gross, 0) AS gross,
        COALESCE(purchase_metrics.transactions, 0) AS transactions
    FROM clicks
    LEFT JOIN purchase_metrics ON clicks.item_id = purchase_metrics.item_id
) source
ON target.item_id = source.item_id AND target.store_date = CAST('{start_range}' AS DATE)
WHEN MATCHED THEN UPDATE SET
    target.clicks = source.clicks,
    target.quantity = source.quantity,
    target.gross = source.gross,
    target.transactions = source.transactions
WHEN NOT MATCHED THEN 
    INSERT (store_date, item_id, clicks, quantity, gross, transactions) 
    VALUES (CAST('{start_range}' AS DATE), source.item_id, source.clicks, source.quantity, source.gross, source.transactions)
""")
print(f"Updated daily item store metrics table for {process_date}")

# -----------------------------------------------------------------------------
# Step 2: Update daily user purchase metrics (incremental INSERT)
# -----------------------------------------------------------------------------

spark.sql(f"""
INSERT INTO {daily_user_purchase_metrics_table}
WITH purchases AS (
    SELECT 
        get_json_object(event_data, '$.item') AS item_id, 
        get_json_object(event_data, '$.session_id') AS session_id, 
        CAST(get_json_object(event_data, '$.quantity') AS INT) AS quantity,
        event_timestamp
    FROM {input_table}
    WHERE event_name = 'store_purchase'
        AND event_timestamp >= '{start_range}' 
        AND event_timestamp < '{end_range}'
),
session_purchases AS (
    SELECT    
        pu.session_id,
        CAST(SUM(pu.quantity * pr.price) AS DECIMAL(38, 2)) AS gross, 
        MIN(pu.event_timestamp) AS first_purchase_time
    FROM purchases AS pu
    JOIN {item_prices_table} AS pr ON pu.item_id = pr.item_name
    GROUP BY pu.session_id
)
SELECT
    s.user_id,
    p.gross,
    p.first_purchase_time,
    CAST(s.session_timestamp AS DATE) AS session_date
FROM session_purchases AS p
JOIN {sessions_table} AS s ON p.session_id = s.session_id
WHERE CAST(s.session_timestamp AS DATE) = CAST('{start_range}' AS DATE)
""")
print(f"Updated daily user purchase metrics table for {process_date}")

# -----------------------------------------------------------------------------
# Step 3: Update user first join table (incremental MERGE)
# This may already be populated by user_activity job, but we ensure it exists here
# for the gold layer LTV calculation
# -----------------------------------------------------------------------------

spark.sql(f"""
MERGE INTO {user_first_join_table} target
USING (
    SELECT 
        get_json_object(event_data, '$.user_id') AS user_id, 
        MIN(event_timestamp) AS first_join_time
    FROM {input_table} 
    WHERE event_name = 'user_login'
        AND event_timestamp >= '{start_range}' 
        AND event_timestamp < '{end_range}'
    GROUP BY get_json_object(event_data, '$.user_id')
) source
ON target.user_id = source.user_id
WHEN NOT MATCHED THEN 
    INSERT (user_id, first_join_time) 
    VALUES (source.user_id, source.first_join_time)
""")
print(f"Updated user first join table for {process_date}")

job.commit()
