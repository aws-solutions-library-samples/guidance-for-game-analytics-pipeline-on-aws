import * as cdk from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Template } from 'aws-cdk-lib/assertions';
import { QuickSightConstruct, DATA_SET_DEFINITIONS } from '../constructs/quicksight-construct';
import { GameAnalyticsPipelineConfig } from '../helpers/config-types';
import { VpcConstruct } from '../constructs/vpc-construct';
import { RedshiftConstruct } from '../constructs/redshift-construct';
import { DataLakeConstruct } from '../constructs/data-lake-construct';

/**
 * Template integration tests for QuickSight visual field well references.
 *
 * These tests synthesize the full CDK stack and verify that every visual
 * field well in the QuickSight Dashboard references a valid DataSet placeholder
 * and an existing column in that DataSet's schema.
 *
 * **Validates: Requirements 9.1, 9.2**
 */

// ---- Shared test config ---- //

function baseConfig(overrides: Partial<GameAnalyticsPipelineConfig> = {}): GameAnalyticsPipelineConfig {
  return {
    REGION: 'us-east-1',
    WORKLOAD_NAME: 'TestWorkload',
    DEV_MODE: true,
    INGEST_MODE: 'KINESIS_DATA_STREAMS',
    DATA_STACK: 'REDSHIFT',
    REAL_TIME_ANALYTICS: false,
    ENABLE_APACHE_ICEBERG_SUPPORT: false,
    EVENTS_DATABASE: 'game_events',
    RAW_EVENTS_TABLE: 'raw_events',
    RAW_EVENTS_PREFIX: 'raw-events/',
    PROCESSED_EVENTS_PREFIX: 'processed-events/',
    STREAM_PROVISIONED: false,
    STREAM_SHARD_COUNT: 1,
    CLOUDWATCH_RETENTION_DAYS: 7,
    API_STAGE_NAME: 'prod',
    EMAIL_ADDRESS: '',
    GLUE_TMP_PREFIX: 'glue-tmp/',
    S3_BACKUP_MODE: false,
    ENABLE_QUICKSIGHT_DASHBOARD: true,
    QUICKSIGHT_USERNAME: 'admin/quicksight-admin',
    ...overrides,
  };
}

// ---- Stack builders ---- //

interface FullStackResult {
  stack: cdk.Stack;
  qsConstruct: QuickSightConstruct;
}

function buildRedshiftFullStack(configOverrides: Partial<GameAnalyticsPipelineConfig> = {}): FullStackResult {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const config = baseConfig({ DATA_STACK: 'REDSHIFT', ...configOverrides });

  const vpcConstruct = new VpcConstruct(stack, 'VpcConstruct', { config });
  const gamesEventsStream = new kinesis.Stream(stack, 'GameEventStream', {
    streamMode: kinesis.StreamMode.ON_DEMAND,
  });
  const redshiftConstruct = new RedshiftConstruct(stack, 'RedshiftConstruct', {
    gamesEventsStream,
    config,
    vpcConstruct,
  });

  const qsConstruct = new QuickSightConstruct(stack, 'QuickSightConstruct', {
    config,
    redshiftConstruct,
    vpcConstruct,
  });

  return { stack, qsConstruct };
}

function buildDataLakeFullStack(configOverrides: Partial<GameAnalyticsPipelineConfig> = {}): FullStackResult {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  const config = baseConfig({ DATA_STACK: 'DATA_LAKE', ...configOverrides });

  const analyticsBucket = new s3.Bucket(stack, 'AnalyticsBucket');
  const notificationsTopic = new sns.Topic(stack, 'Notifications');
  const dataLakeConstruct = new DataLakeConstruct(stack, 'DataLakeConstruct', {
    analyticsBucket,
    config,
    notificationsTopic,
  });

  const qsConstruct = new QuickSightConstruct(stack, 'QuickSightConstruct', {
    config,
    dataLakeConstruct,
    analyticsBucket,
  });

  return { stack, qsConstruct };
}

