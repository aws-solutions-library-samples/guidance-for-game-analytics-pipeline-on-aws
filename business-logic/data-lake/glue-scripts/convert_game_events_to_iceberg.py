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
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.job import Job

args = getResolvedOptions(sys.argv, ['JOB_NAME'])
sc = SparkContext()
glueContext = GlueContext(sc)
spark = glueContext.spark_session
job = Job(glueContext)

args = getResolvedOptions(sys.argv,
    ['JOB_NAME',
    'database_name',
    'raw_events_table_name',
    'iceberg_events_table_name',
    'analytics_bucket',
    'iceberg_bucket',
    'glue_tmp_prefix'])

job.init(args['JOB_NAME'], args)

print("Database: {}".format(args['database_name']))
print("Raw Events Table: {}".format(args['raw_events_table_name']))
print("Glue Temp S3 location: {}{}".format(args['analytics_bucket'], args['glue_tmp_prefix']))

# catalog: database and table names
database_name = args['database_name']
raw_table = args['raw_events_table_name']
iceberg_table = args['iceberg_events_table_name']
iceberg_raw_events_table = f"glue_catalog.{database_name}.{iceberg_table}"

print("Iceberg Table: {}".format(iceberg_raw_events_table))

# Output location
analytics_bucket_input = args['analytics_bucket'] + args['raw_events_table_name']
analytics_bucket_output_iceberg = args['iceberg_bucket'] + args['raw_events_table_name']
analytics_bucket_temp_storage = args['analytics_bucket'] + args['glue_tmp_prefix']

print("Bucket Input: {}".format(analytics_bucket_input))
print("Bucket Output: {}".format(analytics_bucket_output_iceberg))

base_df = glueContext.create_dynamic_frame.from_options(format_options={}, connection_type="s3", format="parquet", connection_options={"paths": [analytics_bucket_input], "recurse": True}, transformation_ctx="events")

new_sc_df = ApplyMapping.apply(frame=base_df, mappings=[("event_id", "string", "event_id", "string"), ("event_type", "string", "event_type", "string"), ("event_name", "string", "event_name", "string"), ("event_version", "string", "event_version", "string"), ("event_timestamp", "bigint", "event_timestamp", "long"), ("app_version", "string", "app_version", "string"), ("application_id", "string", "application_id", "string"), ("application_name", "string", "application_name", "string"), ("event_data", "string", "event_data", "string"), ("metadata", "string", "metadata", "string")], transformation_ctx="changeschema")

# Script generated for node Amazon S3
additional_options = {}
tables_collection = spark.catalog.listTables(database_name)
table_names_in_db = [table.name for table in tables_collection]
table_exists = iceberg_table in table_names_in_db
if table_exists:
    iceberg_df = new_sc_df.toDF()
    iceberg_df.writeTo(iceberg_raw_events_table) \
        .tableProperty("format-version", "2") \
        .tableProperty("format-version", "2") \
        .tableProperty("location", analytics_bucket_output_iceberg) \
        .tableProperty("write.parquet.compression-codec", "gzip") \
        .options(**additional_options) \
        .append()
else:
    iceberg_df = new_sc_df.toDF()
    iceberg_df.writeTo(iceberg_raw_events_table) \
        .tableProperty("format-version", "2") \
        .tableProperty("location", analytics_bucket_output_iceberg) \
        .tableProperty("write.parquet.compression-codec", "gzip") \
        .options(**additional_options) \
        .create()

job.commit()