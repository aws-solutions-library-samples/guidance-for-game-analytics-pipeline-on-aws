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

import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as qs from "aws-cdk-lib/aws-quicksight";
import { aws_quicksight as quicksight } from 'aws-cdk-lib';

/* eslint-disable @typescript-eslint/no-empty-interface */
export interface GameEventSampleProps extends cdk.StackProps {
  analyticsBucket: s3.Bucket;
  gameEventsDatabase: glue.CfnDatabase;
  gameEventsEtlRole: iam.Role;
  rawEventsTable: glue.CfnTable;
  gapDataSource: qs.CfnDataSource;
  config: GameAnalyticsPipelineConfig;
}

const defaultProps: Partial<GameEventSampleProps> = {};

const IN_GAME_EVENTS_TABLE_NAME = "daily_item_actions";
const IN_GAME_TRADES_TABLE_NAME = "daily_item_trades";

/**
 * Deploys the DataLake construct
 *
 * Creates Glue to turn analytics s3 bucket into Datalake. Creates Jobs that can be used to process s3 data for Athena.
 */
export class GameEventSampleConstruct extends Construct {
  public readonly inGameEventsEtl: glue.CfnJob;

  constructor(
    parent: Construct,
    name: string,
    props: GameEventSampleProps
  ) {
    super(parent, name);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    props = { ...defaultProps, ...props };

    // Glue table for raw events that come in from stream
    const inGameEventsTable = new glue.CfnTable(this, "InGameEventsTable", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: props.gameEventsDatabase.ref,
      tableInput: {
        name: IN_GAME_EVENTS_TABLE_NAME,
        description: `in-game event actions for stack ${cdk.Aws.STACK_NAME}`,
        storageDescriptor: {
          columns: [
            { name: "item_id", type: "string" },
            { name: "item_action", type: "string" },
            { name: "event_date", type: "date" },
            { name: "app_version", type: "string" },
            { name: "occurrences", type: "bigint" },
          ],
          location: props.analyticsBucket.s3UrlForObject(
            props.config.RAW_EVENTS_TABLE.toLowerCase()
          ),
          storedAsSubDirectories: false,
          parameters: {
            classification: "parquet",
            compressionType: "none",
            typeOfData: "file",
          },
        },
        tableType: "EXTERNAL_TABLE",
      },
      openTableFormatInput: {
        icebergInput: {
          metadataOperation: "CREATE",
          version: "2",
        },
      },
    });

    const inGameTradesTable = new glue.CfnTable(this, "InGameTradesTable", {
      catalogId: cdk.Aws.ACCOUNT_ID,
      databaseName: props.gameEventsDatabase.ref,
      tableInput: {
        name: IN_GAME_TRADES_TABLE_NAME,
        description: `in-game trade actions for stack ${cdk.Aws.STACK_NAME}`,
        storageDescriptor: {
          columns: [
            { name: "traded_item", type: "string" },
            { name: "received_item", type: "string" },
            { name: "event_date", type: "date" },
            { name: "app_version", type: "string" },
            { name: "occurrences", type: "bigint" },
          ],
          location: props.analyticsBucket.s3UrlForObject(
            props.config.RAW_EVENTS_TABLE.toLowerCase()
          ),
          storedAsSubDirectories: false,
          parameters: {
            classification: "parquet",
            compressionType: "none",
            typeOfData: "file",
          },
        },
        tableType: "EXTERNAL_TABLE",
      },
      openTableFormatInput: {
        icebergInput: {
          metadataOperation: "CREATE",
          version: "2",
        },
      },
    });

