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
      "  date(timestamp 'epoch' + event_timestamp * interval '1 second') as event_date,",
      "  date_trunc('hour', timestamp 'epoch' + event_timestamp * interval '1 second') as event_hour,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'platform'), '') as platform,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '') as country,",
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
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      "  date(timestamp 'epoch' + event_timestamp * interval '1 second') as event_date,",
      "  JSON_EXTRACT_PATH_TEXT(event_data, 'match_id') as match_id,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'map_id'), '') as map_id,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'match_type'), '') as match_type,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'match_result_type'), '') as match_result,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'spell_id'), '') as spell_used,",
      "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'exp_gained'), '') AS INTEGER) as exp_gained,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'matching_failed_msg'), '') AS matching_failed_msg,",
      '  1 as event_count',
      'FROM {db_name}."event_data"',
      "WHERE event_type IN ('match_start', 'match_end', 'user_knockout', 'matchmaking_start', 'matchmaking_complete', 'matchmaking_failed')",
    ].join('\n'),
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
      { name: 'event_count', type: 'INTEGER' },
    ],
  },
  // 3. Level progression
  {
    viewName: 'level_events',
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      "  date(timestamp 'epoch' + event_timestamp * interval '1 second') as event_date,",
      "  JSON_EXTRACT_PATH_TEXT(event_data, 'level_id') as level_id,",
      "  CAST(JSON_EXTRACT_PATH_TEXT(event_data, 'level_version') AS INTEGER) as level_version,",
      '  1 as event_count',
      'FROM {db_name}."event_data"',
      "WHERE event_type IN ('level_started', 'level_completed', 'level_failed')",
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
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      "  date(timestamp 'epoch' + event_timestamp * interval '1 second') as event_date,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'item_id'), '') as item_id,",
      "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_amount'), '') AS INTEGER) as currency_amount,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'currency_type'), '') as currency_type,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'transaction_id'), '') as transaction_id,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'item_rarity'), '') as item_rarity,",
      "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'lootbox_cost'), '') AS INTEGER) as lootbox_cost,",
      '  1 as event_count',
      'FROM {db_name}."event_data"',
      "WHERE event_type IN ('iap_transaction', 'lootbox_opened', 'item_viewed')",
    ].join('\n'),
    columns: [
      { name: 'event_id', type: 'STRING' },
      { name: 'event_type', type: 'STRING' },
      { name: 'event_date', type: 'DATETIME' },
      { name: 'item_id', type: 'STRING' },
      { name: 'currency_amount', type: 'INTEGER' },
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
    customSqlQuery: [
      'SELECT',
      '  event_id,',
      '  event_type,',
      '  app_version,',
      "  date(timestamp 'epoch' + event_timestamp * interval '1 second') as event_date,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'country_id'), '') as country,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'platform'), '') as platform,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'report_reason'), '') as report_reason,",
      "  CAST(NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'user_rating'), '') AS INTEGER) as user_rating,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'user_rank_reached'), '') as rank_reached,",
      "  NULLIF(JSON_EXTRACT_PATH_TEXT(event_data, 'tutorial_screen_id'), '') AS tutorial_screen_id,",
      '  1 as event_count',
      'FROM {db_name}."event_data"',
      "WHERE event_type IN ('user_registration', 'user_report', 'user_sentiment', 'user_rank_up', 'tutorial_progression')",
    ].join('\n'),
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
  // Build schema-qualified path based on data source mode
  const schema = isRedshift ? `"${database}"."public"` : `"${database}"`;

  let sqlQuery: string;
  if (def.customSqlQuery) {
    // Replace {db_name} placeholder with the schema-qualified path
    sqlQuery = def.customSqlQuery.replace(/\{db_name\}/g, schema);
  } else {
    sqlQuery = `SELECT * FROM ${schema}."${def.viewName}"`;
  }

  // Build logicalTableMap with calculated columns and/or geo tags if defined
  const needsLogicalTable = (def.calculatedColumns?.length ?? 0) > 0 || (def.columnGroups?.length ?? 0) > 0;
  const dataTransforms: object[] = [];

  if (def.calculatedColumns?.length) {
    dataTransforms.push({
      createColumnsOperation: {
        columns: def.calculatedColumns.map((calc) => ({
          columnName: calc.columnName,
          columnId: calc.columnId,
          expression: calc.expression,
        })),
      },
    });
  }

  // Add TagColumnOperation for geospatial columns (assigns geographic role)
  if (def.columnGroups?.length) {
    for (const group of def.columnGroups) {
      for (const col of group.geoSpatialColumnGroup.columns) {
        dataTransforms.push({
          tagColumnOperation: {
            columnName: col,
            tags: [{ columnGeographicRole: 'COUNTRY' }],
          },
        });
      }
    }
  }

  const logicalTableMap: Record<string, quicksight.CfnDataSet.LogicalTableProperty> | undefined = needsLogicalTable
    ? {
        LogicalTable0: {
          alias: def.viewName,
          source: { physicalTableId: 'PhysicalTable0' },
          dataTransforms,
        },
      }
    : undefined;

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
      visualId: 'mn-top-items-tree',
      sheetId: 'monetization-sheet',
      dataSet: dataSetIdentifiers.economy_events,
      column: 'item_id',
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
      visualId: 'st-reports-over-time-area',
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
    // report_reason only exists on user_report
    {
      visualId: 'st-report-reasons-bar',
      sheetId: 'sentiment-sheet',
      dataSet: dataSetIdentifiers.player_health,
      eventTypes: ['user_report'],
    },
    // report_reason over time also needs user_report filter
    {
      visualId: 'st-reports-over-time-area',
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

  return [...nullFilters, ...inclusionFilters];
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

    // Force unique template hash to bypass CloudFormation template caching
    this.node.addMetadata('version', '6');

    const accountId = cdk.Aws.ACCOUNT_ID;
    const region = cdk.Aws.REGION;
    const workloadName = props.config.WORKLOAD_NAME;
    const database = props.config.EVENTS_DATABASE;
    const isRedshift = props.config.DATA_STACK === 'REDSHIFT';

    // ---- Config Validation ---- //

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

    // QuickSight user ARN for permissions
    const quicksightUserArn = `arn:aws:quicksight:${region}:${accountId}:user/default/${props.config.QUICKSIGHT_USERNAME}`;

    // ---- Task 3.1: IAM Service Role ---- //

    const qsRole = new iam.Role(this, 'QuickSightServiceRole', {
      assumedBy: new iam.ServicePrincipal('quicksight.amazonaws.com'),
    });
    // Retain the role on stack deletion so QuickSight can use it to clean up
    // VPC connection ENIs. The POST /quicksight/teardown endpoint deletes this
    // role after confirming the VPC connection is fully removed.
    qsRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    this.qsRoleName = qsRole.roleName;

    if (isRedshift) {
      // Secrets Manager access — use wildcard for the managed admin password secret
      // since Namespace.AdminPasswordSecretArn is not available via GetAtt
      const namespaceSecretArnPattern = `arn:aws:secretsmanager:${region}:${accountId}:secret:redshift!*`;
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [namespaceSecretArnPattern],
        }),
      );

      // KMS decrypt scoped to the Redshift encryption key
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt'],
          resources: [props.redshiftConstruct!.key.keyArn],
        }),
      );

      // Redshift Serverless permissions
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['redshift-serverless:GetCredentials', 'redshift-serverless:GetWorkgroup'],
          resources: ['*'],
        }),
      );
    } else {
      // Athena query permissions scoped to the workgroup
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

      // Glue catalog read permissions scoped to the events database
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

      // S3 read permissions scoped to the analytics bucket
      qsRole.addToPolicy(
        new iam.PolicyStatement({
          actions: ['s3:GetObject', 's3:ListBucket', 's3:GetBucketLocation'],
          resources: [props.analyticsBucket!.bucketArn, `${props.analyticsBucket!.bucketArn}/*`],
        }),
      );
    }

    // ---- Task 3.2: VPC Connection (REDSHIFT only) ---- //
    // ---- Task 3.3: Redshift DataSource ---- //
    // ---- Task 3.4: Athena DataSource ---- //

    let dataSource: quicksight.CfnDataSource;

    if (isRedshift) {
      // QuickSight VPC connection requires EC2 network interface permissions
      // so it can create ENIs in the private subnets to reach Redshift
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

      // Create a security group for QuickSight VPC connection using L1 to avoid
      // CDK's automatic egress rule dependency chain
      const qsSecurityGroup = new ec2.CfnSecurityGroup(this, 'QuickSightSecurityGroup', {
        vpcId: props.vpcConstruct!.vpc.vpcId,
        groupDescription: 'Security group for QuickSight VPC connection to Redshift',
        securityGroupEgress: [
          {
            ipProtocol: '-1',
            cidrIp: '0.0.0.0/0',
            description: 'Allow all outbound traffic',
          },
        ],
      });

      const vpcConnection = new quicksight.CfnVPCConnection(this, 'VPCConnection', {
        awsAccountId: accountId,
        vpcConnectionId: `${workloadName}-qs-vpc-conn-v6`,
        name: `${workloadName}-QuickSight-VPC`,
        subnetIds: props.vpcConstruct!.vpc.privateSubnets.map((s) => s.subnetId),
        securityGroupIds: [qsSecurityGroup.attrGroupId],
        roleArn: qsRole.roleArn,
      });

      // Ensure the IAM role and its policies are fully created before the VPC connection
      vpcConnection.node.addDependency(qsRole);

      // Note: QuickSight VPC connections create ENIs in the private subnets.
      // On stack deletion, if the VPC connection's IAM role is deleted before
      // QuickSight finishes cleaning up ENIs, deletion of subnets/SGs will fail.
      // The IAM role naturally outlives the VPC connection because CDK reverses
      // creation order for deletion (role created before VPC connection = deleted after).
      // If stack deletion gets stuck, manually delete the VPC connection via:
      //   aws quicksight delete-vpc-connection --aws-account-id <ACCOUNT> \
      //     --vpc-connection-id <WORKLOAD>-qs-vpc-connection --region <REGION>

      // Task 3.3: Redshift DataSource
      dataSource = new quicksight.CfnDataSource(this, 'RedshiftDataSource', {
        awsAccountId: accountId,
        dataSourceId: `${workloadName}-redshift-ds`,
        name: `${workloadName}-Redshift`,
        type: 'REDSHIFT',
        dataSourceParameters: {
          redshiftParameters: {
            database: database,
            host: props.redshiftConstruct!.workgroup.attrWorkgroupEndpointAddress,
            port: props.redshiftConstruct!.workgroup.attrWorkgroupEndpointPort,
          },
        },
        credentials: {
          // Use dynamic reference to resolve the Redshift managed admin password
          // from Secrets Manager at deploy time. The secret name follows the pattern:
          // redshift!{namespaceName}-{adminUsername}
          credentialPair: {
            username: 'db-admin',
            password: cdk.Fn.join('', [
              '{{resolve:secretsmanager:redshift!',
              props.redshiftConstruct!.namespace.ref,
              '-db-admin:SecretString:password}}',
            ]),
          },
        },
        vpcConnectionProperties: {
          vpcConnectionArn: vpcConnection.attrArn,
        },
        permissions: [
          {
            principal: quicksightUserArn,
            actions: DATA_SOURCE_PERMISSIONS,
          },
        ],
      });
    } else {
      // Task 3.4: Athena DataSource — no VPC connection needed
      dataSource = new quicksight.CfnDataSource(this, 'AthenaDataSource', {
        awsAccountId: accountId,
        dataSourceId: `${workloadName}-athena-ds`,
        name: `${workloadName}-Athena`,
        type: 'ATHENA',
        dataSourceParameters: {
          athenaParameters: {
            workGroup: props.dataLakeConstruct!.gameAnalyticsWorkgroup.name,
          },
        },
        permissions: [
          {
            principal: quicksightUserArn,
            actions: DATA_SOURCE_PERMISSIONS,
          },
        ],
      });
    }

    // ---- Task 3.6 (partial): Create 11 DataSets via factory ---- //

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

    // ---- Task 3.5: Dashboard (definition-based, no template needed) ---- //

    // Build dataSetIdentifierDeclarations for the definition-based dashboard
    const dataSetIdentifierDeclarations = DATA_SET_DEFINITIONS.map((def) => ({
      identifier: def.viewName,
      dataSetArn: cdk.Fn.sub(
        `arn:aws:quicksight:\${AWS::Region}:\${AWS::AccountId}:dataset/${workloadName}-${def.viewName}`,
      ),
    }));

    // Build dataSetIdentifierMap for sheet builders
    const dataSetIdentifierMap: Record<string, string> = {};
    for (const def of DATA_SET_DEFINITIONS) {
      dataSetIdentifierMap[def.viewName] = def.viewName;
    }

    const dashboard = new quicksight.CfnDashboard(this, 'AnalyticsDashboard', {
      awsAccountId: accountId,
      dashboardId: `${workloadName}-game-dashboard`,
      name: `${workloadName}-Game-Analytics`,
      permissions: [
        {
          principal: quicksightUserArn,
          actions: DASHBOARD_PERMISSIONS,
        },
      ],
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

    // Ensure dashboard deploys after all DataSets are created
    for (const ds of dataSets) {
      dashboard.node.addDependency(ds);
    }

    // ---- Task 3.6: Wire together and expose properties ---- //

    // Emit dashboard URL as CfnOutput
    new cdk.CfnOutput(this, 'QuickSightDashboardURL', {
      value: `https://${region}.quicksight.aws.amazon.com/sn/dashboards/${workloadName}-game-dashboard`,
      description: 'URL of the Game Analytics QuickSight Dashboard',
    });

    // Expose public readonly properties
    this.dataSource = dataSource;
  }
}
