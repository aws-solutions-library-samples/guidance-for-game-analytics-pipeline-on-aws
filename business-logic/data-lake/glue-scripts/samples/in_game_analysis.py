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
import json
from awsglue.transforms import *
from pyspark.sql.functions import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.job import Job
from pyspark.sql import SparkSession
from pyspark.sql.types import StringType

sc = SparkContext.getOrCreate()
sc.setLogLevel("TRACE")
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

# Get Enviornmental variables

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

spark.sql(f"""
    CREATE TABLE glue_catalog.{OUTPUT_DB_NAME}.{OUTPUT_ACTION_TABLE_NAME}
    USING iceberg
    PARTITIONED BY (DAY(event_date))
    AS 
    SELECT
        get_json_object(event_data, "$.item") AS item_id,
        get_json_object(event_data, "$.action") AS item_action,
        CAST(event_timestamp AS DATE) AS event_date,
        app_version,
        COUNT(*) AS occurrences
    FROM glue_catalog.{INPUT_DB_NAME}.{INPUT_TABLE_NAME}
    WHERE event_name='item_action'
    GROUP BY item_id, item_action, event_date, app_version
""")
print(f"Created in-game event analysis table {OUTPUT_DB_NAME}.{OUTPUT_ACTION_TABLE_NAME}")

spark.sql(f"""
    CREATE TABLE glue_catalog.{OUTPUT_DB_NAME}.{OUTPUT_TRADE_TABLE_NAME}
    USING iceberg
    PARTITIONED BY (DAY(event_date))
    SELECT
        get_json_object(event_data, "$.item") AS traded_item,
        get_json_object(event_data, "$.recieved_item") AS received_item,
        CAST(event_timestamp AS DATE) AS event_date,
        app_version,
        COUNT(*) AS occurrences
    FROM glue_catalog.{INPUT_DB_NAME}.{INPUT_DB_NAME}
    WHERE event_name='item_action'
    AND get_json_object(event_data, "$.action") = 'traded'
    GROUP BY traded_item, received_item, event_date, app_version
""")
print(f"Created in-game trade analysis table {OUTPUT_DB_NAME}.{OUTPUT_TRADE_TABLE_NAME}")

job.commit()