/**
 * Gets the synthesized CloudFormation template from the stack containing
 * the QuickSight Dashboard resource.
 */
function getDashboardTemplate(stack: cdk.Stack): Template {
  return Template.fromStack(stack);
}

// ---- Field well extraction helpers ---- //

interface FieldWellRef {
  dataSetIdentifier: string;
  columnName: string;
  visualId: string;
  sheetId: string;
}

/**
 * Recursively walks an object tree looking for `column` objects that contain
 * both `dataSetIdentifier` and `columnName` keys (the CloudFormation field well
 * reference pattern used by QuickSight visuals).
 */
function extractFieldWellRefs(obj: any, visualId: string, sheetId: string): FieldWellRef[] {
  const refs: FieldWellRef[] = [];

  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return refs;
  }

  // Check if this object is a column reference (has both dataSetIdentifier and columnName)
  if (typeof obj.DataSetIdentifier === 'string' && typeof obj.ColumnName === 'string') {
    refs.push({
      dataSetIdentifier: obj.DataSetIdentifier,
      columnName: obj.ColumnName,
      visualId,
      sheetId,
    });
  }

  // Recurse into all values
  for (const value of Object.values(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        refs.push(...extractFieldWellRefs(item, visualId, sheetId));
      }
    } else if (typeof value === 'object' && value !== null) {
      refs.push(...extractFieldWellRefs(value, visualId, sheetId));
    }
  }

  return refs;
}

/**
 * Extracts the visual ID from a visual definition object.
 * QuickSight visuals are wrapped in a type key (e.g., KpiVisual, LineChartVisual).
 */
function getVisualId(visual: any): string {
  const typeKeys = Object.keys(visual);
  for (const key of typeKeys) {
    if (visual[key]?.VisualId) {
      return visual[key].VisualId as string;
    }
  }
  return 'unknown';
}

/**
 * Extracts all field well references from a synthesized QuickSight Dashboard resource.
 */
function extractAllFieldWellRefs(dashboardResource: any): FieldWellRef[] {
  const allRefs: FieldWellRef[] = [];
  const definition = dashboardResource.Properties.Definition;
  const sheets: any[] = definition.Sheets || [];

  for (const sheet of sheets) {
    const sheetId = sheet.SheetId || 'unknown-sheet';
    const visuals: any[] = sheet.Visuals || [];

    for (const visual of visuals) {
      const visualId = getVisualId(visual);
      allRefs.push(...extractFieldWellRefs(visual, visualId, sheetId));
    }
  }

  return allRefs;
}

// ---- Tests ---- //

