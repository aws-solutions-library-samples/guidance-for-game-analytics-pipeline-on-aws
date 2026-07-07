/**
 * Characterization + invariant baseline for the QuickSight dashboard definition.
 *
 * WHY THIS FILE EXISTS (the contract):
 *   The dashboard definition is INLINE on the single `AWS::QuickSight::Dashboard`
 *   resource (see quicksight-construct.ts:1240-1256 `createDashboard`) — there is
 *   NO `AWS::QuickSight::Template` resource. Upcoming extraction todos (7-9) will
 *   externalize the STATIC parts of that inline definition (dataset definitions,
 *   sheets, filter groups) into resources/quicksight/*.json.
 *
 *   This snapshot is THE CONTRACT for those extractions: after they move static
 *   parts to JSON, the canonical (recursively key-sorted) snapshot of the synthesized
 *   Dashboard `Properties.Definition` and the 6 DataSet `Properties` MUST remain
 *   byte-identical. Any diff = an extraction defect.
 *
 * Verified facts (against code + the 63 passing tests at cae7eb2):
 *   - AWS::QuickSight::Dashboard = 1  (inline definition)
 *   - AWS::QuickSight::DataSet   = 6  (5 DATA_SET_DEFINITIONS + 1 base dataset)
 *   - AWS::QuickSight::Template  = 0  (does not exist)
 *   - 5 sheets: Pulse / Progression / Combat / Monetization / Sentiment
 *
 * Canonical comparison ONLY — never byte-compare raw synth output files.
 */

import * as cdk from 'aws-cdk-lib';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import { Template } from 'aws-cdk-lib/assertions';
import { GameAnalyticsPipelineConfig } from '../helpers/config-types';
import { QuickSightConstruct, DATA_SET_DEFINITIONS } from '../constructs/quicksight-construct';
import { VpcConstruct } from '../constructs/vpc-construct';
import { RedshiftConstruct } from '../constructs/redshift-construct';

// ─────────────────────────────────────────────────────────────────────────────
// Shared config fixture (mirrors quicksight-construct.test.ts exactly — no
// dependency on infrastructure/config.yaml; config is injected in-memory).
// ─────────────────────────────────────────────────────────────────────────────

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

/** Build a REDSHIFT-mode stack with the QuickSight construct enabled. */
function buildRedshiftStack(configOverrides: Partial<GameAnalyticsPipelineConfig> = {}): cdk.Stack {
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
  new QuickSightConstruct(stack, 'QuickSightConstruct', {
    config,
    redshiftConstruct,
    vpcConstruct,
  });

  return stack;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical serializer — recursively sorts object keys so that property ORDER
// never causes false snapshot drift. Arrays keep their order (order is
// semantically meaningful for sheets/visuals/columns).
// ─────────────────────────────────────────────────────────────────────────────

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recursive walkers to collect ids and dataSetIdentifier references from the
// synthesized (canonical) definition, independent of exact nesting.
// ─────────────────────────────────────────────────────────────────────────────

function collectStringField(node: unknown, field: string): string[] {
  const acc: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (n !== null && typeof n === 'object') {
      const obj = n as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (k === field && typeof v === 'string') {
          acc.push(v);
        }
        walk(v);
      }
    }
  };
  walk(node);
  return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline snapshot + invariants (single REDSHIFT synthesis reused).
// ─────────────────────────────────────────────────────────────────────────────

