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

import sys
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

sc = SparkContext.getOrCreate()
sc.setLogLevel("TRACE")
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
        "OUTPUT_ACTION_TABLE_NAME",
        "OUTPUT_TRADE_TABLE_NAME"
    ],
)

job.init(args["JOB_NAME"], args)
# Identifier of the table to update
INPUT_DB_NAME = args["INPUT_DB_NAME"]
OUTPUT_DB_NAME = args["OUTPUT_DB_NAME"]
INPUT_TABLE_NAME = args["INPUT_TABLE_NAME"]
OUTPUT_ACTION_TABLE_NAME = args["OUTPUT_ACTION_TABLE_NAME"]
OUTPUT_TRADE_TABLE_NAME = args["OUTPUT_TRADE_TABLE_NAME"]

print(f"The configured table for this job is {INPUT_DB_NAME}.{INPUT_TABLE_NAME}")


def get_latest_event_date(db_name: str, table_name: str) -> str | None:
    """
    Get the latest event_date from an output table.
    Returns None if the table is empty or doesn't exist.
    """
    try:
        result = spark.sql(f"""
            SELECT MAX(event_date) as max_date
            FROM glue_catalog.{db_name}.{table_name}
        """)
        max_date = result.collect()[0][0]
        if max_date is not None:
            return str(max_date)
        return None
    except Exception as e:
        print(f"Could not retrieve max date from {db_name}.{table_name}: {e}")
        return None


# Get the latest event dates from both output tables
latest_action_date = get_latest_event_date(OUTPUT_DB_NAME, OUTPUT_ACTION_TABLE_NAME)
latest_trade_date = get_latest_event_date(OUTPUT_DB_NAME, OUTPUT_TRADE_TABLE_NAME)

# Build the date filter clause for each table
action_date_filter = f"AND CAST(event_timestamp AS DATE) > DATE('{latest_action_date}')" if latest_action_date else ""
trade_date_filter = f"AND CAST(event_timestamp AS DATE) > DATE('{latest_trade_date}')" if latest_trade_date else ""

print(f"Latest action date: {latest_action_date}, filter: {action_date_filter or 'None (full load)'}")
print(f"Latest trade date: {latest_trade_date}, filter: {trade_date_filter or 'None (full load)'}")

# Insert new action events (incremental)
spark.sql(f"""
    INSERT INTO glue_catalog.{OUTPUT_DB_NAME}.{OUTPUT_ACTION_TABLE_NAME}
    SELECT
        get_json_object(event_data, "$.item") AS item_id,
        get_json_object(event_data, "$.action") AS item_action,
        CAST(event_timestamp AS DATE) AS event_date,
        app_version,
        COUNT(*) AS occurrences
    FROM glue_catalog.{INPUT_DB_NAME}.{INPUT_TABLE_NAME}
    WHERE event_name='item_action'
    {action_date_filter}
    GROUP BY item_id, item_action, event_date, app_version
""")
print(f"Updated in-game event analysis table {OUTPUT_DB_NAME}.{OUTPUT_ACTION_TABLE_NAME}")

# Insert new trade events (incremental)
spark.sql(f"""
    INSERT INTO glue_catalog.{OUTPUT_DB_NAME}.{OUTPUT_TRADE_TABLE_NAME}
    SELECT
        get_json_object(event_data, "$.item") AS traded_item,
        get_json_object(event_data, "$.recieved_item") AS received_item,
        CAST(event_timestamp AS DATE) AS event_date,
        app_version,
        COUNT(*) AS occurrences
    FROM glue_catalog.{INPUT_DB_NAME}.{INPUT_TABLE_NAME}
    WHERE event_name='item_action'
    AND get_json_object(event_data, "$.action") = 'traded'
    {trade_date_filter}
    GROUP BY traded_item, received_item, event_date, app_version
""")
print(f"Updated in-game trade analysis table {OUTPUT_DB_NAME}.{OUTPUT_TRADE_TABLE_NAME}")

job.commit()