    const inGameEventsEtl = new glue.CfnJob(this, "InGameEventsEtl", {
      name: `${props.config.WORKLOAD_NAME}-In-Game-ETL`,
      description: `Glue job to process raw events to in-game analytics, for stack ${cdk.Aws.STACK_NAME}.`,
      glueVersion: "5.0",
      maxRetries: 0,
      maxCapacity: 2,
      timeout: 30,
      executionProperty: {
        maxConcurrentRuns: 1,
      },
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation: `s3://${props.analyticsBucket.bucketName}/glue-scripts/samples/in_game_analysis.py`,
      },
      role: props.gameEventsEtlRole.roleArn,
      defaultArguments: {
        "--INPUT_DB_NAME": props.config.EVENTS_DATABASE,
        "--OUTPUT_DB_NAME": props.config.EVENTS_DATABASE,
        "--INPUT_TABLE_NAME": props.config.RAW_EVENTS_TABLE,
        "--OUTPUT_ACTION_TABLE_NAME": IN_GAME_EVENTS_TABLE_NAME,
        "--OUTPUT_TRADE_TABLE_NAME": IN_GAME_TRADES_TABLE_NAME,
        "--conf": `spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions --conf spark.sql.catalog.glue_catalog=org.apache.iceberg.spark.SparkCatalog --conf spark.sql.catalog.glue_catalog.warehouse=${props.analyticsBucket.s3UrlForObject()} --conf spark.sql.catalog.glue_catalog.catalog-impl=org.apache.iceberg.aws.glue.GlueCatalog --conf spark.sql.catalog.glue_catalog.io-impl=org.apache.iceberg.aws.s3.S3FileIO`,
        "--datalake-formats": "iceberg",
        "--enable-glue-datacatalog": "true",
      },
    });

    // create two data sets
    const dailyItemActionsDataSet = new qs.CfnDataSet(
      this,
      "DailyItemActionsDataSet",
      {
        awsAccountId: cdk.Aws.ACCOUNT_ID,
        dataSetId: `daily-item-actions-${props.config.WORKLOAD_NAME}`,
        name: "daily_item_actions",
        importMode: "SPICE",
        physicalTableMap: {
          "daily-item-actions-table": {
            relationalTable: {
              dataSourceArn: props.gapDataSource.attrArn,
              catalog: "AwsDataCatalog",
              schema: inGameEventsTable.databaseName,
              name: IN_GAME_EVENTS_TABLE_NAME,
              inputColumns: [
                {
                  name: "item_id",
                  type: "STRING",
                },
                {
                  name: "item_action",
                  type: "STRING",
                },
                {
                  name: "event_date",
                  type: "DATETIME",
                },
                {
                  name: "app_version",
                  type: "STRING",
                },
                {
                  name: "occurrences",
                  type: "INTEGER",
                },
              ],
            },
          },
        },
        logicalTableMap: {
          "daily-item-actions-logical": {
            alias: "daily_item_actions",
            dataTransforms: [
              {
                projectOperation: {
                  projectedColumns: [
                    "item_id",
                    "item_action",
                    "event_date",
                    "app_version",
                    "occurrences",
                  ],
                },
              },
            ],
            source: {
              physicalTableId: "daily-item-actions-table",
            },
          },
        },
        // allow default (all users) to access by default
        permissions: [
          {
            principal: `arn:aws:quicksight:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:group/default/game-analytics-users`,
            actions: ["quicksight:DescribeDataSet", "quicksight:DescribeDataSetPermissions", "quicksight:PassDataSet", "quicksight:DescribeIngestion", "quicksight:ListIngestions", "quicksight:UpdateDataSet", "quicksight:DeleteDataSet", "quicksight:CreateIngestion", "quicksight:CancelIngestion", "quicksight:UpdateDataSetPermissions"]
          }
        ]
      }
    );

    const dailyItemTradesDataSet = new qs.CfnDataSet(
      this,
      "DailyItemTradesDataSet",
      {
        awsAccountId: cdk.Aws.ACCOUNT_ID,
        dataSetId: `daily-item-trades-${props.config.WORKLOAD_NAME}`,
        name: "daily_item_trades",
        importMode: "SPICE",
        physicalTableMap: {
          "daily-item-trades-table": {
            relationalTable: {
              dataSourceArn: props.gapDataSource.attrArn,
              catalog: "AwsDataCatalog",
              schema: inGameEventsTable.databaseName,
              name: IN_GAME_TRADES_TABLE_NAME,
              inputColumns: [
                {
                  name: "traded_item",
                  type: "STRING",
                },
                {
                  name: "received_item",
                  type: "STRING",
                },
                {
                  name: "event_date",
                  type: "DATETIME",
                },
                {
                  name: "app_version",
                  type: "STRING",
                },
                {
                  name: "occurrences",
                  type: "INTEGER",
                },
              ],
            },
          },
        },
        logicalTableMap: {
          "daily-item-trades-logical": {
            alias: "daily_item_trades",
            dataTransforms: [
              {
                projectOperation: {
                  projectedColumns: [
                    "traded_item",
                    "received_item",
                    "event_date",
                    "app_version",
                    "occurrences",
                  ],
                },
              },
            ],
            source: {
              physicalTableId: "daily-item-trades-table",
            },
          },
        },
        // allow default (all users) to access by default
        permissions: [
          {
            principal: `arn:aws:quicksight:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:group/default/game-analytics-users`,
            actions: ["quicksight:DescribeDataSet",
              "quicksight:DescribeDataSetPermissions",
              "quicksight:PassDataSet",
              "quicksight:DescribeIngestion",
              "quicksight:ListIngestions",
              "quicksight:UpdateDataSet",
              "quicksight:DeleteDataSet",
              "quicksight:CreateIngestion",
              "quicksight:CancelIngestion",
              "quicksight:UpdateDataSetPermissions"]
          }
        ]
      }
    );

    // create template
    const inGameTemplate = new qs.CfnTemplate(this, "InGameTemplate", {
      awsAccountId: cdk.Aws.ACCOUNT_ID,
      templateId: "in_game_event_analysis",
      definition: {
        dataSetConfigurations: [
          {
            placeholder: "$daily_item_actions",
            dataSetSchema: {
              columnSchemaList: [
                {
                  name: "occurrences",
                  dataType: "INTEGER",
                },
                {
                  name: "item_id",
                  dataType: "STRING",
                },
                {
                  name: "item_action",
                  dataType: "STRING",
                },
              ],
            },
            columnGroupSchemaList: [],
          },
          {
            placeholder: "$daily_item_trades",
            dataSetSchema: {
              columnSchemaList: [
                {
                  name: "occurrences",
                  dataType: "INTEGER",
                },
                {
                  name: "traded_item",
                  dataType: "STRING",
                },
                {
                  name: "received_item",
                  dataType: "STRING",
                },
              ],
            },
            columnGroupSchemaList: [],
          },
        ],
        sheets: [
          {
            sheetId: "187ecdaa-f9de-47ec-a91e-3c22ac3640e0",
            name: "In-Game Actions",
            visuals: [
              {
                barChartVisual: {
                  visualId: "3ec615f8-0520-4166-a2b8-605f2adcebd1",
                  title: {
                    visibility: "VISIBLE",
                    formatText: {
                      richText:
                        "<visual-title>In-game actions per item</visual-title>",
                    },
                  },
                  subtitle: {
                    visibility: "VISIBLE",
                  },
                  chartConfiguration: {
                    fieldWells: {
                      barChartAggregatedFieldWells: {
                        category: [
                          {
                            categoricalDimensionField: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_id.1.1762198413825",
                              column: {
                                dataSetIdentifier: "$daily_item_actions",
                                columnName: "item_id",
                              },
                            },
                          },
                        ],
                        values: [
                          {
                            numericalMeasureField: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.occurrences.0.1762198408993",
                              column: {
                                dataSetIdentifier: "$daily_item_actions",
                                columnName: "occurrences",
                              },
                              aggregationFunction: {
                                simpleNumericalAggregation: "SUM",
                              },
                            },
                          },
                        ],
                        colors: [
                          {
                            categoricalDimensionField: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_action.2.1762198415225",
                              column: {
                                dataSetIdentifier: "$daily_item_actions",
                                columnName: "item_action",
                              },
                            },
                          },
                        ],
                      },
                    },
                    sortConfiguration: {
                      categorySort: [
                        {
                          fieldSort: {
                            fieldId:
                              "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_id.1.1762198413825",
                            direction: "DESC",
                          },
                        },
                      ],
                      categoryItemsLimit: {
                        otherCategories: "INCLUDE",
                      },
                      colorItemsLimit: {
                        otherCategories: "INCLUDE",
                      },
                      smallMultiplesLimitConfiguration: {
                        otherCategories: "INCLUDE",
                      },
                    },
                    orientation: "HORIZONTAL",
                    barsArrangement: "STACKED",
                    dataLabels: {
                      visibility: "HIDDEN",
                      overlap: "DISABLE_OVERLAP",
                    },
                    tooltip: {
                      tooltipVisibility: "VISIBLE",
                      selectedTooltipType: "DETAILED",
                      fieldBasedTooltip: {
                        aggregationVisibility: "HIDDEN",
                        tooltipTitleType: "PRIMARY_VALUE",
                        tooltipFields: [
                          {
                            fieldTooltipItem: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.occurrences.0.1762198408993",
                              visibility: "VISIBLE",
                            },
                          },
                          {
                            fieldTooltipItem: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_id.1.1762198413825",
                              visibility: "VISIBLE",
                            },
                          },
                          {
                            fieldTooltipItem: {
                              fieldId:
                                "9d28bc32-8025-4d2b-b4db-b4e416f827a2.item_action.2.1762198415225",
                              visibility: "VISIBLE",
                            },
                          },
                        ],
                      },
                    },
                  },
                  actions: [],
                  columnHierarchies: [],
                },
              },
              {
                sankeyDiagramVisual: {
                  visualId: "1ac54e0b-c147-482b-81ba-459cd2f9c028",
                  title: {
                    visibility: "VISIBLE",
                    formatText: {
                      richText: "<visual-title>In-game trades</visual-title>",
                    },
                  },
                  subtitle: {
                    visibility: "VISIBLE",
                  },
                  chartConfiguration: {
                    fieldWells: {
                      sankeyDiagramAggregatedFieldWells: {
                        source: [
                          {
                            categoricalDimensionField: {
                              fieldId:
                                "b632f422-b0d2-47b3-9bb7-805e129630b9.traded_item.0.1762198438257",
                              column: {
                                dataSetIdentifier: "$daily_item_trades",
                                columnName: "traded_item",
                              },
                            },
                          },
                        ],
                        destination: [
                          {
                            categoricalDimensionField: {
                              fieldId:
                                "b632f422-b0d2-47b3-9bb7-805e129630b9.received_item.1.1762198438591",
                              column: {
                                dataSetIdentifier: "$daily_item_trades",
                                columnName: "received_item",
                              },
                            },
                          },
                        ],
                        weight: [
                          {
                            numericalMeasureField: {
                              fieldId:
                                "b632f422-b0d2-47b3-9bb7-805e129630b9.occurrences.2.1762198439158",
                              column: {
                                dataSetIdentifier: "$daily_item_trades",
                                columnName: "occurrences",
                              },
                              aggregationFunction: {
                                simpleNumericalAggregation: "SUM",
                              },
                            },
                          },
                        ],
                      },
                    },
                    sortConfiguration: {
                      weightSort: [
                        {
                          fieldSort: {
                            fieldId:
                              "b632f422-b0d2-47b3-9bb7-805e129630b9.occurrences.2.1762198439158",
                            direction: "DESC",
                          },
                        },
                      ],
                    },
                    dataLabels: {
                      visibility: "VISIBLE",
                      overlap: "DISABLE_OVERLAP",
                    },
                  },
                  actions: [],
                },
              },
            ],
            layouts: [
              {
                configuration: {
                  gridLayout: {
                    elements: [
                      {
                        elementId: "3ec615f8-0520-4166-a2b8-605f2adcebd1",
                        elementType: "VISUAL",
                        columnSpan: 18,
                        rowSpan: 12,
                      },
                      {
                        elementId: "1ac54e0b-c147-482b-81ba-459cd2f9c028",
                        elementType: "VISUAL",
                        columnSpan: 18,
                        rowSpan: 12,
                      },
                    ],
                    canvasSizeOptions: {
                      screenCanvasSizeOptions: {
                        resizeOption: "FIXED",
                        optimizedViewPortWidth: "1600px",
                      },
                    },
                  },
                },
              },
            ],
            contentType: "INTERACTIVE",
          },
        ],
        calculatedFields: [],
        parameterDeclarations: [],
        filterGroups: [],
        analysisDefaults: {
          defaultNewSheetConfiguration: {
            interactiveLayoutConfiguration: {
              grid: {
                canvasSizeOptions: {
                  screenCanvasSizeOptions: {
                    resizeOption: "FIXED",
                    optimizedViewPortWidth: "1600px",
                  },
                },
              },
            },
            sheetContentType: "INTERACTIVE",
          },
        },
        options: {
          weekStart: "SUNDAY",
        },
        queryExecutionOptions: {
          queryExecutionMode: "AUTO",
        },
      },
    });

    // create analysis
    const inGameEventsAnalysis = new qs.CfnAnalysis(
      this,
      "InGameEventsAnalysis",
      {
        analysisId: "gap-in-game-event-analysis",
        awsAccountId: cdk.Aws.ACCOUNT_ID,
        name: "In-Game Events Analysis",

        sourceEntity: {
          sourceTemplate: {
            arn: inGameTemplate.attrArn,
            dataSetReferences: [
              {
                dataSetArn: dailyItemActionsDataSet.attrArn,
                dataSetPlaceholder: "$daily_item_actions",
              },
              {
                dataSetArn: dailyItemTradesDataSet.attrArn,
                dataSetPlaceholder: "$daily_item_trades",
              },
            ],
          },
        },
        // allow default (all users) to access by default
        permissions: [
          {
            principal: `arn:aws:quicksight:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:group/default/game-analytics-users`,
            actions: [
              "quicksight:RestoreAnalysis", "quicksight:UpdateAnalysisPermissions", "quicksight:DeleteAnalysis",
              "quicksight:DescribeAnalysisPermissions", "quicksight:QueryAnalysis", "quicksight:DescribeAnalysis",
              "quicksight:UpdateAnalysis"
            ]
          }
        ]
      }
    );

    this.inGameEventsEtl = inGameEventsEtl;

  }
}
