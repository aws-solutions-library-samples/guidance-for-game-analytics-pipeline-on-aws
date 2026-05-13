/**
 * Copyright 2023 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the 'License').
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the 'license' file accompanying this file. This file is distributed
 * on an 'AS IS' BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
import { GameAnalyticsPipelineConfig } from "../../helpers/config-types";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";

import * as glueCfn from "aws-cdk-lib/aws-glue";
import * as sns from "aws-cdk-lib/aws-sns";
import * as athena from "aws-cdk-lib/aws-athena";

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface AthenaQueryConstructProps extends cdk.StackProps {
  gameEventsDatabase: glueCfn.CfnDatabase;
  gameAnalyticsWorkgroup: athena.CfnWorkGroup;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<AthenaQueryConstructProps> = {};

/**
 * Query string for a named query. Use a plain string for schema-agnostic
 * queries, or an object with per-schema variants when the query depends on
 * whether the raw_events_table uses the Iceberg or Hive schema.
 */
type QueryString = string | { iceberg: string; hive: string };

interface QueryDefinition {
  name: string;
  description: string;
  query: QueryString;
}

/**
 * Deploys the Athena Sample Queries construct
 *
 * Creates sample Athena queries to query data present in the data lake.
 */
export class AthenaQueryConstruct extends Construct {