describe('QuickSight Template Integration — Visual Field Well References', () => {
  /**
   * Every visual field well references a valid DataSet and existing column.
   *
   * Synthesize the full stack and verify every `dataSetIdentifier` in visual field wells
   * matches a `dataSetIdentifier` in `dataSetIdentifierDeclarations`, and every `columnName`
   * exists in the corresponding DataSet definition columns.
   *
   * **Validates: Requirements 9.1, 9.2**
   */

  describe('REDSHIFT mode', () => {
    let dashboardResource: any;
    let dataSetIdentifierDeclarations: any[];
    let allFieldWellRefs: FieldWellRef[];

    beforeAll(() => {
      const { stack } = buildRedshiftFullStack();
      const template = getDashboardTemplate(stack);
      const dashboards = template.findResources('AWS::QuickSight::Dashboard');
      const dashboardEntries = Object.values(dashboards);
      expect(dashboardEntries).toHaveLength(1);
      dashboardResource = dashboardEntries[0];
      dataSetIdentifierDeclarations = dashboardResource.Properties.Definition.DataSetIdentifierDeclarations;
      allFieldWellRefs = extractAllFieldWellRefs(dashboardResource);
    });

    test('dashboard has dataSetIdentifierDeclarations with one entry per DATA_SET_DEFINITIONS', () => {
      expect(dataSetIdentifierDeclarations).toHaveLength(DATA_SET_DEFINITIONS.length);
    });

    test('field well references are non-empty (visuals actually have field wells)', () => {
      // We expect at least 20 visuals across 5 sheets, each with at least 1 field well ref
      expect(allFieldWellRefs.length).toBeGreaterThanOrEqual(20);
    });

    test('every dataSetIdentifier in field wells matches an Identifier in dataSetIdentifierDeclarations', () => {
      const validIdentifiers = new Set(dataSetIdentifierDeclarations.map((d: any) => d.Identifier as string));

      for (const ref of allFieldWellRefs) {
        expect(validIdentifiers).toContain(ref.dataSetIdentifier);
      }
    });

    test('every columnName in field wells exists in the corresponding DATA_SET_DEFINITIONS columns', () => {
      // Build a map: viewName -> Set of column names from DATA_SET_DEFINITIONS
      const viewToColumns = new Map<string, Set<string>>();
      for (const def of DATA_SET_DEFINITIONS) {
        viewToColumns.set(def.viewName, new Set(def.columns.map((col) => col.name)));
      }

      // Calculated fields are defined at the dashboard/visual level, not in physical DataSet columns
      const calculatedFields = new Set(['completion_rate_pct', 'win_pct_value', 'target_rating']);

      for (const ref of allFieldWellRefs) {
        if (calculatedFields.has(ref.columnName)) continue;
        const validColumns = viewToColumns.get(ref.dataSetIdentifier);
        expect(validColumns).toBeDefined();
        expect(validColumns!).toContain(ref.columnName);
      }
    });
  });

  describe('DATA_LAKE mode', () => {
    let dashboardResource: any;
    let dataSetIdentifierDeclarations: any[];
    let allFieldWellRefs: FieldWellRef[];

    beforeAll(() => {
      const { stack } = buildDataLakeFullStack();
      const template = getDashboardTemplate(stack);
      const dashboards = template.findResources('AWS::QuickSight::Dashboard');
      const dashboardEntries = Object.values(dashboards);
      expect(dashboardEntries).toHaveLength(1);
      dashboardResource = dashboardEntries[0];
      dataSetIdentifierDeclarations = dashboardResource.Properties.Definition.DataSetIdentifierDeclarations;
      allFieldWellRefs = extractAllFieldWellRefs(dashboardResource);
    });

    test('dashboard has dataSetIdentifierDeclarations with one entry per DATA_SET_DEFINITIONS', () => {
      expect(dataSetIdentifierDeclarations).toHaveLength(DATA_SET_DEFINITIONS.length);
    });

    test('field well references are non-empty (visuals actually have field wells)', () => {
      expect(allFieldWellRefs.length).toBeGreaterThanOrEqual(20);
    });

    test('every dataSetIdentifier in field wells matches an Identifier in dataSetIdentifierDeclarations', () => {
      const validIdentifiers = new Set(dataSetIdentifierDeclarations.map((d: any) => d.Identifier as string));

      for (const ref of allFieldWellRefs) {
        expect(validIdentifiers).toContain(ref.dataSetIdentifier);
      }
    });

    test('every columnName in field wells exists in the corresponding DATA_SET_DEFINITIONS columns', () => {
      const viewToColumns = new Map<string, Set<string>>();
      for (const def of DATA_SET_DEFINITIONS) {
        viewToColumns.set(def.viewName, new Set(def.columns.map((col) => col.name)));
      }

      // Calculated fields are defined at the dashboard/visual level, not in physical DataSet columns
      const calculatedFields = new Set(['completion_rate_pct', 'win_pct_value', 'target_rating']);

      for (const ref of allFieldWellRefs) {
        if (calculatedFields.has(ref.columnName)) continue;
        const validColumns = viewToColumns.get(ref.dataSetIdentifier);
        expect(validColumns).toBeDefined();
        expect(validColumns!).toContain(ref.columnName);
      }
    });
  });

  describe('cross-validation with DATA_SET_DEFINITIONS source of truth', () => {
    let allFieldWellRefs: FieldWellRef[];
    let dashboardResource: any;

    beforeAll(() => {
      const { stack } = buildRedshiftFullStack();
      const template = getDashboardTemplate(stack);
      const dashboards = template.findResources('AWS::QuickSight::Dashboard');
      const dashboardEntries = Object.values(dashboards);
      dashboardResource = dashboardEntries[0];
      allFieldWellRefs = extractAllFieldWellRefs(dashboardEntries[0]);
    });

    test('every dataSetIdentifier matches a viewName in DATA_SET_DEFINITIONS', () => {
      const validViewNames = new Set(DATA_SET_DEFINITIONS.map((def) => def.viewName));

      for (const ref of allFieldWellRefs) {
        expect(validViewNames).toContain(ref.dataSetIdentifier);
      }
    });

    test('every columnName exists in the corresponding DATA_SET_DEFINITIONS columns array', () => {
      // Build a map: viewName -> Set of column names from DATA_SET_DEFINITIONS
      const viewToColumns = new Map<string, Set<string>>();
      for (const def of DATA_SET_DEFINITIONS) {
        viewToColumns.set(def.viewName, new Set(def.columns.map((col) => col.name)));
      }

      // Calculated fields are defined at the dashboard/visual level, not in physical DataSet columns
      const calculatedFields = new Set(['completion_rate_pct', 'win_pct_value', 'target_rating']);

      for (const ref of allFieldWellRefs) {
        if (calculatedFields.has(ref.columnName)) continue;
        const validColumns = viewToColumns.get(ref.dataSetIdentifier);
        expect(validColumns).toBeDefined();
        expect(validColumns!).toContain(ref.columnName);
      }
    });

    test('dataSetIdentifierDeclarations Identifiers match DATA_SET_DEFINITIONS viewNames exactly', () => {
      const definition = dashboardResource.Properties.Definition;
      const declaredIdentifiers = new Set(
        (definition.DataSetIdentifierDeclarations as any[]).map((d: any) => d.Identifier as string),
      );
      const defViewNames = new Set(DATA_SET_DEFINITIONS.map((def) => def.viewName));

      expect(declaredIdentifiers).toEqual(defViewNames);
    });
  });
});

