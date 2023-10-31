/*
This application generates real-time metrics that are processed by Lambda.
Query outputs should adhere to the schema defined in DESTINATION_STREAM required by the Lambda function that processes output. 
Additional in-application streams can be pumped into the DESTINATION_STREAM table for consumption and processing by Lambda.
Refer to the Game Analytics Pipeline Developer Guide for more information.
*/

CREATE STREAM "DESTINATION_STREAM"(
METRIC_NAME VARCHAR(1024),
METRIC_TIMESTAMP BIGINT,
METRIC_UNIT_VALUE_INT BIGINT,
METRIC_UNIT VARCHAR(1024),
DIMENSION_APPLICATION_ID VARCHAR(1024),
DIMENSION_APP_VERSION VARCHAR(1024),
DIMENSION_COUNTRY_ID VARCHAR(1024),
DIMENSION_CURRENCY_TYPE VARCHAR (1024),
DIMENSION_SPELL_ID VARCHAR (1024),
DIMENSION_MISSION_ID VARCHAR (1024),
DIMENSION_ITEM_ID VARCHAR (1024),
OUTPUT_TYPE VARCHAR(1024));

-- Total Events
-- Count of Total Events within period
CREATE OR REPLACE PUMP "TOTAL_EVENTS_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'TotalEvents', UNIX_TIMESTAMP(TIME_WINDOW), COUNT(distinct_stream.event_id) AS unique_count, 'Count', distinct_stream.application_id, distinct_stream.app_version, 'metrics'
FROM (
    SELECT STREAM DISTINCT
        rowtime as window_time,
        "AnalyticsApp_001"."event_id" as event_id,
        "AnalyticsApp_001"."application_id" as application_id,
        "AnalyticsApp_001"."app_version" as app_version,
        STEP("AnalyticsApp_001".rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001"
) as distinct_stream
GROUP BY 
    application_id, 
    app_version,
    TIME_WINDOW,
    STEP(distinct_stream.window_time BY INTERVAL '1' MINUTE);

-- Total Logins
-- Count of logins within period
CREATE OR REPLACE PUMP "LOGIN_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'TotalLogins', UNIX_TIMESTAMP(TIME_WINDOW), COUNT(distinct_stream.login_count) AS unique_count, 'Count', distinct_stream.application_id, distinct_stream.app_version, 'metrics'
FROM (
    SELECT STREAM DISTINCT 
      rowtime as window_time, 
      "AnalyticsApp_001"."event_id" as login_count, 
      "AnalyticsApp_001"."application_id" as application_id,
      "AnalyticsApp_001"."app_version" as app_version,
      STEP("AnalyticsApp_001".rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001"
    WHERE "AnalyticsApp_001"."event_type" = 'login'
) as distinct_stream 
GROUP BY 
    application_id,
    app_version,
    TIME_WINDOW,
    STEP(distinct_stream.window_time BY INTERVAL '1' MINUTE);

-- Knockouts By Spells
-- Get the number of knockouts by each spell used in a knockout in the period
CREATE OR REPLACE PUMP "KNOCKOUTS_BY_SPELL_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_SPELL_ID, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT STREAM 'KnockoutsBySpell', UNIX_TIMESTAMP(TIME_WINDOW), SPELL_COUNT, 'Count', SPELL_ID, application_id, app_version, 'metrics'
FROM (
    SELECT STREAM
      events."spell_id" as SPELL_ID,
      events."application_id" as application_id,
      events."app_version" as app_version,
      count(*) as SPELL_COUNT,
      STEP(events.rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001" events
    WHERE events."spell_id" is not NULL
    AND events."event_type" = 'user_knockout'
    GROUP BY
      STEP (events.ROWTIME BY INTERVAL '1' MINUTE),
      events."spell_id",
      events."application_id",
      events."app_version"
    HAVING count(*) > 1
    ORDER BY STEP (events.ROWTIME BY INTERVAL '1' MINUTE), SPELL_COUNT desc
);

-- Purchases
-- Get all purchases grouped by country over the period
CREATE OR REPLACE PUMP "PURCHASES_PER_CURRENCY_PUMP" AS
INSERT INTO "DESTINATION_STREAM" (METRIC_NAME, METRIC_TIMESTAMP, METRIC_UNIT_VALUE_INT, METRIC_UNIT, DIMENSION_CURRENCY_TYPE, DIMENSION_APPLICATION_ID, DIMENSION_APP_VERSION, OUTPUT_TYPE)
SELECT 'Purchases', UNIX_TIMESTAMP(TIME_WINDOW), PURCHASE_COUNT, 'Count', CURRENCY_TYPE, application_id, app_version, 'metrics' FROM (
    SELECT STREAM
      events."currency_type" as CURRENCY_TYPE,
      events."application_id" as application_id,
      events."app_version" as app_version,
      count(*) as PURCHASE_COUNT,
      STEP(events.rowtime BY INTERVAL '1' MINUTE) as TIME_WINDOW
    FROM "AnalyticsApp_001" events
    WHERE events."currency_type" is not NULL
    AND events."event_type" = 'iap_transaction'
    GROUP BY
      STEP (events.ROWTIME BY INTERVAL '1' MINUTE),
      events."currency_type",
      events."application_id",
      events."app_version"
    HAVING count(*) > 1
    ORDER BY STEP (events.ROWTIME BY INTERVAL '1' MINUTE), PURCHASE_COUNT desc
);