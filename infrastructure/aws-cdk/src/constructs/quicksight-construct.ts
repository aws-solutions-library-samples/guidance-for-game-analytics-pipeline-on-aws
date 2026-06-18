import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as quicksight from 'aws-cdk-lib/aws-quicksight';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { GameAnalyticsPipelineConfig } from '../helpers/config-types';
import { RedshiftConstruct } from './redshift-construct';
import { VpcConstruct } from './vpc-construct';
import { DataLakeConstruct } from './data-lake-construct';
import {
  buildPulseSheet,
  buildProgressionSheet,
  buildCombatSheet,
  buildMonetizationSheet,
  buildSentimentSheet,
} from './quicksight-sheet-builders';

export const VPC_CONNECTION_VERSION = 6;
const DIRECT_QUERY_WINDOW_DAYS = 30;

// Each entry of `columnExpressions` MUST include its own trailing comma; a final
// `'  1 as event_count'` line is appended automatically.
function buildEventDataSql(columnExpressions: string[], eventTypes: string[]): string {
  const eventTypeList = eventTypes.map((t) => `'${t}'`).join(', ');
  return [
    'SELECT',
    ...columnExpressions,
    '  1 as event_count',
    'FROM {db_name}."event_data"',
    `WHERE event_type IN (${eventTypeList})`,
    `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
  ].join('\n');
}

// ---- Data Models ---- //

export interface ColumnDefinition {
  name: string;
  type: 'STRING' | 'INTEGER' | 'DECIMAL' | 'DATETIME';
}

export interface DataSetDefinition {
  viewName: string;
  columns: ColumnDefinition[];
  /** Optional custom SQL query. When provided, replaces the default `SELECT * FROM schema.viewName`. Use `{db_name}` as placeholder for the schema-qualified table path. */
  customSqlQuery?: string;
  /** Optional calculated columns to add via LogicalTableMap DataTransforms */
  calculatedColumns?: Array<{ columnName: string; columnId: string; expression: string }>;
  /** Optional column groups (e.g., for geospatial columns that need a geographic role) */
  columnGroups?: Array<{ geoSpatialColumnGroup: { name: string; countryCode: string; columns: string[] } }>;
}

/**
 * Declarative definitions for 5 rich DataSets that query `event_data` directly
 * using custom SQL with JSON extraction. These preserve multiple dimensions so
 * QuickSight can aggregate and cross-filter across the dashboard.
 */
export const DATA_SET_DEFINITIONS: DataSetDefinition[] = [
  // 1. Master event fact table
  {
    viewName: 'all_events',
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      '  event_name,',
      '  app_version,',
      '  application_id,',
      '  date({epoch_to_ts:event_timestamp}) as event_date,',
      "  date_trunc('hour', {epoch_to_ts:event_timestamp}) as event_hour,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'platform'), '') as platform,",
      "  CASE NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '')",
      "    WHEN 'UK' THEN 'United Kingdom'",
      "    ELSE INITCAP(LOWER(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '')))",
      '  END as country,',
      '  1 as event_count',
      'FROM {db_name}."event_data"',
    ].join('\n'),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'event_name', type: 'STRING' },
      { name: 'app_version', type: 'STRING' },
      { name: 'application_id', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'event_hour', type: 'DATETIME' },
      { name: 'platform', type: 'STRING' },
      { name: 'country', type: 'STRING' },
      { name: 'event_count', type: 'INTEGER' },
    ],
  },
  // 2. Match/combat data
  {
    viewName: 'match_events',
    customSqlQuery: buildEventDataSql(
      [
        '  event_id,',
        '  event_type,',
        '  date({epoch_to_ts:event_timestamp}) as event_date,',
        "  JSON_EXTRACT_PATH_TEXT(event_data, 'match_id') as match_id,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'map_id'), '') as map_id,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'match_type'), '') as match_type,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'match_result_type'), '') as match_result,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'spell_id'), '') as spell_used,",
        "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'exp_gained'), '') AS INTEGER) as exp_gained,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'matching_failed_msg'), '') AS matching_failed_msg,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'most_used_spell'), '') AS most_used_spell,",
      ],
      ['match_start', 'match_end', 'user_knockout', 'matchmaking_start', 'matchmaking_complete', 'matchmaking_failed'],
    ),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'match_id', type: 'STRING' },
      { name: 'map_id', type: 'STRING' },
      { name: 'match_type', type: 'STRING' },
      { name: 'match_result', type: 'STRING' },
      { name: 'spell_used', type: 'STRING' },
      { name: 'exp_gained', type: 'INTEGER' },
      { name: 'matching_failed_msg', type: 'STRING' },
      { name: 'most_used_spell', type: 'STRING' },
      { name: 'event_count', type: 'INTEGER' },
    ],
    calculatedColumns: [
      {
        columnName: 'win_pct_value',
        columnId: 'win_pct_value',
        expression: "ifelse({match_result} = 'WIN', 100, 0)",
      },
    ],
  },
  // 3. Level progression
  {
    viewName: 'level_events',
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      '  date({epoch_to_ts:event_timestamp}) as event_date,',
      "  JSON_EXTRACT_PATH_TEXT(event_data, 'level_id') as level_id,",
      "  CAST(JSON_EXTRACT_PATH_TEXT(event_data, 'level_version') AS INTEGER) as level_version,",
      '  1 as event_count',
      'FROM {db_name}."event_data"',
      "WHERE event_type IN ('level_started', 'level_completed', 'level_failed')",
      `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
    ].join('\n'),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'level_id', type: 'STRING' },
      { name: 'level_version', type: 'INTEGER' },
      { name: 'event_count', type: 'INTEGER' },
    ],
    calculatedColumns: [
      {
        columnName: 'completion_rate_pct',
        columnId: 'completion_rate_pct',
        expression:
          "sumIf({event_count}, {event_type} = 'level_completed') / sumIf({event_count}, {event_type} = 'level_started') * 100",
      },
    ],
  },
  // 4. Monetization & lootbox
  {
    viewName: 'economy_events',
    customSqlQuery: buildEventDataSql(
      [
        '  event_id,',
        '  event_type,',
        '  date({epoch_to_ts:event_timestamp}) as event_date,',
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'item_id'), '') as item_id,",
        "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) as currency_amount,",
        '  CASE',
        "    WHEN CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) BETWEEN 1 AND 9 THEN '01: $1-9'",
        "    WHEN CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) BETWEEN 10 AND 19 THEN '02: $10-19'",
        "    WHEN CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) BETWEEN 20 AND 49 THEN '03: $20-49'",
        "    WHEN CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) BETWEEN 50 AND 99 THEN '04: $50-99'",
        "    WHEN CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) >= 100 THEN '05: $100+'",
        "    ELSE '99: Unknown'",
        '  END as currency_amount_band,',
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_type'), '') as currency_type,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'transaction_id'), '') as transaction_id,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'item_rarity'), '') as item_rarity,",
        "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'lootbox_cost'), '') AS INTEGER) as lootbox_cost,",
      ],
      ['iap_transaction', 'lootbox_opened', 'item_viewed'],
    ),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'item_id', type: 'STRING' },
      { name: 'currency_amount', type: 'INTEGER' },
      { name: 'currency_amount_band', type: 'STRING' },
      { name: 'currency_type', type: 'STRING' },
      { name: 'transaction_id', type: 'STRING' },
      { name: 'item_rarity', type: 'STRING' },
      { name: 'lootbox_cost', type: 'INTEGER' },
      { name: 'event_count', type: 'INTEGER' },
    ],
  },
  // 5. Sentiment, reports, registrations
  {
    viewName: 'player_health',
    customSqlQuery: buildEventDataSql(
      [
        '  event_id,',
        '  event_type,',
        '  app_version,',
        '  date({epoch_to_ts:event_timestamp}) as event_date,',
        "  CASE NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '')",
        "    WHEN 'UK' THEN 'United Kingdom'",
        "    ELSE INITCAP(LOWER(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '')))",
        '  END as country,',
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'platform'), '') as platform,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'report_reason'), '') as report_reason,",
        "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'user_rating'), '') AS INTEGER) as user_rating,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'user_rank_reached'), '') as rank_reached,",
        "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'tutorial_screen_id'), '') AS tutorial_screen_id,",
      ],
      ['user_registration', 'user_report', 'user_sentiment', 'user_rank_up', 'tutorial_progression'],
    ),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'app_version', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'country', type: 'STRING' },
      { name: 'platform', type: 'STRING' },
      { name: 'report_reason', type: 'STRING' },
      { name: 'user_rating', type: 'INTEGER' },
      { name: 'rank_reached', type: 'STRING' },
      { name: 'tutorial_screen_id', type: 'STRING' },
      { name: 'event_count', type: 'INTEGER' },
    ],
    calculatedColumns: [
      {
        columnName: 'target_rating',
        columnId: 'target_rating',
        expression: 'parseDecimal("4.0")',
      },
    ],
    columnGroups: [
      {
        geoSpatialColumnGroup: {
          name: 'country-geo-group',
          countryCode: 'US',
          columns: ['country'],
        },
      },
    ],
  },
  // 6. Match lifecycle stages (one row per stage — pre-aggregated for the lifecycle Funnel)
  {
    viewName: 'match_lifecycle_funnel',
    customSqlQuery: [
      "SELECT '1_matchmaking_start' as stage_label, count(*) as event_count",
      'FROM {db_name}."event_data"',
      "WHERE event_type = 'matchmaking_start'",
      `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
      'UNION ALL',
      "SELECT '2_matchmaking_complete' as stage_label, count(*) as event_count",
      'FROM {db_name}."event_data"',
      "WHERE event_type = 'matchmaking_complete'",
      `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
      'UNION ALL',
      "SELECT '3_match_start' as stage_label, count(*) as event_count",
      'FROM {db_name}."event_data"',
      "WHERE event_type = 'match_start'",
      `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
      'UNION ALL',
      "SELECT '4_match_end' as stage_label, count(*) as event_count",
      'FROM {db_name}."event_data"',
      "WHERE event_type = 'match_end'",
      `  AND {epoch_to_ts:event_timestamp} >= {time_window:${DIRECT_QUERY_WINDOW_DAYS}}`,
    ].join('\n'),
    columns: [
      { name: 'stage_label', type: 'STRING' },
      { name: 'event_count', type: 'INTEGER' },
    ],
  },
];

// ---- Props Interface ---- //

export interface QuickSightConstructProps extends cdk.StackProps {
  config: GameAnalyticsPipelineConfig;
  /** Required for REDSHIFT mode */
  redshiftConstruct?: RedshiftConstruct;
  /** Required for REDSHIFT mode */
  vpcConstruct?: VpcConstruct;
  /** Required for DATA_LAKE mode */
  dataLakeConstruct?: DataLakeConstruct;
  /** Required for DATA_LAKE mode */
  analyticsBucket?: s3.Bucket;
}

// ---- Permission Constants ---- //

/**
 * Permission actions granted to the QuickSight user on each DataSet.
 */
const DATA_SET_PERMISSIONS: string[] = [
  'quicksight:DescribeDataSet',
  'quicksight:DescribeDataSetPermissions',
  'quicksight:PassDataSet',
  'quicksight:DescribeIngestion',
  'quicksight:ListIngestions',
  'quicksight:UpdateDataSet',
  'quicksight:DeleteDataSet',
  'quicksight:CreateIngestion',
  'quicksight:CancelIngestion',
  'quicksight:UpdateDataSetPermissions',
];

/**
 * Permission actions granted to the QuickSight user on the DataSource.
 */
const DATA_SOURCE_PERMISSIONS: string[] = [
  'quicksight:DescribeDataSource',
  'quicksight:DescribeDataSourcePermissions',
  'quicksight:PassDataSource',
  'quicksight:UpdateDataSource',
  'quicksight:DeleteDataSource',
  'quicksight:UpdateDataSourcePermissions',
];

/**
 * Permission actions granted to the QuickSight user on the Dashboard.
 */
const DASHBOARD_PERMISSIONS: string[] = [
  'quicksight:DescribeDashboard',
  'quicksight:ListDashboardVersions',
  'quicksight:QueryDashboard',
  'quicksight:UpdateDashboard',
  'quicksight:DeleteDashboard',
  'quicksight:UpdateDashboardPermissions',
  'quicksight:DescribeDashboardPermissions',
  'quicksight:UpdateDashboardPublishedVersion',
];

// ---- Factory Helper ---- //

/**
 * Factory function that generates a CfnDataSet from a declarative DataSetDefinition.
 *
 * Supports two modes:
 * - Custom SQL: when `def.customSqlQuery` is provided, uses it (replacing `{db_name}` with the schema path)
 * - View-based: falls back to `SELECT * FROM schema.viewName`
 *
 * @param scope - CDK construct scope
 * @param def - Declarative dataset definition (view name, columns, optional custom SQL)
 * @param dataSourceArn - ARN of the QuickSight DataSource (Redshift or Athena)
 * @param accountId - AWS account ID
 * @param workloadName - Workload name from config (used in dataSetId)
 * @param isRedshift - Whether the data source is Redshift (true) or Athena (false)
 * @param database - Database name from config (EVENTS_DATABASE)
 * @param quicksightUserArn - ARN of the QuickSight user/group for permissions
 */

function buildCalculatedColumnTransforms(calculatedColumns: DataSetDefinition['calculatedColumns']): object[] {
  if (!calculatedColumns?.length) return [];
  return [
    {
      createColumnsOperation: {
        columns: calculatedColumns.map((calc) => ({
          columnName: calc.columnName,
          columnId: calc.columnId,
          expression: calc.expression,
        })),
      },
    },
  ];
}

function buildGeoTagTransforms(columnGroups: DataSetDefinition['columnGroups']): object[] {
  if (!columnGroups?.length) return [];
  const transforms: object[] = [];
  for (const group of columnGroups) {
    for (const col of group.geoSpatialColumnGroup.columns) {
      transforms.push({
        tagColumnOperation: {
          columnName: col,
          tags: [{ columnGeographicRole: 'COUNTRY' }],
        },
      });
    }
  }
  return transforms;
}

function buildLogicalTableMap(
  def: DataSetDefinition,
): Record<string, quicksight.CfnDataSet.LogicalTableProperty> | undefined {
  const calcTransforms = buildCalculatedColumnTransforms(def.calculatedColumns);
  const geoTransforms = buildGeoTagTransforms(def.columnGroups);
  const dataTransforms = [...calcTransforms, ...geoTransforms];
  if (dataTransforms.length === 0) return undefined;

  return {
    LogicalTable0: {
      alias: def.viewName,
      source: { physicalTableId: 'PhysicalTable0' },
      dataTransforms,
    },
  };
}

export function createDataSetFromView(
  scope: Construct,
  def: DataSetDefinition,
  dataSourceArn: string,
  accountId: string,
  workloadName: string,
  isRedshift: boolean,
  database: string,
  quicksightUserArn: string,
): quicksight.CfnDataSet {
  const schema = isRedshift ? `"${database}"."public"` : `"${database}"`;

  const resolveSqlTokens = (sql: string): string => {
    return sql
      .replace(/\{db_name\}/g, schema)
      .replace(/\{time_window:(\d+)\}/g, (_, n) =>
        isRedshift ? `dateadd(day, -${n}, getdate())` : `current_timestamp - interval '${n}' day`,
      )
      .replace(/\{epoch_to_ts:([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, col) =>
        isRedshift ? `timestamp 'epoch' + ${col} * interval '1 second'` : `from_unixtime(${col})`,
      );
  };
  const sqlQuery = def.customSqlQuery
    ? resolveSqlTokens(def.customSqlQuery)
    : `SELECT * FROM ${schema}."${def.viewName}"`;

  const logicalTableMap = buildLogicalTableMap(def);

  return new quicksight.CfnDataSet(scope, `DataSet-${def.viewName}`, {
    awsAccountId: accountId,
    dataSetId: `${workloadName}-${def.viewName}`,
    name: def.viewName,
    importMode: 'DIRECT_QUERY',
    physicalTableMap: {
      PhysicalTable0: {
        customSql: {
          dataSourceArn,
          name: def.viewName,
          sqlQuery,
          columns: def.columns.map((c) => ({
            name: c.name,
            type: c.type,
          })),
        },
      },
    },
    ...(logicalTableMap && { logicalTableMap }),
    ...(def.columnGroups?.length && { columnGroups: def.columnGroups }),
    permissions: [
      {
        principal: quicksightUserArn,
        actions: DATA_SET_PERMISSIONS,
      },
    ],
  });
}

// ---- Null Exclusion Filter Groups ---- //

/**
 * Builds filter groups that exclude NULL values from categorical dimension fields.
 * Each filter group targets a specific visual and excludes rows where the category column is NULL.
 * This prevents "null" from appearing as a bar/slice in charts.
 */
function buildNullExclusionFilterGroups(
  dataSetIdentifiers: Record<string, string>,
): quicksight.CfnDashboard.FilterGroupProperty[] {
  const filters: Array<{
    visualId: string;
    sheetId: string;
    dataSet: string;
    column: string;
  }> = [
    // Pulse sheet
    {
      visualId: 'pulse-platform-bar',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'platform',
    },
    {
      visualId: 'pulse-country-heatmap',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'country',
    },
    // Combat sheet
    {
      visualId: 'cb-outcomes-by-map-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'map_id',
    },
    {
      visualId: 'cb-outcomes-by-map-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'match_result',
    },
    {
      visualId: 'cb-match-types-donut',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'match_type',
    },
    {
      visualId: 'cb-spell-knockouts-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'spell_used',
    },
    {
      visualId: 'cb-matchmaking-failures-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'matching_failed_msg',
    },
    {
      visualId: 'cb-spell-performance-table',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'most_used_spell',
    },
    {
      visualId: 'cb-map-outcome-pivot',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'map_id',
    },
    {
      visualId: 'cb-map-outcome-pivot',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      column: 'match_result',
    },
    // Progression sheet
    {
      visualId: 'pr-tutorial-funnel',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'tutorial_screen_id',
    },
    {
      visualId: 'pr-rank-distribution-bar',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'rank_reached',
    },
    // Monetization sheet
    {
      visualId: 'mn-lootbox-rarity-bar',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      column: 'item_rarity',
    },
    {
      visualId: 'mn-lootbox-rarity-treemap',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      column: 'item_rarity',
    },
    {
      visualId: 'mn-transaction-amount-distribution-bar',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      column: 'currency_amount_band',
    },
    {
      visualId: 'mn-revenue-by-currency-area',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      column: 'currency_type',
    },
    // Sentiment sheet
    {
      visualId: 'st-report-reasons-bar',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'report_reason',
    },
    {
      visualId: 'st-rating-distribution-vbar',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      column: 'user_rating',
    },
  ];

  // Build null exclusion filters using customFilterConfiguration
  const nullFilters = filters.map((f, idx) => ({
    filterGroupId: `null-exclude-${idx}`,
    filters: [
      {
        categoryFilter: {
          filterId: `null-filter-${idx}`,
          column: { dataSetIdentifier: f.dataSet, columnName: f.column },
          configuration: {
            customFilterConfiguration: {
              matchOperator: 'DOES_NOT_EQUAL',
              nullOption: 'NON_NULLS_ONLY',
              selectAllOptions: 'FILTER_ALL_VALUES',
            },
          },
        },
      },
    ],
    scopeConfiguration: {
      selectedSheets: {
        sheetVisualScopingConfigurations: [
          {
            sheetId: f.sheetId,
            scope: 'SELECTED_VISUALS',
            visualIds: [f.visualId],
          },
        ],
      },
    },
    crossDataset: 'SINGLE_DATASET',
    status: 'ENABLED',
  }));

  // Additional event_type inclusion filters for visuals that need to restrict
  // to specific event types (because the DataSet contains multiple event types
  // but only some have the relevant field populated)
  const eventTypeFilters: Array<{
    visualId: string;
    sheetId: string;
    dataSet: string;
    eventTypes: string[];
  }> = [
    // Platform only exists on user_registration events in player_health
    {
      visualId: 'pulse-platform-bar',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_registration'],
    },
    // Country only exists on user_registration events in player_health
    {
      visualId: 'pulse-country-heatmap',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_registration'],
    },
    // tutorial_screen_id only exists on tutorial_progression
    {
      visualId: 'pr-tutorial-funnel',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['tutorial_progression'],
    },
    // rank_reached only exists on user_rank_up
    {
      visualId: 'pr-rank-distribution-bar',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_rank_up'],
    },
    // match_result only exists on match_end; map_id on match_start/match_end/user_knockout
    {
      visualId: 'cb-outcomes-by-map-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    // match_type exists on matchmaking_start, matchmaking_complete, matchmaking_failed
    {
      visualId: 'cb-match-types-donut',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['matchmaking_start', 'matchmaking_complete', 'matchmaking_failed'],
    },
    // spell_used only exists on user_knockout
    {
      visualId: 'cb-spell-knockouts-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['user_knockout'],
    },
    // matching_failed_msg only exists on matchmaking_failed
    {
      visualId: 'cb-matchmaking-failures-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['matchmaking_failed'],
    },
    // item_rarity only exists on lootbox_opened
    {
      visualId: 'mn-lootbox-rarity-bar',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      eventTypes: ['lootbox_opened'],
    },
    {
      visualId: 'mn-lootbox-rarity-treemap',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      eventTypes: ['lootbox_opened'],
    },
    // report_reason only exists on user_report
    {
      visualId: 'st-report-reasons-bar',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_report'],
    },
    // user_rating only exists on user_sentiment
    {
      visualId: 'st-rating-distribution-vbar',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_sentiment'],
    },
    // Avg rating gauge — scope to user_sentiment so target arc compares against actual rating
    {
      visualId: 'st-avg-rating-gauge',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_sentiment'],
    },
    // login vs logout pulse bar restricted to those two event types
    {
      visualId: 'pulse-login-logout-bar',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.all_events,
      eventTypes: ['login', 'logout'],
    },
    // exp_gained only meaningful on match_end
    {
      visualId: 'cb-avg-xp-kpi',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    // currency_amount only populated on iap_transaction
    {
      visualId: 'mn-revenue-by-currency-area',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      eventTypes: ['iap_transaction'],
    },
    // Purchase funnel: viewer → buyer journey only — exclude unrelated event types
    {
      visualId: 'mn-purchase-funnel',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.all_events,
      eventTypes: ['item_viewed', 'iap_transaction'],
    },
    // Spell volume + win-rate bars — most_used_spell only populated on match_end events
    {
      visualId: 'cb-spell-volume-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    {
      visualId: 'cb-spell-winrate-bar',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    {
      visualId: 'cb-spell-performance-table',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    {
      visualId: 'cb-map-outcome-pivot',
      sheetId: 'combat-sheet',
      dataSet: dataSetIdentifiers.match_events,
      eventTypes: ['match_end'],
    },
    // Country x platform heatmap — both fields populated only on user_registration
    {
      visualId: 'pulse-country-platform-heatmap',
      sheetId: 'pulse-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_registration'],
    },
    // Progression KPI banner: scope each headline number to its event type
    {
      visualId: 'pr-tutorial-sessions-kpi',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['tutorial_progression'],
    },
    {
      visualId: 'pr-levels-completed-kpi',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.level_events,
      eventTypes: ['level_completed'],
    },
    {
      visualId: 'pr-rank-ups-kpi',
      sheetId: 'progression-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_rank_up'],
    },
    // Transaction amount band chart — only iap_transaction has currency_amount_band populated
    {
      visualId: 'mn-transaction-amount-distribution-bar',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      eventTypes: ['iap_transaction'],
    },
  ];

  const inclusionFilters = eventTypeFilters.map((f, idx) => ({
    filterGroupId: `event-type-include-${idx}`,
    filters: [
      {
        categoryFilter: {
          filterId: `event-type-filter-${idx}`,
          column: { dataSetIdentifier: f.dataSet, columnName: 'event_type' },
          configuration: {
            filterListConfiguration: {
              matchOperator: 'CONTAINS',
              categoryValues: f.eventTypes,
              nullOption: 'NON_NULLS_ONLY',
            },
          },
        },
      },
    ],
    scopeConfiguration: {
      selectedSheets: {
        sheetVisualScopingConfigurations: [
          {
            sheetId: f.sheetId,
            scope: 'SELECTED_VISUALS',
            visualIds: [f.visualId],
          },
        ],
      },
    },
    crossDataset: 'SINGLE_DATASET',
    status: 'ENABLED',
  }));

  // Currency-type filter: scope the USD band chart to USD-only transactions.
  // Mixing currency_amount across different currencies without FX is meaningless,
  // so this guarantees the bands represent real USD price points.
  const currencyFilter: quicksight.CfnDashboard.FilterGroupProperty = {
    filterGroupId: 'currency-type-usd-band',
    filters: [
      {
        categoryFilter: {
          filterId: 'currency-type-usd-band-filter',
          column: { dataSetIdentifier: dataSetIdentifiers.economy_events, columnName: 'currency_type' },
          configuration: {
            filterListConfiguration: {
              matchOperator: 'CONTAINS',
              categoryValues: ['USD'],
              nullOption: 'NON_NULLS_ONLY',
            },
          },
        },
      },
    ],
    scopeConfiguration: {
      selectedSheets: {
        sheetVisualScopingConfigurations: [
          {
            sheetId: 'monetization-sheet',
            scope: 'SELECTED_VISUALS',
            visualIds: ['mn-transaction-amount-distribution-bar'],
          },
        ],
      },
    },
    crossDataset: 'SINGLE_DATASET',
    status: 'ENABLED',
  };

  return [...nullFilters, ...inclusionFilters, currencyFilter];
}

// ---- Construct ---- //

/**
 * QuickSight CDK construct for the Game Analytics Pipeline.
 *
 * Encapsulates all QuickSight resources — DataSource, DataSets, Template, Dashboard,
 * and IAM — as a single CDK construct gated behind the ENABLE_QUICKSIGHT_DASHBOARD config flag.
 *
 * Resource chain: IAM Role → [VPC Connection] → DataSource → DataSets (×11) → Template → Dashboard
 */
export class QuickSightConstruct extends Construct {
  public readonly dataSource: quicksight.CfnDataSource;
  public readonly qsRoleName: string;

  constructor(parent: Construct, name: string, props: QuickSightConstructProps) {
    super(parent, name);

    this.node.addMetadata('version', String(VPC_CONNECTION_VERSION));

    const accountId = cdk.Aws.ACCOUNT_ID;
    const region = cdk.Aws.REGION;
    const workloadName = props.config.WORKLOAD_NAME;
    const database = props.config.EVENTS_DATABASE;
    const isRedshift = props.config.DATA_STACK === 'REDSHIFT';

    this.validateProps(props, isRedshift);

    const quicksightUserArn = `arn:aws:quicksight:${region}:${accountId}:user/default/${props.config.QUICKSIGHT_USERNAME}`;

    const qsRole = this.createIamRole(props, isRedshift, accountId, region, workloadName, database);
    this.qsRoleName = qsRole.roleName;

    const dataSource = this.createDataSource(
      props,
      isRedshift,
      accountId,
      region,
      workloadName,
      database,
      quicksightUserArn,
      qsRole,
    );
    this.dataSource = dataSource;

    const dataSets = DATA_SET_DEFINITIONS.map((def) =>
      createDataSetFromView(
        this,
        def,
        dataSource.attrArn,
        accountId,
        workloadName,
        isRedshift,
        database,
        quicksightUserArn,
      ),
    );

    this.createDashboard(accountId, region, workloadName, quicksightUserArn, dataSets);
  }

  private validateProps(props: QuickSightConstructProps, isRedshift: boolean): void {
    if (!props.config.QUICKSIGHT_USERNAME || props.config.QUICKSIGHT_USERNAME.trim() === '') {
      throw new Error(
        'QUICKSIGHT_USERNAME must be provided when ENABLE_QUICKSIGHT_DASHBOARD is true. ' +
          "Set QUICKSIGHT_USERNAME to a valid QuickSight user or group (e.g., 'admin/quicksight-admin').",
      );
    }

    if (isRedshift) {
      if (!props.redshiftConstruct) {
        throw new Error(
          "redshiftConstruct must be provided when DATA_STACK is 'REDSHIFT' and ENABLE_QUICKSIGHT_DASHBOARD is true.",
        );
      }
      if (!props.vpcConstruct) {
        throw new Error(
          "vpcConstruct must be provided when DATA_STACK is 'REDSHIFT' and ENABLE_QUICKSIGHT_DASHBOARD is true.",
        );
      }
    } else {
      if (!props.dataLakeConstruct) {
        throw new Error(
          "dataLakeConstruct must be provided when DATA_STACK is 'DATA_LAKE' and ENABLE_QUICKSIGHT_DASHBOARD is true.",
        );
      }
      if (!props.analyticsBucket) {
        throw new Error(
          "analyticsBucket must be provided when DATA_STACK is 'DATA_LAKE' and ENABLE_QUICKSIGHT_DASHBOARD is true.",
        );
      }
    }
  }

  private createIamRole(
    props: QuickSightConstructProps,
    isRedshift: boolean,
    accountId: string,
    region: string,
    workloadName: string,
    database: string,
  ): iam.Role {
    const qsRole = new iam.Role(this, 'QuickSightServiceRole', {
      assumedBy: new iam.ServicePrincipal('quicksight.amazonaws.com'),
    });
    qsRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    if (isRedshift) {
      const namespaceSecretName = `redshift!${props.redshiftConstruct!.namespace.ref}-db-admin`;
      const namespaceSecretArnPattern = `arn:aws:secretsmanager:${region}:${accountId}:secret:redshift!${props.redshiftConstruct!.namespace.ref}-db-admin-*`;
      qsRole.addToPolicy(
        new iam.PolicyStatement({ actions: ['secretsmanager:GetSecretValue'], resources: [namespaceSecretArnPattern] }),
      );
      qsRole.addToPolicy(
        new iam.PolicyStatement({ actions: ['kms:Decrypt'], resources: [props.redshiftConstruct!.key.keyArn] }),
      );
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['redshift-serverless:GetCredentials', 'redshift-serverless:GetWorkgroup'],
          resources: [`arn:aws:redshift-serverless:${region}:${accountId}:workgroup/*`],
        }),
      );

      new iam.CfnPolicy(this, 'QuickSightManagedServiceRoleSecretAccessPolicy', {
        policyName: `${workloadName}-QuickSightSecretAccess`,
        roles: ['aws-quicksight-service-role-v0'],
        policyDocument: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
              resources: [namespaceSecretArnPattern],
            }),
            new iam.PolicyStatement({
              actions: ['kms:Decrypt'],
              resources: [props.redshiftConstruct!.key.keyArn],
              conditions: {
                StringEquals: { 'kms:ViaService': `secretsmanager.${region}.amazonaws.com` },
                StringLike: {
                  'kms:EncryptionContext:SecretARN': `arn:aws:secretsmanager:${region}:${accountId}:secret:${namespaceSecretName}*`,
                },
              },
            }),
          ],
        }),
      });
    } else {
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'athena:GetQueryExecution',
            'athena:GetQueryResults',
            'athena:StartQueryExecution',
            'athena:StopQueryExecution',
            'athena:GetWorkGroup',
          ],
          resources: [`arn:aws:athena:*:*:workgroup/${props.dataLakeConstruct!.gameAnalyticsWorkgroup.name}`],
        }),
      );
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['glue:GetTable', 'glue:GetTables', 'glue:GetDatabase'],
          resources: [
            `arn:aws:glue:*:*:catalog`,
            `arn:aws:glue:*:*:database/${database}`,
            `arn:aws:glue:*:*:table/${database}/*`,
          ],
        }),
      );
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
          resources: [props.analyticsBucket!.bucketArn, `${props.analyticsBucket!.bucketArn}/*`],
        }),
      );
    }

    return qsRole;
  }

  private createDataSource(
    props: QuickSightConstructProps,
    isRedshift: boolean,
    accountId: string,
    region: string,
    workloadName: string,
    database: string,
    quicksightUserArn: string,
    qsRole: iam.Role,
  ): quicksight.CfnDataSource {
    if (isRedshift) {
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: [
            'ec2:CreateNetworkInterface',
            'ec2:ModifyNetworkInterfaceAttribute',
            'ec2:DeleteNetworkInterface',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeSubnets',
            'ec2:DescribeSecurityGroups',
          ],
          resources: ['*'],
        }),
      );

      const qsSecurityGroup = new ec2.CfnSecurityGroup(this, 'QuickSightSecurityGroup', {
        vpcId: props.vpcConstruct!.vpc.vpcId,
        groupDescription: 'Security group for QuickSight VPC connection to Redshift',
        securityGroupEgress: [{ ipProtocol: '-1', cidrIp: '0.0.0.0/0', description: 'Allow all outbound traffic' }],
      });

      const vpcConnection = new quicksight.CfnVPCConnection(this, 'VPCConnection', {
        awsAccountId: accountId,
        vpcConnectionId: `${workloadName}-qs-vpc-conn-v${VPC_CONNECTION_VERSION}`,
        name: `${workloadName}-QuickSight-VPC`,
        subnetIds: props.vpcConstruct!.vpc.privateSubnets.map((s) => s.subnetId),
        securityGroupIds: [qsSecurityGroup.attrGroupId],
        roleArn: qsRole.roleArn,
      });
      vpcConnection.node.addDependency(qsRole);

      const dataSource = new quicksight.CfnDataSource(this, 'RedshiftDataSource', {
        awsAccountId: accountId,
        dataSourceId: `${workloadName}-redshift-ds`,
        name: `${workloadName}-Redshift`,
        type: 'REDSHIFT',
        dataSourceParameters: {
          redshiftParameters: {
            database,
            host: props.redshiftConstruct!.workgroup.attrWorkgroupEndpointAddress,
            port: props.redshiftConstruct!.workgroup.attrWorkgroupEndpointPort,
          },
        },
        credentials: {
          credentialPair: {
            username: 'db-admin',
            password: cdk.Fn.join('', [
              '{{resolve:secretsmanager:redshift!',
              props.redshiftConstruct!.namespace.ref,
              '-db-admin:SecretString:password}}',
            ]),
          },
        },
        vpcConnectionProperties: { vpcConnectionArn: vpcConnection.attrArn },
        permissions: [{ principal: quicksightUserArn, actions: DATA_SOURCE_PERMISSIONS }],
      });
      return dataSource;
    } else {
      const dataSource = new quicksight.CfnDataSource(this, 'AthenaDataSource', {
        awsAccountId: accountId,
        dataSourceId: `${workloadName}-athena-ds`,
        name: `${workloadName}-Athena`,
        type: 'ATHENA',
        dataSourceParameters: { athenaParameters: { workGroup: props.dataLakeConstruct!.gameAnalyticsWorkgroup.name } },
        permissions: [{ principal: quicksightUserArn, actions: DATA_SOURCE_PERMISSIONS }],
      });
      dataSource.node.addDependency(props.dataLakeConstruct!.gameAnalyticsWorkgroup);
      return dataSource;
    }
  }

  private createDashboard(
    accountId: string,
    region: string,
    workloadName: string,
    quicksightUserArn: string,
    dataSets: quicksight.CfnDataSet[],
  ): void {
    const dataSetIdentifierDeclarations = DATA_SET_DEFINITIONS.map((def) => ({
      identifier: def.viewName,
      dataSetArn: cdk.Fn.sub(
        `arn:aws:quicksight:\${AWS::Region}:\${AWS::AccountId}:dataset/${workloadName}-${def.viewName}`,
      ),
    }));

    const dataSetIdentifierMap: Record<string, string> = {};
    for (const def of DATA_SET_DEFINITIONS) {
      dataSetIdentifierMap[def.viewName] = def.viewName;
    }

    const dashboard = new quicksight.CfnDashboard(this, 'AnalyticsDashboard', {
      awsAccountId: accountId,
      dashboardId: `${workloadName}-game-dashboard`,
      name: `${workloadName}-Game-Analytics`,
      permissions: [{ principal: quicksightUserArn, actions: DASHBOARD_PERMISSIONS }],
      definition: {
        dataSetIdentifierDeclarations,
        sheets: [
          buildPulseSheet(dataSetIdentifierMap) as quicksight.CfnDashboard.SheetDefinitionProperty,
          buildProgressionSheet(dataSetIdentifierMap) as quicksight.CfnDashboard.SheetDefinitionProperty,
          buildCombatSheet(dataSetIdentifierMap) as quicksight.CfnDashboard.SheetDefinitionProperty,
          buildMonetizationSheet(dataSetIdentifierMap) as quicksight.CfnDashboard.SheetDefinitionProperty,
          buildSentimentSheet(dataSetIdentifierMap) as quicksight.CfnDashboard.SheetDefinitionProperty,
        ],
        filterGroups: buildNullExclusionFilterGroups(dataSetIdentifierMap),
      },
    });

    for (const ds of dataSets) {
      dashboard.node.addDependency(ds);
    }

    new cdk.CfnOutput(this, 'QuickSightDashboardURL', {
      value: `https://${region}.quicksight.aws.amazon.com/sn/dashboards/${workloadName}-game-dashboard`,
      description: 'URL of the Game Analytics QuickSight Dashboard',
    });
  }
}