/**
 * Template Structure tests — verify the synthesized template contains the
 * correct sheets, visual counts, and that resources live in the main stack.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
describe('QuickSight Template Integration — Dashboard Structure', () => {
  let template: Template;
  let dashboardResource: any;
  let sheets: any[];

  beforeAll(() => {
    const { stack } = buildRedshiftFullStack();
    template = getDashboardTemplate(stack);

    const dashboards = template.findResources('AWS::QuickSight::Dashboard');
    const dashboardEntries = Object.values(dashboards);
    expect(dashboardEntries).toHaveLength(1);
    dashboardResource = dashboardEntries[0];
    sheets = dashboardResource.Properties.Definition.Sheets;
  });

  test('dashboard contains exactly 5 sheets', () => {
    expect(sheets).toHaveLength(5);
  });

  test('sheet IDs are pulse-sheet, progression-sheet, combat-sheet, monetization-sheet, sentiment-sheet', () => {
    const sheetIds = sheets.map((s: any) => s.SheetId);
    expect(sheetIds).toContain('pulse-sheet');
    expect(sheetIds).toContain('progression-sheet');
    expect(sheetIds).toContain('combat-sheet');
    expect(sheetIds).toContain('monetization-sheet');
    expect(sheetIds).toContain('sentiment-sheet');
  });

  test('sheets appear in correct order: Pulse, Progression, Combat, Monetization, Sentiment', () => {
    const sheetIds = sheets.map((s: any) => s.SheetId);
    expect(sheetIds).toEqual([
      'pulse-sheet',
      'progression-sheet',
      'combat-sheet',
      'monetization-sheet',
      'sentiment-sheet',
    ]);
  });

  test('Dashboard resource exists in the stack', () => {
    template.resourceCountIs('AWS::QuickSight::Dashboard', 1);
  });

  test('exactly 6 DataSets exist', () => {
    template.resourceCountIs('AWS::QuickSight::DataSet', 6);
  });
});
