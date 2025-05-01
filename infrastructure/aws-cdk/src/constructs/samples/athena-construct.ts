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
 * Deploys the DataLake construct
 *
 * Creates Glue to turn analytics s3 bucket into Datalake. Creates Jobs that can be used to process s3 data for Athena.
 */
export class AthenaQueryConstruct extends Construct {

  private createDefaultAthenaQueries(
    databaseName: string,
    tableName: string,
    workgroupName: string
  ) {
    const queries = [
      {
        database: databaseName,
        name: "LatestEventsQuery",
        description: "Get latest events by event_timestamp",
        workgroup: workgroupName,
        query: `SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
                FROM "${databaseName}"."${tableName}"
                ORDER BY event_timestamp_america_new_york DESC
                LIMIT 10;`,
      },
      {
        database: databaseName,
        name: "TotalEventsQuery",
        description: "Total events",
        workgroup: workgroupName,
        query: `SELECT application_id, count(DISTINCT event_id) as event_count 
                FROM "${databaseName}"."${tableName}"
                GROUP BY application_id`,
      },
      {
        database: databaseName,
        name: "TotalEventsMonthQuery",
        description: "Total events over last month",
        workgroup: workgroupName,
        query: `WITH detail AS
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
                FROM "${databaseName}"."${tableName}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
                FROM detail 
                GROUP BY date_trunc('month', event_month), application_id`,
      },
      {
        database: databaseName,
        name: "TotalIapTransactionsLastMonth",
        description: "Total IAP Transactions over the last month",
        workgroup: workgroupName,
        query: `WITH detail AS 
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
                FROM "${databaseName}"."${tableName}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
                FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
                AND event_type = 'iap_transaction'
                GROUP BY date_trunc('month', event_month), application_id`,
      },
      {
        database: databaseName,
        name: "NewUsersLastMonth",
        description: "New Users over the last month",
        workgroup: workgroupName,
        query: `WITH detail AS (
                SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, *
                FROM "${databaseName}"."${tableName}")
                SELECT
                date_trunc('month', event_month) as month,
                count(*) as new_accounts
                FROM detail
                WHERE event_type = 'user_registration'
                GROUP BY date_trunc('month', event_month);`,
      },
      {
        database: databaseName,
        name: "TotalPlaysByLevel",
        description: "Total number of times each level has been played",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
                FROM "${databaseName}"."${tableName}"
                WHERE event_type = 'level_started'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "TotalFailuresByLevel",
        description: "Total number of failures on each level",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_failed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "TotalCompletionsByLevel",
        description: "Total number of completions on each level",
        workgroup: workgroupName,
        query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
                FROM "${databaseName}"."${tableName}"
                WHERE event_type='level_completed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
      },
      {
        database: databaseName,
        name: "LevelCompletionRate",
        description: "Rate of completion for each level",
        workgroup: workgroupName,
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
        database: databaseName,
        name: "AverageUserSentimentPerDay",
        description: "User sentiment score by day",
        workgroup: workgroupName,
        query: `SELECT
                avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
                date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
                FROM "${databaseName}"."${tableName}"
                WHERE json_extract_scalar(event_data, '$.user_rating') is not null
                GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));`,
      },
      {
        database: databaseName,
        name: "UserReportedReasonsCount",
        description: "Reasons users are being reported, grouped by reason code",
        workgroup: workgroupName,
        query: `SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
                FROM "${databaseName}"."${tableName}"
                GROUP BY json_extract_scalar(event_data, '$.report_reason')
                ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;`,
      },
      {
        database: databaseName,
        name: "CTASCreateIcebergTables",
        description: "Create table as (CTAS) from existing tables to iceberg",
        workgroup: workgroupName,
        query: `CREATE TABLE "${tableName}"."raw_events_iceberg"
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
    ];

    for (const query of queries) {
      new athena.CfnNamedQuery(this, `NamedQuery-${query.name}`, {
        database: query.database,
        name: query.name,
        workGroup: query.workgroup,
        description: query.description,
        queryString: query.query,
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
      props.gameAnalyticsWorkgroup.name
    );

  }
}
