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
1. Daily session stats (aggregated from sessions table)

This job should run AFTER the silver layer job completes.
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
        "USER_COUNTS_TABLE_NAME",
        "SESSIONS_TABLE_NAME",
        "DAILY_SESSION_STATS_TABLE_NAME",
    ],
)

job.init(args["JOB_NAME"], args)

# Job parameters
OUTPUT_DB_NAME = args["OUTPUT_DB_NAME"]
USER_COUNTS_TABLE_NAME = args["USER_COUNTS_TABLE_NAME"]
SESSIONS_TABLE_NAME = args["SESSIONS_TABLE_NAME"]
DAILY_SESSION_STATS_TABLE_NAME = args["DAILY_SESSION_STATS_TABLE_NAME"]

# Fully qualified table names
user_counts_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_COUNTS_TABLE_NAME}"
sessions_table = f"glue_catalog.{OUTPUT_DB_NAME}.{SESSIONS_TABLE_NAME}"
daily_session_stats_table = f"glue_catalog.{OUTPUT_DB_NAME}.{DAILY_SESSION_STATS_TABLE_NAME}"


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
    Get the latest session date from the sessions table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(CAST(session_timestamp AS DATE)) as max_date
            FROM {sessions_table}
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max session date: {e}")
        return None


# Get the latest processed date from user_counts (tracks daily processing progress)
latest_processed_date = get_latest_processed_date(user_counts_table)

# Get the latest session date available
latest_session_date = get_latest_session_date()

print(f"Latest processed date: {latest_processed_date}")
print(f"Latest session date: {latest_session_date}")

# Determine the date to process
if latest_processed_date is None:
    print("No processed date found. Silver layer may not have run yet.")
    job.commit()
    exit(0)

# Check if we have sessions to aggregate
if latest_session_date is None:
    print("No sessions found. Nothing to aggregate.")
    job.commit()
    exit(0)

process_date = latest_processed_date
print(f"Processing gold aggregation for: {process_date}")

# =============================================================================
# GOLD LAYER - Aggregate silver data into gold tables
# =============================================================================

# -----------------------------------------------------------------------------
# Step 1: Update daily session stats (gold layer)
# -----------------------------------------------------------------------------

# Calculate daily aggregates from sessions table for the processed date
# Use MERGE to handle reprocessing/upserts
spark.sql(f"""
MERGE INTO {daily_session_stats_table} target
USING (
    SELECT 
        SUM(session_duration_secs) AS total_playtime,
        AVG(session_duration_secs) AS avg_playtime,
        COUNT(*) AS session_count,
        CAST(session_timestamp AS DATE) AS session_date
    FROM {sessions_table}
    WHERE CAST(session_timestamp AS DATE) = CAST('{process_date}' AS DATE)
    GROUP BY CAST(session_timestamp AS DATE)
) source
ON target.session_date = source.session_date
WHEN MATCHED THEN UPDATE SET
    target.total_playtime = source.total_playtime,
    target.avg_playtime = source.avg_playtime,
    target.session_count = source.session_count
WHEN NOT MATCHED THEN 
    INSERT (session_date, total_playtime, avg_playtime, session_count) 
    VALUES (source.session_date, source.total_playtime, source.avg_playtime, source.session_count)
""")
print(f"Updated daily session stats for {process_date}")

job.commit()
