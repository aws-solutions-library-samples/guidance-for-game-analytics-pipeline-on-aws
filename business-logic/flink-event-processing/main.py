"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
"""

from pyflink.table import EnvironmentSettings, TableEnvironment
import os
import json

# Utility Functions
def get_application_properties():
    if os.path.isfile(APPLICATION_PROPERTIES_FILE_PATH):
        with open(APPLICATION_PROPERTIES_FILE_PATH, "r") as file:
            contents = file.read()
            properties = json.loads(contents)
            return properties
    else:
        print('A file at "{}" was not found'.format(APPLICATION_PROPERTIES_FILE_PATH))


def property_map(props, property_group_id):
    for prop in props:
        if prop["PropertyGroupId"] == property_group_id:
            return prop["PropertyMap"]


# Create a Table Environment
env_settings = EnvironmentSettings.in_streaming_mode()
table_env = TableEnvironment.create(env_settings)

APPLICATION_PROPERTIES_FILE_PATH = "/etc/flink/application_properties.json"  # on kda

# set this env var in your local environment
is_local = True if os.environ.get("IS_LOCAL") else False

if is_local:
    # only for local, overwrite variable to properties and pass in your jars delimited by a semicolon (;)
    APPLICATION_PROPERTIES_FILE_PATH = "application_properties.json"  # local

    CURRENT_DIR = os.path.dirname(os.path.realpath(__file__))
    table_env.get_config().get_configuration().set_string(
        "pipeline.jars",
        "file:///" + CURRENT_DIR + "/lib/flink-sql-connector-kinesis-5.0.0-1.20.jar",
    )


# Application Property Keys
input_property_group_key = "sourceConfig"
producer_property_group_key = "sinkConfig"

input_stream_key = "kinesis.stream.arn"
input_region_key = "aws.region"
input_starting_position_key = "flink.stream.initpos"
source_record_count_key = "flink.stream.max_record_count"

# legacy options
input_stream_name_key = "kinesis.stream.name"


output_stream_key = "kinesis.stream.arn"
output_region_key = "aws.region"

# tables
INPUT_TABLE_NAME = "input_table"
OUTPUT_TABLE_NAME = "output_table"

# get application properties
props = get_application_properties()

input_property_map = property_map(props, input_property_group_key)
output_property_map = property_map(props, producer_property_group_key)

input_stream = input_property_map[input_stream_key]
input_region = input_property_map[input_region_key]
stream_initpos = input_property_map[input_starting_position_key]
source_record_count = input_property_map[source_record_count_key]

# legacy options
input_stream_name = input_property_map[input_stream_name_key]


output_stream = output_property_map[output_stream_key]
output_region = output_property_map[output_region_key]

# DDL

# Flink Kinesis adapter 5.0.0-1.20 settings
_SOURCE_TABLE_DEF = """
CREATE TABLE {0} (
    event ROW(
        `event_version` VARCHAR(8),
        `event_id` VARCHAR(64),
        `event_type` VARCHAR(64),
        `event_name` VARCHAR,
        `event_timestamp` BIGINT,
        `app_version` VARCHAR(8),
        `event_data` STRING
    ),
    application_id STRING,
    rowtime AS TO_TIMESTAMP_LTZ(event.event_timestamp, 0),
    WATERMARK FOR rowtime AS rowtime - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kinesis',
    'stream.arn' = '{1}',
    'aws.region' = '{2}',
    'source.init.position' = '{3}',
    'format' = 'json',
    'json.timestamp-format.standard' = 'ISO-8601',
    'source.shard.get-records.max-record-count' = '{4}'
);""".format(INPUT_TABLE_NAME, input_stream, input_region, stream_initpos, source_record_count)

# Flink Kinesis legacy adapter settings (currently used for read throttling controls)
SOURCE_TABLE_DEF = """
CREATE TABLE {0} (
    event ROW(
        `event_version` VARCHAR(8),
        `event_id` VARCHAR(64),
        `event_type` VARCHAR(64),
        `event_name` VARCHAR,
        `event_timestamp` BIGINT,
        `app_version` VARCHAR(8),
        `event_data` STRING
    ),
    application_id STRING,
    rowtime AS TO_TIMESTAMP_LTZ(event.event_timestamp, 0),
    WATERMARK FOR rowtime AS rowtime - INTERVAL '5' SECOND
) WITH (
    'connector' = 'kinesis-legacy',
    'stream' = '{1}',
    'aws.region' = '{2}',
    'scan.stream.initpos' = '{3}',
    'format' = 'json',
    'json.timestamp-format.standard' = 'ISO-8601',
    'scan.shard.adaptivereads' = 'true',
    'scan.shard.getrecords.intervalmillis' = '500'
);""".format(INPUT_TABLE_NAME, input_stream_name, input_region, stream_initpos)


SINK_TABLE_DEF = """
CREATE TABLE {0} (
    METRIC_NAME STRING,
    METRIC_TIMESTAMP TIMESTAMP_LTZ(3),
    METRIC_UNIT_VALUE_INT BIGINT,
    METRIC_UNIT STRING,
    DIMENSION_APPLICATION_ID STRING,
    DIMENSION_APP_VERSION STRING,
    DIMENSION_COUNTRY_ID STRING,
    DIMENSION_CURRENCY_TYPE STRING,
    DIMENSION_SPELL_ID STRING,
    DIMENSION_MISSION_ID STRING,
    DIMENSION_ITEM_ID STRING,
    OUTPUT_TYPE STRING,
    WATERMARK FOR METRIC_TIMESTAMP AS METRIC_TIMESTAMP - INTERVAL '5' SECOND
)
PARTITIONED BY (METRIC_NAME)
WITH (
    'connector' = 'kinesis',
    'stream.arn' = '{1}',
    'aws.region' = '{2}',
    'sink.partitioner-field-delimiter' = ';',
    'sink.batch.max-size' = '100',
    'format' = 'json',
    'json.timestamp-format.standard' = 'ISO-8601'
);""".format(OUTPUT_TABLE_NAME, output_stream, output_region)


# Queries

# Total Events
# Count of Total Events within period
TOTAL_EVENTS_QUERY = """
INSERT INTO {0} (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'TotalEvents' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP, 
    COUNT(event_id) AS METRIC_UNIT_VALUE_INT, 
    'Count' AS METRIC_UNIT,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM (
    SELECT
        window_start,
        window_end,
        event.event_id AS event_id,
        application_id AS application_id,
        event.app_version AS app_version,
        ROW_NUMBER() OVER (PARTITION BY window_start, window_end, event.event_id ORDER BY rowtime asc) AS rownum
    FROM TABLE(TUMBLE(TABLE {1}, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
) AS distinct_stream
WHERE rownum = 1
GROUP BY
    window_start,
    window_end,
    application_id,
    app_version;
""".format(OUTPUT_TABLE_NAME, INPUT_TABLE_NAME)

# Total Logins
# Count of logins within period
TOTAL_LOGINS_QUERY = """
INSERT INTO {0} (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'TotalLogins' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP, 
    COUNT(event_id) AS METRIC_UNIT_VALUE_INT, 
    'Count' AS METRIC_UNIT,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM (
    SELECT
        window_start,
        window_end,
        event.event_id AS event_id,
        application_id AS application_id,
        event.app_version AS app_version,
        ROW_NUMBER() OVER (PARTITION BY window_start, window_end, event.event_id ORDER BY rowtime asc) AS rownum
    FROM TABLE(TUMBLE(TABLE {1}, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
    WHERE event.event_type = 'login'
) AS distinct_stream
WHERE rownum = 1
GROUP BY
    window_start,
    window_end,
    application_id,
    app_version;
""".format(OUTPUT_TABLE_NAME, INPUT_TABLE_NAME)

# Knockouts By Spells
# Get the number of knockouts by each spell used in a knockout in the period
KNOCKOUTS_BY_SPELL_QUERY = """
INSERT INTO {0} (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_SPELL_ID,
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'KnockoutsBySpell' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP,
    COUNT(*) AS METRIC_UNIT_VALUE_INT,
    'Count' AS METRIC_UNIT,
    SPELL_ID AS DIMENSION_SPELL_ID,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM
(SELECT
    window_start,
    window_end,
    JSON_VALUE(event.event_data, '$.spell_id' RETURNING STRING NULL ON EMPTY) AS SPELL_ID,
    application_id AS application_id,
    event.app_version AS app_version
FROM TABLE(TUMBLE(TABLE {1}, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
WHERE 
    event.event_type = 'user_knockout') AS knockout_events
WHERE SPELL_ID IS NOT NULL
GROUP BY
    window_start,
    window_end,
    SPELL_ID,
    application_id,
    app_version
HAVING COUNT(*) > 1;
""".format(OUTPUT_TABLE_NAME, INPUT_TABLE_NAME)

# Purchases
# Get all purchases grouped by country over the period
PURCHASES_PER_CURRENCY_QUERY = """
INSERT INTO {0} (
    METRIC_NAME, 
    METRIC_TIMESTAMP, 
    METRIC_UNIT_VALUE_INT, 
    METRIC_UNIT, 
    DIMENSION_CURRENCY_TYPE,
    DIMENSION_APPLICATION_ID, 
    DIMENSION_APP_VERSION, 
    OUTPUT_TYPE
) SELECT 
    'Purchases' AS METRIC_NAME,
    window_start AS METRIC_TIMESTAMP,
    COUNT(*) AS METRIC_UNIT_VALUE_INT,
    'Count' AS METRIC_UNIT,
    CURRENCY_TYPE AS DIMENSION_CURRENCY_TYPE,
    application_id AS DIMENSION_APPLICATION_ID, 
    app_version AS DIMENSION_APP_VERSION,
    'metrics' AS OUTPUT_TYPE
FROM
(SELECT
    window_start,
    window_end,
    JSON_VALUE(event.event_data, '$.currency_type' RETURNING STRING NULL ON EMPTY) AS CURRENCY_TYPE,
    application_id AS application_id,
    event.app_version AS app_version
FROM TABLE(TUMBLE(TABLE {1}, DESCRIPTOR(rowtime), INTERVAL '1' MINUTE))
WHERE 
    event.event_type = 'iap_transaction') AS transaction_events
WHERE CURRENCY_TYPE IS NOT NULL
GROUP BY
    window_start,
    window_end,
    CURRENCY_TYPE,
    application_id,
    app_version
HAVING COUNT(*) > 1;
""".format(OUTPUT_TABLE_NAME, INPUT_TABLE_NAME)

if __name__ == "__main__":
    # Create tables inside Flink
    table_env.execute_sql(SOURCE_TABLE_DEF)
    table_env.execute_sql(SINK_TABLE_DEF)
    print("Tables created")
    
    # Create statement set to execute multiple queries at once
    statement_set = table_env.create_statement_set()

    # Register the metric aggregation tasks to the statement set
    statement_set.add_insert_sql(TOTAL_EVENTS_QUERY)
    statement_set.add_insert_sql(TOTAL_LOGINS_QUERY)
    statement_set.add_insert_sql(KNOCKOUTS_BY_SPELL_QUERY)
    statement_set.add_insert_sql(PURCHASES_PER_CURRENCY_QUERY)

    # Execute all metric aggregation tasks
    table_result = statement_set.execute()

    # run job and wait
    if is_local:
        print('Running locally')
        table_result.wait()
    else:
        # get job status through TableResult
        print(table_result.get_job_client().get_job_status())
        pass