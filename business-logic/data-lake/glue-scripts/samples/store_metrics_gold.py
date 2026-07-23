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
GOLD LAYER Glue Job - Aggregate silver data into gold tables

This job processes:
1. User lifetime value (LTV) - cumulative user purchase metrics

This job should run AFTER the store_metrics silver job completes.
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
        "OUTPUT_DB_NAME",
        "USER_FIRST_JOIN_TABLE_NAME",
        "DAILY_USER_PURCHASE_METRICS_TABLE_NAME",
        "USER_LTV_TABLE_NAME",
    ],
)

job.init(args["JOB_NAME"], args)

# Job parameters
OUTPUT_DB_NAME = args["OUTPUT_DB_NAME"]
USER_FIRST_JOIN_TABLE_NAME = args["USER_FIRST_JOIN_TABLE_NAME"]
DAILY_USER_PURCHASE_METRICS_TABLE_NAME = args["DAILY_USER_PURCHASE_METRICS_TABLE_NAME"]
USER_LTV_TABLE_NAME = args["USER_LTV_TABLE_NAME"]

# Fully qualified table names
user_first_join_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_FIRST_JOIN_TABLE_NAME}"
daily_user_purchase_metrics_table = f"glue_catalog.{OUTPUT_DB_NAME}.{DAILY_USER_PURCHASE_METRICS_TABLE_NAME}"
user_ltv_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_LTV_TABLE_NAME}"


def get_latest_processed_date(table_name: str) -> str | None:
    """
    Get the latest tracked_date from an output table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(tracked_date) as max_date
            FROM {table_name}
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max date from {table_name}: {e}")
        return None


def get_latest_session_date() -> str | None:
    """
    Get the latest session date from the daily user purchase metrics table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(session_date) as max_date
            FROM {daily_user_purchase_metrics_table}
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max session date: {e}")
        return None


# Get the latest processed date from user_ltv (tracks daily processing progress)
latest_processed_date = get_latest_processed_date(user_ltv_table)

# Get the latest session date available
latest_session_date = get_latest_session_date()

print(f"Latest processed date: {latest_processed_date}")
print(f"Latest session date: {latest_session_date}")

# Determine the date to process
if latest_processed_date is None:
    print("No processed date found. Silver layer may not have run yet.")
    job.commit()
    exit(0)

# Check if we have purchase data to aggregate
if latest_session_date is None:
    print("No purchase data found. Nothing to aggregate.")
    job.commit()
    exit(0)

process_date = latest_processed_date
print(f"Processing gold aggregation for: {process_date}")

# =============================================================================
# GOLD LAYER - Aggregate silver data into gold tables
# =============================================================================

# -----------------------------------------------------------------------------
# Step 1: Update user LTV table (incremental MERGE)
# This is a cumulative metric - we need to recalculate all user LTVs
# whenever there's new purchase data, but we track by monetization_date
# -----------------------------------------------------------------------------

spark.sql(f"""
MERGE INTO {user_ltv_table} target
USING (
    WITH user_gross AS (
        SELECT 
            user_id,
            SUM(gross) AS lifetime_value,
            MIN(first_purchase_time) AS very_first_purchase
        FROM {daily_user_purchase_metrics_table}
        GROUP BY user_id
    )
    SELECT 
        user_gross.user_id,
        user_gross.lifetime_value,
        DATEDIFF(DAY, f.first_join_time, user_gross.very_first_purchase) AS days_to_first_monetization,
        CAST(user_gross.very_first_purchase AS DATE) AS monetization_date
    FROM user_gross
    JOIN {user_first_join_table} AS f ON user_gross.user_id = f.user_id
    WHERE CAST(user_gross.very_first_purchase AS DATE) = CAST('{process_date}' AS DATE)
) source
ON target.user_id = source.user_id
WHEN MATCHED THEN UPDATE SET
    target.lifetime_value = source.lifetime_value,
    target.days_to_first_monetization = source.days_to_first_monetization,
    target.monetization_date = source.monetization_date
WHEN NOT MATCHED THEN 
    INSERT (user_id, lifetime_value, days_to_first_monetization, monetization_date) 
    VALUES (source.user_id, source.lifetime_value, source.days_to_first_monetization, source.monetization_date)
""")
print(f"Updated user LTV table for {process_date}")

job.commit()
