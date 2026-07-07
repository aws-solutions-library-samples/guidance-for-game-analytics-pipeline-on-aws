import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as quicksight from 'aws-cdk-lib/aws-quicksight';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { GameAnalyticsPipelineConfig } from '../helpers/config-types';
import { DataSetDefinition } from '../helpers/quicksight-types';
export type { ColumnDefinition, DataSetDefinition } from '../helpers/quicksight-types';
import { loadDataSetDefinitions } from '../helpers/quicksight-definition-loader';
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

export const VPC_CONNECTION_VERSION = 7;

// ---- Data Models ---- //
// Types live in quicksight-types and are re-exported above to avoid a construct<->loader import cycle.

/**
 * Static DataSet definitions loaded from `resources/quicksight/data-set-definitions.json`.
 * Only the static shape (viewName/columns/customSqlQuery/calculatedColumns/columnGroups)
 * lives in JSON; dynamic wiring (ARNs, workloadName, dataSetIdentifierDeclarations)
 * stays in this construct.
 */
export const DATA_SET_DEFINITIONS: DataSetDefinition[] = loadDataSetDefinitions();

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
 * @param quicksightPrincipalArns - ARNs of the QuickSight users for permissions
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
  quicksightPrincipalArns: string | string[],
): quicksight.CfnDataSet {
  const schema = isRedshift ? `"${database}"."public"` : `"${database}"`;
  const principals = Array.isArray(quicksightPrincipalArns) ? quicksightPrincipalArns : [quicksightPrincipalArns];

  const resolveSqlTokens = (sql: string): string => {
    const coreColumns: Record<string, string> = {
      application_id: 'events.payload.application_id::VARCHAR',
      event_id: 'events.payload.event.event_id::VARCHAR',
      event_type: 'events.payload.event.event_type::VARCHAR',
      event_name: 'events.payload.event.event_name::VARCHAR',
      event_timestamp: 'events.payload.event.event_timestamp::BIGINT',
      app_version: 'events.payload.event.app_version::VARCHAR',
    };
    const coreColumn = (key: string) => (isRedshift ? coreColumns[key] : key);

    return sql
      .replace(/\{db_name\}/g, schema)
      .replace(/\{col:([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) => coreColumn(key))
      .replace(/\{time_window:(\d+)\}/g, (_, n) =>
        isRedshift ? `dateadd(day, -${n}, getdate())` : `current_timestamp - interval '${n}' day`,
      )
      .replace(/\{epoch_to_ts:([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, col) =>
        isRedshift ? `timestamp 'epoch' + ${coreColumn(col)} * interval '1 second'` : `from_unixtime(${col})`,
      )
      .replace(/\{json:([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) =>
        isRedshift ? `events.payload.event.event_data.${key}::VARCHAR` : `json_extract_scalar(event_data, '$.${key}')`,
      )
      .replace(/\{initcap:([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) =>
        isRedshift
          ? `INITCAP(LOWER(NULLIF(events.payload.event.event_data.${key}::VARCHAR, '')))`
          : `regexp_replace(LOWER(NULLIF(json_extract_scalar(event_data, '$.${key}'), '')), '(\\w)(\\w*)', x -> upper(x[1]) || x[2])`,
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
    permissions: principals.map((principal) => ({ principal, actions: DATA_SET_PERMISSIONS })),
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

    const quicksightPrincipalArns = this.buildQuickSightPrincipalArns(props.config, region, accountId);

    const qsRole = this.createIamRole(props, isRedshift, accountId, region, workloadName, database);
    this.qsRoleName = qsRole.roleName;

    const dataSource = this.createDataSource(
      props,
      isRedshift,
      accountId,
      workloadName,
      database,
      quicksightPrincipalArns,
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
        quicksightPrincipalArns,
      ),
    );

    this.createDashboard(accountId, region, workloadName, quicksightPrincipalArns, dataSets);
  }

  private buildQuickSightPrincipalArns(
    config: GameAnalyticsPipelineConfig,
    region: string,
    accountId: string,
  ): string[] {
    const usernames = [config.QUICKSIGHT_USERNAME, ...(config.QUICKSIGHT_ALLOWED_USERS ?? [])]
      .map((username) => username.trim())
      .filter((username) => username.length > 0);

    return [...new Set(usernames)].map(
      (username) => `arn:aws:quicksight:${region}:${accountId}:user/default/${username}`,
    );
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
          actions: [
            's3:GetObject',
            's3:ListBucket',
            's3:GetBucketLocation',
            's3:PutObject',
            's3:DeleteObject',
            's3:AbortMultipartUpload',
            's3:ListBucketMultipartUploads',
            's3:ListMultipartUploadParts',
          ],
          resources: [props.analyticsBucket!.bucketArn, `${props.analyticsBucket!.bucketArn}/*`],
        }),
      );

      new iam.CfnPolicy(this, 'QuickSightManagedServiceRoleAthenaAccessPolicy', {
        policyName: `${workloadName}-QuickSightAthenaAccess`,
        roles: ['aws-quicksight-service-role-v0'],
        policyDocument: new iam.PolicyDocument({
          statements: [
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
            new iam.PolicyStatement({
              actions: ['glue:GetTable', 'glue:GetTables', 'glue:GetDatabase'],
              resources: [
                `arn:aws:glue:*:*:catalog`,
                `arn:aws:glue:*:*:database/${database}`,
                `arn:aws:glue:*:*:table/${database}/*`,
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:ListBucket',
                's3:GetBucketLocation',
                's3:PutObject',
                's3:DeleteObject',
                's3:AbortMultipartUpload',
                's3:ListBucketMultipartUploads',
                's3:ListMultipartUploadParts',
              ],
              resources: [props.analyticsBucket!.bucketArn, `${props.analyticsBucket!.bucketArn}/*`],
            }),
          ],
        }),
      });
    }

    return qsRole;
  }

  private createDataSource(
    props: QuickSightConstructProps,
    isRedshift: boolean,
    accountId: string,
    workloadName: string,
    database: string,
    quicksightPrincipalArns: string[],
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
        permissions: quicksightPrincipalArns.map((principal) => ({ principal, actions: DATA_SOURCE_PERMISSIONS })),
      });
      // Bug #9: workgroup hits CREATE_COMPLETE before its endpoint accepts connections;
      // depend on snapshot (which requires an ACTIVE workgroup) so QuickSight validation succeeds.
      dataSource.node.addDependency(props.redshiftConstruct!.snapshot);
      return dataSource;
    } else {
      const dataSource = new quicksight.CfnDataSource(this, 'AthenaDataSource', {
        awsAccountId: accountId,
        dataSourceId: `${workloadName}-athena-ds`,
        name: `${workloadName}-Athena`,
        type: 'ATHENA',
        dataSourceParameters: { athenaParameters: { workGroup: props.dataLakeConstruct!.gameAnalyticsWorkgroup.name } },
        permissions: quicksightPrincipalArns.map((principal) => ({ principal, actions: DATA_SOURCE_PERMISSIONS })),
      });
      dataSource.node.addDependency(props.dataLakeConstruct!.gameAnalyticsWorkgroup);
      return dataSource;
    }
  }

  private createDashboard(
    accountId: string,
    region: string,
    workloadName: string,
    quicksightPrincipalArns: string[],
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
      permissions: quicksightPrincipalArns.map((principal) => ({ principal, actions: DASHBOARD_PERMISSIONS })),
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