  private createDefaultAthenaQueries(
    databaseName: string,
    tableName: string,
    workgroupName: string,
    enableIceberg: boolean
  ) {
    const queries: QueryDefinition[] = [
      {
        name: "LatestEventsQuery",
        description: "Get latest events by event_timestamp",
        query: {
          iceberg: `SELECT *, event_timestamp AT TIME ZONE 'America/New_York' as event_timestamp_america_new_york
                    FROM "${databaseName}"."${tableName}"
                    ORDER BY event_timestamp_america_new_york DESC
                    LIMIT 10;`,
          hive: `SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
                 FROM "${databaseName}"."${tableName}"
                 ORDER BY event_timestamp_america_new_york DESC
                 LIMIT 10;`,
        },
      },
      {
        name: "TotalEventsQuery",
        description: "Total events",
        query: `SELECT application_id, count(DISTINCT event_id) as event_count 
                FROM "${databaseName}"."${tableName}"
                GROUP BY application_id`,
      },
      {
        name: "TotalEventsMonthQuery",
        description: "Total events over last month",
        query: {
          iceberg: `WITH detail AS
                    (SELECT date_trunc('month', event_timestamp) as event_month, * 
                    FROM "${databaseName}"."${tableName}") 
                    SELECT event_month as month, application_id, count(DISTINCT event_id) as event_count 
                    FROM detail 
                    GROUP BY event_month, application_id`,
          hive: `WITH detail AS
                 (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
                 FROM "${databaseName}"."${tableName}") 
                 SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
                 FROM detail 
                 GROUP BY date_trunc('month', event_month), application_id`,
        },
      },
      {
        name: "TotalIapTransactionsLastMonth",
        description: "Total IAP Transactions over the last month",
        query: {
          iceberg: `WITH detail AS 
                    (SELECT date_trunc('month', event_timestamp) as event_month, * 
                    FROM "${databaseName}"."${tableName}") 
                    SELECT event_month as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
                    FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
                    AND event_type = 'iap_transaction'
                    GROUP BY event_month, application_id`,
          hive: `WITH detail AS 
                 (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
                 FROM "${databaseName}"."${tableName}") 
                 SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
                 FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
                 AND event_type = 'iap_transaction'
                 GROUP BY date_trunc('month', event_month), application_id`,
        },
      },
      {
        name: "NewUsersLastMonth",
        description: "New Users over the last month",
        query: {
          iceberg: `WITH detail AS (
                    SELECT date_trunc('month', event_timestamp) as event_month, *
                    FROM "${databaseName}"."${tableName}")
                    SELECT
                    event_month as month,
                    count(*) as new_accounts
                    FROM detail
                    WHERE event_type = 'user_registration'
                    GROUP BY event_month;`,
          hive: `WITH detail AS (
                 SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, *
                 FROM "${databaseName}"."${tableName}")
                 SELECT
                 date_trunc('month', event_month) as month,
                 count(*) as new_accounts
                 FROM detail
                 WHERE event_type = 'user_registration'
                 GROUP BY date_trunc('month', event_month);`,
        },
      },
      {
        name: "TotalPlaysByLevel",
        description: "Total number of times each level has been played",
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
                FROM "${databaseName}"."${tableName}"
                WHERE event_type = 'level_started'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        name: "TotalFailuresByLevel",
        description: "Total number of failures on each level",
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_failed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        name: "TotalCompletionsByLevel",
        description: "Total number of completions on each level",
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_completed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        name: "LevelCompletionRate",
        description: "Rate of completion for each level",
        query: `with t1 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_started' GROUP BY json_extract_scalar(event_data, '$.level_id') 
                ),
                t2 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_completed'GROUP BY json_extract_scalar(event_data, '$.level_id') 
                )
                select t2.level, (cast(t2.level_count AS DOUBLE) / (cast(t2.level_count AS DOUBLE) + cast(t1.level_count AS DOUBLE))) * 100 as level_completion_rate from 
                t1 JOIN t2 ON t1.level = t2.level
                ORDER by level;`,
      },
      {
        name: "AverageUserSentimentPerDay",
        description: "User sentiment score by day",
        query: {
          iceberg: `SELECT
                    avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
                    date(event_timestamp) as event_date
                    FROM "${databaseName}"."${tableName}"
                    WHERE json_extract_scalar(event_data, '$.user_rating') is not null
                    GROUP BY date(event_timestamp);`,
          hive: `SELECT
                 avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
                 date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
                 FROM "${databaseName}"."${tableName}"
                 WHERE json_extract_scalar(event_data, '$.user_rating') is not null
                 GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));`,
        },
      },
      {
        name: "UserReportedReasonsCount",
        description: "Reasons users are being reported, grouped by reason code",
        query: `SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
                FROM "${databaseName}"."${tableName}"
                GROUP BY json_extract_scalar(event_data, '$.report_reason')
                ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;`,
      },
      {
        name: "CTASCreateIcebergTables",
        description: "Create table as (CTAS) from existing tables to iceberg",
        query: {
          iceberg: `CREATE TABLE "${databaseName}"."raw_events_iceberg"
                    WITH (table_type = 'ICEBERG',
                        format = 'PARQUET', 
                        location = 's3://your_bucket/', 
                        is_external = false,
                        partitioning = ARRAY['application_id', 'month(event_timestamp)'],
                        vacuum_min_snapshots_to_keep = 10,
                        vacuum_max_snapshot_age_seconds = 604800
                    ) 
                    AS SELECT * FROM "${databaseName}"."${tableName}";`,
          hive: `CREATE TABLE "${databaseName}"."raw_events_iceberg"
                 WITH (table_type = 'ICEBERG',
                     format = 'PARQUET', 
                     location = 's3://your_bucket/', 
                     is_external = false,
                     partitioning = ARRAY['application_id', 'year', 'month', 'day'],
                     vacuum_min_snapshots_to_keep = 10,
                     vacuum_max_snapshot_age_seconds = 604800
                 ) 
                 AS SELECT * FROM "${databaseName}"."${tableName}";`,
        },
      },
    ];

    for (const { name, description, query } of queries) {
      const queryString =
        typeof query === "string" ? query : enableIceberg ? query.iceberg : query.hive;

      new athena.CfnNamedQuery(this, `NamedQuery-${name}`, {
        database: databaseName,
        name,
        workGroup: workgroupName,
        description,
        queryString,
      });
    }
  }

  constructor(parent: Construct, name: string, props: AthenaQueryConstructProps) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    this.createDefaultAthenaQueries(
      props.gameEventsDatabase.ref,
      props.config.RAW_EVENTS_TABLE,
      props.gameAnalyticsWorkgroup.name,
      props.config.ENABLE_APACHE_ICEBERG_SUPPORT
    );

  }
}