describe('QuickSight Definition Baseline — canonical snapshot (extraction contract)', () => {
  let template: Template;
  let dashboardProps: Record<string, any>;
  let definition: Record<string, any>;
  let dataSetProps: Array<Record<string, any>>;

  beforeAll(() => {
    const stack = buildRedshiftStack();
    template = Template.fromStack(stack);

    const dashboards = template.findResources('AWS::QuickSight::Dashboard');
    const dashboardEntries = Object.values(dashboards);
    dashboardProps = (dashboardEntries[0] as any).Properties;
    definition = dashboardProps.Definition;

    const dataSets = template.findResources('AWS::QuickSight::DataSet');
    // Sort DataSet resources by DataSetId so the snapshot is deterministic
    // regardless of CFN logical-id ordering.
    dataSetProps = Object.values(dataSets)
      .map((r) => (r as any).Properties)
      .sort((a, b) => String(a.DataSetId).localeCompare(String(b.DataSetId)));
  });

  test('full Dashboard Properties.Definition matches canonical snapshot', () => {
    expect(canonicalJson(definition)).toMatchSnapshot('dashboard-definition');
  });

  test('all 6 DataSet Properties match canonical snapshot', () => {
    expect(canonicalJson(dataSetProps)).toMatchSnapshot('dataset-properties');
  });

  // ── Resource-count invariants (independent of the snapshot) ──────────────────

  test('invariant: exactly 1 AWS::QuickSight::Dashboard', () => {
    template.resourceCountIs('AWS::QuickSight::Dashboard', 1);
  });

  test('invariant: exactly 6 AWS::QuickSight::DataSet', () => {
    template.resourceCountIs('AWS::QuickSight::DataSet', 6);
  });

  test('invariant: exactly 0 AWS::QuickSight::Template (definition is inline)', () => {
    template.resourceCountIs('AWS::QuickSight::Template', 0);
  });

  // ── Structural / referential-integrity invariants ───────────────────────────

  const EXPECTED_DATA_SET_DEFINITION_COUNT = 6;

  test('invariant: all DATA_SET_DEFINITIONS viewNames appear in dataSetIdentifierDeclarations', () => {
    expect(DATA_SET_DEFINITIONS).toHaveLength(EXPECTED_DATA_SET_DEFINITION_COUNT);
    const declarations = definition.DataSetIdentifierDeclarations as Array<Record<string, unknown>>;
    expect(declarations).toHaveLength(6);
    const declaredIdentifiers = new Set(declarations.map((d) => d.Identifier as string));
    for (const def of DATA_SET_DEFINITIONS) {
      expect(declaredIdentifiers.has(def.viewName)).toBe(true);
    }
  });

  test('invariant: exactly 5 sheets present (Pulse, Progression, Combat, Monetization, Sentiment)', () => {
    const sheets = definition.Sheets as Array<Record<string, unknown>>;
    expect(sheets).toHaveLength(5);

    // Match each expected sheet by a case-insensitive keyword in its Name/Title.
    const sheetLabels = sheets.map((s) => {
      const name = (s.Name as string) ?? '';
      const title = (s.Title as string) ?? '';
      return `${name} ${title}`.toLowerCase();
    });
    const expectedKeywords = ['pulse', 'progression', 'combat', 'monetization', 'sentiment'];
    for (const keyword of expectedKeywords) {
      const matches = sheetLabels.filter((label) => label.includes(keyword));
      expect(matches).toHaveLength(1);
    }
  });

  test('invariant: every dataSetIdentifier referenced in sheets exists in the declarations', () => {
    const declarations = definition.DataSetIdentifierDeclarations as Array<Record<string, unknown>>;
    const declaredIdentifiers = new Set(declarations.map((d) => d.Identifier as string));

    const referenced = new Set(collectStringField(definition.Sheets, 'DataSetIdentifier'));
    expect(referenced.size).toBeGreaterThan(0);
    for (const ref of referenced) {
      expect(declaredIdentifiers.has(ref)).toBe(true);
    }
  });

  test('invariant: all sheet ids are unique', () => {
    const sheets = definition.Sheets as Array<Record<string, unknown>>;
    const sheetIds = sheets.map((s) => s.SheetId as string);
    expect(sheetIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(sheetIds).size).toBe(sheetIds.length);
  });

  test('invariant: all visual ids are unique across the whole definition', () => {
    const visualIds = collectStringField(definition.Sheets, 'VisualId');
    expect(visualIds.length).toBeGreaterThan(0);
    expect(new Set(visualIds).size).toBe(visualIds.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dynamism proof — the workload-name-derived values MUST change with the
// fixture workload name. This guards the extraction: static JSON must NOT
// capture workloadName-dependent values (dashboardId, dataset ids, ARNs).
// ─────────────────────────────────────────────────────────────────────────────

describe('QuickSight Definition Baseline — dynamism proof (workload-name derivation)', () => {
  function synthDynamicValues(workloadName: string): {
    dashboardId: string;
    dataSetIds: string[];
    declarationArns: string;
  } {
    const stack = buildRedshiftStack({ WORKLOAD_NAME: workloadName });
    const template = Template.fromStack(stack);

    const dashboards = template.findResources('AWS::QuickSight::Dashboard');
    const dashboardProps = (Object.values(dashboards)[0] as any).Properties;
    const dashboardId = dashboardProps.DashboardId as string;

    const dataSets = template.findResources('AWS::QuickSight::DataSet');
    const dataSetIds = Object.values(dataSets)
      .map((r) => (r as any).Properties.DataSetId as string)
      .sort();

    // The dataSetArn declarations interpolate the workload name via cdk.Fn.sub;
    // capture their canonical JSON to prove the ARNs differ per workload.
    const declarationArns = canonicalJson(dashboardProps.Definition.DataSetIdentifierDeclarations);

    return { dashboardId, dataSetIds, declarationArns };
  }

  test('dashboardId, DataSetIds, and declaration ARNs DIFFER for workload A vs B', () => {
    const a = synthDynamicValues('WorkloadAlpha');
    const b = synthDynamicValues('WorkloadBravo');

    // dashboardId = `${workloadName}-game-dashboard`
    expect(a.dashboardId).toBe('WorkloadAlpha-game-dashboard');
    expect(b.dashboardId).toBe('WorkloadBravo-game-dashboard');
    expect(a.dashboardId).not.toBe(b.dashboardId);

    // Every DataSetId = `${workloadName}-${viewName}` — all must differ.
    expect(a.dataSetIds).not.toEqual(b.dataSetIds);
    for (const id of a.dataSetIds) {
      expect(id.startsWith('WorkloadAlpha-')).toBe(true);
    }
    for (const id of b.dataSetIds) {
      expect(id.startsWith('WorkloadBravo-')).toBe(true);
    }

    // The dataSetIdentifierDeclarations ARNs embed the workload name → must differ.
    expect(a.declarationArns).not.toBe(b.declarationArns);
    expect(a.declarationArns).toContain('WorkloadAlpha-');
    expect(b.declarationArns).toContain('WorkloadBravo-');
  });
});
