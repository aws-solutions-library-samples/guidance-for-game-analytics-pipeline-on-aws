/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

"use strict";

console.log("Loading function");

const https = require("https");
const url = require("url");
const moment = require("moment");
const DynamoDBHelper = require("./lib/dynamodb-helper.js");
const AthenaHelper = require("./lib/athena-helper.js");
const CloudWatchHelper = require("./lib/cloudwatch-helper.js");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

/**
 * Request handler.
 */
exports.handler = async (event, context, callback) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  let responseData = {};
  let responseStatus = "FAILED";

  // Handling Promise Rejection
  process.on("unhandledRejection", (error) => {
    console.log(`Unhandled error: ${JSON.stringify(error)}`);
    throw error;
  });

  try {
    /**
     * Handle solution CloudFormation create events
     */
    if (event.RequestType === "Create") {
      /**
       * Create solution UUID when the solution is created.
       */
      if (
        event.ResourceProperties.customAction === "createAthenaNamedQueries"
      ) {
        /**
         * Create default queries in Athena
         */
        let _athenaHelper = new AthenaHelper();
        const queries = [
          //     {
          //         database: event.ResourceProperties.database,
          //         name: "CreatePartitionedEventsJson",
          //         description:
          //             "This command demonstrates how to create a new table of raw events transformed to JSON format. Output is partitioned by Application",
          //         workgroup: event.ResourceProperties.workgroupName,
          //         query: `CREATE TABLE events_json
          // WITH (
          //      format = 'JSON',
          //      partitioned_by = ARRAY['application_id'])
          // AS SELECT year, month, day, event_id, application_id, event_type
          // FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}";`,
          //     },
          {
            database: event.ResourceProperties.database,
            name: "LatestEventsQuery",
            description: "Get latest events by event_timestamp",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT *, from_unixtime(event_timestamp, 'America/New_York') as event_timestamp_america_new_york
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                ORDER BY event_timestamp_america_new_york DESC
                LIMIT 10;`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalEventsQuery",
            description: "Total events",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT application_id, count(DISTINCT event_id) as event_count 
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                GROUP BY application_id`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalEventsMonthQuery",
            description: "Total events over last month",
            workgroup: event.ResourceProperties.workgroupName,
            query: `WITH detail AS
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, * 
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT event_id) as event_count 
                FROM detail 
                GROUP BY date_trunc('month', event_month), application_id`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalIapTransactionsLastMonth",
            description: "Total IAP Transactions over the last month",
            workgroup: event.ResourceProperties.workgroupName,
            query: `WITH detail AS 
                (SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day),'%Y-%m-%d'))) as event_month,* 
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}") 
                SELECT date_trunc('month', event_month) as month, application_id, count(DISTINCT json_extract_scalar(event_data, '$.transaction_id')) as transaction_count 
                FROM detail WHERE json_extract_scalar(event_data, '$.transaction_id') is NOT null 
                AND event_type = 'iap_transaction'
                GROUP BY date_trunc('month', event_month), application_id`,
          },
          {
            database: event.ResourceProperties.database,
            name: "NewUsersLastMonth",
            description: "New Users over the last month",
            workgroup: event.ResourceProperties.workgroupName,
            query: `WITH detail AS (
                SELECT date_trunc('month', date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'))) as event_month, *
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}")
                SELECT
                date_trunc('month', event_month) as month,
                count(*) as new_accounts
                FROM detail
                WHERE event_type = 'user_registration'
                GROUP BY date_trunc('month', event_month);`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalPlaysByLevel",
            description: "Total number of times each level has been played",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_plays
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE event_type = 'level_started'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalFailuresByLevel",
            description: "Total number of failures on each level",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_failures
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE event_type='level_failed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
          },
          {
            database: event.ResourceProperties.database,
            name: "TotalCompletionsByLevel",
            description: "Total number of completions on each level",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT
                json_extract_scalar(event_data, '$.level_id') as level,
                count(json_extract_scalar(event_data, '$.level_id')) as number_of_completions
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE event_type='level_completed'
                GROUP BY json_extract_scalar(event_data, '$.level_id')
                ORDER by json_extract_scalar(event_data, '$.level_id');`,
          },
          {
            database: event.ResourceProperties.database,
            name: "LevelCompletionRate",
            description: "Rate of completion for each level",
            workgroup: event.ResourceProperties.workgroupName,
            query: `with t1 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE event_type='level_started' GROUP BY json_extract_scalar(event_data, '$.level_id') 
                ),
                t2 as
                (SELECT json_extract_scalar(event_data, '$.level_id') as level, count(json_extract_scalar(event_data, '$.level_id')) as level_count 
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE event_type='level_completed'GROUP BY json_extract_scalar(event_data, '$.level_id') 
                )
                select t2.level, (cast(t2.level_count AS DOUBLE) / (cast(t2.level_count AS DOUBLE) + cast(t1.level_count AS DOUBLE))) * 100 as level_completion_rate from 
                t1 JOIN t2 ON t1.level = t2.level
                ORDER by level;`,
          },
          {
            database: event.ResourceProperties.database,
            name: "AverageUserSentimentPerDay",
            description: "User sentiment score by day",
            workgroup: event.ResourceProperties.workgroupName,
            query: `SELECT
                avg(CAST(json_extract_scalar(event_data, '$.user_rating') AS real)) AS average_user_rating, 
                date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d')) as event_date
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                WHERE json_extract_scalar(event_data, '$.user_rating') is not null
                GROUP BY date(date_parse(CONCAT(year, '-', month, '-', day), '%Y-%m-%d'));`,
          },
          {
            database: event.ResourceProperties.database,
            name: "UserReportedReasonsCount",
            description:
              "Reasons users are being reported, grouped by reason code",
            workgroup: event.ResourceProperties.workgroupName,
            query: `
                SELECT count(json_extract_scalar(event_data, '$.report_reason')) as count_of_reports, json_extract_scalar(event_data, '$.report_reason') as report_reason
                FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}"
                GROUP BY json_extract_scalar(event_data, '$.report_reason')
                ORDER BY json_extract_scalar(event_data, '$.report_reason') DESC;`,
          },
          {
            database: event.ResourceProperties.database,
            name: "CTASCreateIcebergTables",
            description:
              "Create table as (CTAS) from existing tables to iceberg",
            workgroup: event.ResourceProperties.workgroupName,
            query: `            
                CREATE TABLE "${event.ResourceProperties.database}"."raw_events_iceberg"
                WITH (table_type = 'ICEBERG',
                    format = 'PARQUET', 
                    location = 's3://your_bucket/', 
                    is_external = false,
                    partitioning = ARRAY['application_id', 'year', 'month', 'day'],
                    vacuum_min_snapshots_to_keep = 10,
                    vacuum_max_snapshot_age_seconds = 604800
                ) 
                AS SELECT * FROM "${event.ResourceProperties.database}"."${event.ResourceProperties.table}";`,
          },
        ];
        try {
          console.log(`queries: ${JSON.stringify(queries)}`);
          for (const query of queries) {
            await _athenaHelper.createDefaultNamedQuery(
              query.database,
              query.name,
              query.workgroup,
              query.description,
              query.query
            );
          }
          responseData = {
            Message: "Created queries",
          };
          responseStatus = "SUCCESS";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        } catch (err) {
          responseData = {
            Error: "Error creating athena queries",
          };
          responseStatus = "FAILED";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        }
      } else if (
        event.ResourceProperties.customAction === "createCloudWatchDashboard"
      ) {
        /**
         * Create dashboard in CloudWatch
         */
        let _cloudwatchHelper = new CloudWatchHelper();
        try {
          console.log(
            `Creating CloudWatch dashboard: ${JSON.stringify(
              event.ResourceProperties
            )}`
          );
          await _cloudwatchHelper.createDashboard(event.ResourceProperties);
          responseData = {
            Message: "Created CloudWatch Dashboard",
          };
          responseStatus = "SUCCESS";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        } catch (error) {
          console.log(`Failed to create CloudWatch Dashboard`, error);
          responseData = {
            Error: "Failed to create CloudWatch Dashboard",
          };
          responseStatus = "FAILED";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        }
      }
    } //end create

    /**
     * Handle solution CloudFormation delete events
     */
    if (event.RequestType === "Delete") {
      if (
        event.ResourceProperties.customAction === "InvokeFunctionSync" ||
        event.ResourceProperties.customAction === "createAthenaNamedQueries"
      ) {
        responseStatus = "SUCCESS";
        await sendResponse(
          event,
          callback,
          context.logStreamName,
          responseStatus,
          responseData
        );
      } else if (
        event.ResourceProperties.customAction === "createCloudWatchDashboard"
      ) {
        /**
         * Delete dashboard in CloudWatch
         */
        let _cloudwatchHelper = new CloudWatchHelper();
        try {
          console.log(
            `Deleting CloudWatch dashboard: ${event.ResourceProperties.DashboardName}`
          );
          await _cloudwatchHelper.deleteDashboard(
            event.ResourceProperties.DashboardName
          );
          responseData = {
            Message: "Deleted CloudWatch Dashboard",
          };
          responseStatus = "SUCCESS";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        } catch (error) {
          console.log(`Failed to delete CloudWatch Dashboard`, error);
          responseData = {
            Error: "Failed to delete CloudWatch Dashboard",
          };
          responseStatus = "FAILED";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        }
      }
    }

    /**
     * Handle solution CloudFormation updates
     */
    if (event.RequestType === "Update") {
      if (
        event.ResourceProperties.customAction === "InvokeFunctionSync" ||
        event.ResourceProperties.customAction === "createAthenaNamedQueries"
      ) {
        responseStatus = "SUCCESS";
        await sendResponse(
          event,
          callback,
          context.logStreamName,
          responseStatus,
          responseData
        );
      } else if (
        event.ResourceProperties.customAction === "createCloudWatchDashboard"
      ) {
        /**
         * Create dashboard in CloudWatch
         */
        let _cloudwatchHelper = new CloudWatchHelper();
        try {
          console.log(
            `Creating CloudWatch dashboard: ${event.ResourceProperties}`
          );
          await _cloudwatchHelper.createDashboard(event.ResourceProperties);
          responseData = {
            Message: "Created CloudWatch Dashboard",
          };
          responseStatus = "SUCCESS";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        } catch (error) {
          console.log(`Failed to create CloudWatch Dashboard`, error);
          responseData = {
            Error: "Failed to create CloudWatch Dashboard",
          };
          responseStatus = "FAILED";
          await sendResponse(
            event,
            callback,
            context.logStreamName,
            responseStatus,
            responseData
          );
        }
      }
    }
  } catch (err) {
    console.log(
      `Error occurred while ${event.RequestType} ${event.ResourceType}:\n`,
      err
    );
    responseData = {
      Error: err.message,
    };
    responseStatus = "FAILED";
    await sendResponse(
      event,
      callback,
      context.logStreamName,
      responseStatus,
      responseData
    );
  }
};

/**
 * Sends a response to the pre-signed S3 URL
 */
let sendResponse = async function (
  event,
  callback,
  logStreamName,
  responseStatus,
  responseData
) {
  const responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: `See the details in CloudWatch Log Stream: ${logStreamName}`,
    PhysicalResourceId: logStreamName,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    Data: responseData,
  });

  console.log("RESPONSE BODY:\n", responseBody);
  const parsedUrl = url.parse(event.ResponseURL);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: parsedUrl.path,
    method: "PUT",
    headers: {
      "Content-Type": "",
      "Content-Length": responseBody.length,
    },
  };
  const req = https.request(options, (res) => {
    console.log("STATUS:", res.statusCode);
    console.log("HEADERS:", JSON.stringify(res.headers));
    callback(null, "Successfully sent stack response!");
  });
  req.on("error", (err) => {
    console.log("sendResponse Error:\n", err);
    callback(err);
  });
  req.write(responseBody);
  req.end();
  console.log("Successfully sent stack response!");
  callback(null, "Successfully sent stack response!");
};
