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
        "DB_NAME",
        "TABLE_NAME"
    ],
)

job.init(args["JOB_NAME"], args)
# Identifier of the table to update
DB_NAME = args["DB_NAME"]
TABLE_NAME = args["TABLE_NAME"]

print(f"The configured table for this job is {DB_NAME}.{TABLE_NAME}")

# check for table existence before proceeding
if not spark.catalog.tableExists(f"glue_catalog.{DB_NAME}.{TABLE_NAME}"):
    raise Exception("The specified table does not exist in the catalog")

table_def = spark.sql("DESCRIBE FORMATTED glue_catalog.{}.{}".format(DB_NAME, TABLE_NAME))
# get partition definition
partition_definition = table_def.filter(table_def.col_name == '_partition').select('data_type').collect()[0][0]

if partition_definition == "struct<>":
    # only setup partition fields if the definition is empty
    spark.sql("ALTER TABLE glue_catalog.{}.{} ADD PARTITION FIELD application_id".format(DB_NAME, TABLE_NAME))
    spark.sql("ALTER TABLE glue_catalog.{}.{} ADD PARTITION FIELD date(event_timestamp)".format(DB_NAME, TABLE_NAME))
    job.commit()
else:
    # running script may lead to unexpected results
    raise Exception("The current partition definition for the table is not empty. Running this script may lead to a misconfigured partition definition.")

