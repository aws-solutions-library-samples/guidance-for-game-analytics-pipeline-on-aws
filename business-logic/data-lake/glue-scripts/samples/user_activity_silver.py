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
SILVER LAYER Glue Job - Process raw events into silver tables

This job processes:
1. User status updates (CURRENT/AT-RISK/DORMANT)
2. User status transitions
3. User counts by status
4. User first join timestamps
5. Sessions (login/logout pairs)
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
        "USER_STATUS_TABLE_NAME",
        "USER_TRANSITION_TABLE_NAME",
        "USER_COUNTS_TABLE_NAME",
        "USER_FIRST_JOIN_TABLE_NAME",
        "SESSIONS_TABLE_NAME",
    ],
)

job.init(args["JOB_NAME"], args)

# Job parameters
INPUT_DB_NAME = args["INPUT_DB_NAME"]
OUTPUT_DB_NAME = args["OUTPUT_DB_NAME"]
INPUT_TABLE_NAME = args["INPUT_TABLE_NAME"]
USER_STATUS_TABLE_NAME = args["USER_STATUS_TABLE_NAME"]
USER_TRANSITION_TABLE_NAME = args["USER_TRANSITION_TABLE_NAME"]
USER_COUNTS_TABLE_NAME = args["USER_COUNTS_TABLE_NAME"]
USER_FIRST_JOIN_TABLE_NAME = args["USER_FIRST_JOIN_TABLE_NAME"]
SESSIONS_TABLE_NAME = args["SESSIONS_TABLE_NAME"]

# Fully qualified table names
input_table = f"glue_catalog.{INPUT_DB_NAME}.{INPUT_TABLE_NAME}"
user_status_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_STATUS_TABLE_NAME}"
user_transition_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_TRANSITION_TABLE_NAME}"
user_counts_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_COUNTS_TABLE_NAME}"
user_first_join_table = f"glue_catalog.{OUTPUT_DB_NAME}.{USER_FIRST_JOIN_TABLE_NAME}"
sessions_table = f"glue_catalog.{OUTPUT_DB_NAME}.{SESSIONS_TABLE_NAME}"


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


def get_latest_event_date_from_input() -> str | None:
    """
    Get the latest event date from the input events table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(CAST(event_timestamp AS DATE)) as max_date
            FROM {input_table}
            WHERE event_name = 'user_login'
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max date from input table: {e}")
        return None


# Get the latest processed date from user_counts (tracks daily processing progress)
latest_processed_date = get_latest_processed_date(user_counts_table)

# Get the latest event date from input
latest_event_date = get_latest_event_date_from_input()

print(f"Latest processed date: {latest_processed_date}")
print(f"Latest event date in input: {latest_event_date}")

# Determine the date to process (next day after last processed, or today if no prior processing)
if latest_processed_date is None:
    # First run - no prior processing, need to determine starting point
    # Process from the earliest event date
    try:
        result = spark.sql(f"""
            SELECT MIN(CAST(event_timestamp AS DATE)) as min_date
            FROM {input_table}
            WHERE event_name = 'user_login'
        """)
        start_date = result.collect()[0][0]
        if start_date is None:
            print("No user_login events found in input table. Nothing to process.")
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
# Step 1: MERGE user status changes for the day
# -----------------------------------------------------------------------------

spark.sql(f"""
MERGE INTO {user_status_table} target
USING (
    SELECT 
        get_json_object(event_data, '$.user_id') AS user_id, 
        CAST(to_timestamp(MAX(event_timestamp)) AS date) AS last_active_date
    FROM {input_table} 
    WHERE event_name = 'user_login' 
        AND event_timestamp >= '{start_range}' 
        AND event_timestamp < '{end_range}'
    GROUP BY user_id
) source
ON target.user_id = source.user_id
WHEN MATCHED THEN UPDATE SET
    target.status = 'CURRENT',
    target.last_active_date = source.last_active_date
WHEN NOT MATCHED BY target THEN 
    INSERT (user_id, status, last_active_date) 
    VALUES (source.user_id, 'CURRENT', source.last_active_date)
WHEN NOT MATCHED BY source AND (target.status = 'CURRENT' AND DATEDIFF(to_date('{start_range}', 'yyyy-MM-dd'), target.last_active_date) < 28) THEN UPDATE SET
    target.status = 'AT-RISK'
