import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Template } from 'aws-cdk-lib/assertions';
import * as fc from 'fast-check';
import { createDataSetFromView, QuickSightConstruct } from '../constructs/quicksight-construct';
import type { DataSetDefinition, ColumnDefinition } from '../constructs/quicksight-construct';
import * as qsModule from '../constructs/quicksight-construct';
import type { GameAnalyticsPipelineConfig } from '../helpers/config-types';
import { VpcConstruct } from '../constructs/vpc-construct';
import { RedshiftConstruct } from '../constructs/redshift-construct';
import { DataLakeConstruct } from '../constructs/data-lake-construct';

/**
 * DIRECT_QUERY-related property tests for the QuickSight construct.
 *
 * These tests use fast-check to verify universal properties about
 * DIRECT_QUERY mode DataSet creation across arbitrary valid inputs.
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

// ---- Helpers to build full stacks with QuickSightConstruct ---- //

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

// ---- Arbitraries ---- //

/** Generates a valid column type */
const arbColumnType = fc.constantFrom('STRING' as const, 'INTEGER' as const, 'DECIMAL' as const, 'DATETIME' as const);

/** Generates a valid column definition */
const arbColumnDefinition: fc.Arbitrary<ColumnDefinition> = fc.record({
  name: fc.stringMatching(/^[a-z][a-z0-9_]{1,20}$/),
  type: arbColumnType,
});

/** Generates a valid KPI category */
const arbKpiCategory = fc.constantFrom('acquisition' as const, 'engagement' as const, 'monetization' as const);

/** Generates a valid DataSetDefinition with non-empty viewName and at least one column */
const arbDataSetDefinition: fc.Arbitrary<DataSetDefinition> = fc.record({
  viewName: fc.stringMatching(/^[a-z][a-z0-9_]{2,30}$/),
  columns: fc.array(arbColumnDefinition, { minLength: 1, maxLength: 8 }),
  kpiCategory: arbKpiCategory,
});

/** Generates a non-empty alphanumeric string suitable for AWS resource names */
const arbResourceName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,15}$/);

/** Generates a valid boolean for isRedshift */
const arbIsRedshift = fc.boolean();

/** Generates a valid DATA_STACK mode */
const arbDataStack = fc.constantFrom('REDSHIFT' as const, 'DATA_LAKE' as const);

/** Generates a valid QuickSight username */
const arbQuickSightUsername = fc
  .tuple(fc.stringMatching(/^[a-z]{3,8}$/), fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/))
  .map(([ns, user]) => `${ns}/${user}`);

// ---- Property Tests ---- //

describe('QuickSight DIRECT_QUERY Property Tests', () => {
  /**
   * Property 1: All DataSets use DIRECT_QUERY import mode
   *
   * For any valid DataSetDefinition, calling createDataSetFromView always
   * produces a CfnDataSet with importMode set to "DIRECT_QUERY".
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  test('Property 1: createDataSetFromView always produces a DataSet with importMode DIRECT_QUERY', () => {
    fc.assert(
      fc.property(
        arbDataSetDefinition,
        arbResourceName,
        arbResourceName,
        arbIsRedshift,
        arbResourceName,
        (def, workloadName, accountId, isRedshift, database) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, 'SpicePropTestStack');

          // Use a fixed dataSourceArn and quicksightUserArn — they don't affect importMode
          const dataSourceArn = 'arn:aws:quicksight:us-east-1:123456789012:datasource/test-ds';
          const quicksightUserArn = 'arn:aws:quicksight:us-east-1:123456789012:user/default/admin';

          createDataSetFromView(
            stack,
            def,
            dataSourceArn,
            accountId,
            workloadName,
            isRedshift,
            database,
            quicksightUserArn,
          );

          const template = Template.fromStack(stack);

          // Find all DataSet resources in the synthesized template
          const dataSets = template.findResources('AWS::QuickSight::DataSet');
          const dataSetEntries = Object.values(dataSets);

          // Exactly one DataSet should be created
          expect(dataSetEntries).toHaveLength(1);

          const props = (dataSetEntries[0] as any).Properties;

          // The DataSet SHALL use DIRECT_QUERY import mode
          expect(props.ImportMode).toBe('DIRECT_QUERY');
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property 2: Zero refresh schedule resources exist for any valid config
   *
   * For any valid config (REDSHIFT or DATA_LAKE mode), synthesizing the full
   * QuickSightConstruct produces zero AWS::QuickSight::RefreshSchedule resources
   * in the stack. Since all DataSets use DIRECT_QUERY mode, no refresh schedules are needed.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3**
   */
  test('Property 2: Zero refresh schedule resources exist for any valid config', () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          // Build the full construct with all dependencies
          const { stack } =
            dataStack === 'REDSHIFT'
              ? buildRedshiftFullStack({
                  WORKLOAD_NAME: workloadName,
                  QUICKSIGHT_USERNAME: qsUsername,
                  EVENTS_DATABASE: eventsDb,
                })
              : buildDataLakeFullStack({
                  WORKLOAD_NAME: workloadName,
                  QUICKSIGHT_USERNAME: qsUsername,
                  EVENTS_DATABASE: eventsDb,
                });

          // Stack SHALL contain zero RefreshSchedule resources
          const parentTemplate = Template.fromStack(stack);
          parentTemplate.resourceCountIs('AWS::QuickSight::RefreshSchedule', 0);
        },
      ),
      { numRuns: 10 },
    );
  });

  /**
   * Property 3: createRefreshSchedule is not exported from the module
   *
   * The quicksight-construct module SHALL NOT export a createRefreshSchedule
   * function. This is a static check confirming the helper was fully removed
   * from the public API surface after the DIRECT_QUERY revert.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  test('Property 3: createRefreshSchedule is not exported from the module', () => {
    expect(qsModule).not.toHaveProperty('createRefreshSchedule');
  });

  /**
   * Property 4: Resource chain is preserved for any valid config
   *
   * For any valid config (REDSHIFT or DATA_LAKE mode), synthesizing the full
   * QuickSightConstruct preserves the expected resource chain:
   * - Exactly 5 AWS::QuickSight::DataSet resources in the stack
   * - Exactly 1 AWS::QuickSight::DataSource resource in the stack
   * - Exactly 1 AWS::QuickSight::Dashboard resource in the stack
   * - VPC connection count depends on mode: 1 for REDSHIFT, 0 for DATA_LAKE
   *
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
   */
  test('Property 4: Resource chain is preserved for any valid config', () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const { stack } =
            dataStack === 'REDSHIFT'
              ? buildRedshiftFullStack({
                  WORKLOAD_NAME: workloadName,
                  QUICKSIGHT_USERNAME: qsUsername,
                  EVENTS_DATABASE: eventsDb,
                })
              : buildDataLakeFullStack({
                  WORKLOAD_NAME: workloadName,
                  QUICKSIGHT_USERNAME: qsUsername,
                  EVENTS_DATABASE: eventsDb,
                });

          // Stack assertions
          const parentTemplate = Template.fromStack(stack);
          parentTemplate.resourceCountIs('AWS::QuickSight::DataSet', 5);
          parentTemplate.resourceCountIs('AWS::QuickSight::DataSource', 1);
          parentTemplate.resourceCountIs('AWS::QuickSight::Dashboard', 1);

          // VPC connection count depends on mode
          if (dataStack === 'REDSHIFT') {
            parentTemplate.resourceCountIs('AWS::QuickSight::VPCConnection', 1);
          } else {
            parentTemplate.resourceCountIs('AWS::QuickSight::VPCConnection', 0);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