WHEN NOT MATCHED BY source AND (target.status = 'AT-RISK' AND DATEDIFF(to_date('{start_range}', 'yyyy-MM-dd'), target.last_active_date) >= 28) THEN UPDATE SET
    target.status = 'DORMANT'
""")
print(f"Updated user status table for {process_date}")

# -----------------------------------------------------------------------------
# Step 2: Record status transitions
# -----------------------------------------------------------------------------

# Get snapshot info for version comparison
update_stat = spark.sql(
    f"SELECT * FROM {user_status_table}.snapshots ORDER BY committed_at DESC LIMIT 1;"
).first()
snapshot, parent = update_stat.snapshot_id, update_stat.parent_id

if parent is None:
    # No parent, assume every user is a new conversion
    spark.sql(f"""
    WITH new_version AS (
        SELECT user_id, status FROM {user_status_table} VERSION AS OF {snapshot}
    )
    INSERT INTO {user_transition_table}
    SELECT 
        CAST('{start_range}' AS date) AS transition_date, 
        'NON-PLAYER' AS from_status, 
        new_version.status AS to_status, 
        COUNT(*) AS count
    FROM new_version
    GROUP BY new_version.status
    """)
else:
    # Get incremental changes and do a left join
    spark.sql(f"""
    WITH old_version AS (
        SELECT * FROM {user_status_table} VERSION AS OF {parent}
    ), new_version AS (
        SELECT * FROM {user_status_table} VERSION AS OF {snapshot}
    )
    INSERT INTO {user_transition_table}
    SELECT 
        CAST('{start_range}' AS date) AS transition_date, 
        COALESCE(old_version.status, 'NON-PLAYER') AS from_status, 
        new_version.status AS to_status, 
        COUNT(*) AS count
    FROM new_version 
    LEFT JOIN old_version ON new_version.user_id = old_version.user_id
    WHERE old_version.status IS NULL 
        OR new_version.status <> old_version.status 
        OR new_version.last_active_date <> old_version.last_active_date
    GROUP BY new_version.status, old_version.status
    """)
print(f"Recorded status transitions for {process_date}")

# -----------------------------------------------------------------------------
# Step 3: Record user counts by status
# -----------------------------------------------------------------------------

spark.sql(f"""
INSERT INTO {user_counts_table}
SELECT 
    CAST('{start_range}' AS date) AS tracked_date, 
    status, 
    COUNT(*) AS count
FROM {user_status_table}
GROUP BY status
""")
print(f"Recorded user counts for {process_date}")

# -----------------------------------------------------------------------------
# Step 4: Update user first join table (incremental)
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
    GROUP BY user_id
) source
ON target.user_id = source.user_id
WHEN NOT MATCHED THEN 
    INSERT (user_id, first_join_time) 
    VALUES (source.user_id, source.first_join_time)
""")
print(f"Updated user first join table for {process_date}")

# -----------------------------------------------------------------------------
# Step 5: Update sessions table (incremental)
# -----------------------------------------------------------------------------

spark.sql(f"""
MERGE INTO {sessions_table} target
USING (
    WITH logins AS (
        SELECT 
            event_timestamp,
            get_json_object(event_data, '$.session_id') AS session_id
        FROM {input_table} 
        WHERE event_name = 'user_login'
            AND event_timestamp >= '{start_range}' 
            AND event_timestamp < '{end_range}'
    ),
    logouts AS (
        SELECT 
            event_timestamp,
            get_json_object(event_data, '$.session_id') AS session_id,
            get_json_object(event_data, '$.user_id') AS user_id
        FROM {input_table} 
        WHERE event_name = 'user_logout'
            AND event_timestamp >= '{start_range}' 
            AND event_timestamp < '{end_range}'
    )
    SELECT 
        lo.session_id,
        lo.user_id,
        lo.event_timestamp AS session_timestamp,
        UNIX_SECONDS(CAST(lo.event_timestamp AS TIMESTAMP)) - UNIX_SECONDS(CAST(li.event_timestamp AS TIMESTAMP)) AS session_duration_secs
    FROM logouts lo
    JOIN logins li ON lo.session_id = li.session_id
) source
ON target.session_id = source.session_id
WHEN NOT MATCHED THEN 
    INSERT (session_id, user_id, session_timestamp, session_duration_secs) 
    VALUES (source.session_id, source.user_id, source.session_timestamp, source.session_duration_secs)
""")
print(f"Updated sessions table for {process_date}")

job.commit()
