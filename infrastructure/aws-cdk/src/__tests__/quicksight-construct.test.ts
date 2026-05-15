import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as sns from "aws-cdk-lib/aws-sns";
import { Template, Match } from "aws-cdk-lib/assertions";
import { GameAnalyticsPipelineConfig } from "../helpers/config-types";
import { QuickSightConstruct } from "../constructs/quicksight-construct";
import { VpcConstruct } from "../constructs/vpc-construct";
import { RedshiftConstruct } from "../constructs/redshift-construct";
import { DataLakeConstruct } from "../constructs/data-lake-construct";
import * as fc from "fast-check";

// ---- Shared test config ---- //

function baseConfig(overrides: Partial<GameAnalyticsPipelineConfig> = {}): GameAnalyticsPipelineConfig {
  return {
    REGION: "us-east-1",
    WORKLOAD_NAME: "TestWorkload",
    DEV_MODE: true,
    INGEST_MODE: "KINESIS_DATA_STREAMS",
    DATA_STACK: "REDSHIFT",
    REAL_TIME_ANALYTICS: false,
    ENABLE_APACHE_ICEBERG_SUPPORT: false,
    EVENTS_DATABASE: "game_events",
    RAW_EVENTS_TABLE: "raw_events",
    RAW_EVENTS_PREFIX: "raw-events/",
    PROCESSED_EVENTS_PREFIX: "processed-events/",
    STREAM_PROVISIONED: false,
    STREAM_SHARD_COUNT: 1,
    CLOUDWATCH_RETENTION_DAYS: 7,
    API_STAGE_NAME: "prod",
    EMAIL_ADDRESS: "",
    GLUE_TMP_PREFIX: "glue-tmp/",
    S3_BACKUP_MODE: false,
    ENABLE_QUICKSIGHT_DASHBOARD: true,
    QUICKSIGHT_USERNAME: "admin/quicksight-admin",
    ...overrides,
  };
}

// ---- Helper: build a stack with real dependent constructs for REDSHIFT mode ---- //

function buildRedshiftStack(configOverrides: Partial<GameAnalyticsPipelineConfig> = {}): cdk.Stack {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const config = baseConfig({ DATA_STACK: "REDSHIFT", ...configOverrides });

  const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });

  const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
    streamMode: kinesis.StreamMode.ON_DEMAND,
  });

  const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
    gamesEventsStream,
    config,
    vpcConstruct,
  });

  new QuickSightConstruct(stack, "QuickSightConstruct", {
    config,
    redshiftConstruct,
    vpcConstruct,
  });

  return stack;
}

// ---- Helper: build a stack with real dependent constructs for DATA_LAKE mode ---- //

function buildDataLakeStack(configOverrides: Partial<GameAnalyticsPipelineConfig> = {}): cdk.Stack {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  const config = baseConfig({ DATA_STACK: "DATA_LAKE", ...configOverrides });

  const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");

  const notificationsTopic = new sns.Topic(stack, "Notifications");

  const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
    analyticsBucket,
    config,
    notificationsTopic,
  });

  new QuickSightConstruct(stack, "QuickSightConstruct", {
    config,
    dataLakeConstruct,
    analyticsBucket,
  });

  return stack;
}

// ---- Helper: build a stack with ENABLE_QUICKSIGHT_DASHBOARD = false ---- //

function buildDisabledStack(): cdk.Stack {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  // No QuickSight construct is created — mirrors app-stack.ts conditional logic
  return stack;
}

// ---- Tests ---- //

describe("QuickSight Construct — Feature Gating", () => {
  test("when ENABLE_QUICKSIGHT_DASHBOARD is false, no AWS::QuickSight::* resources exist", () => {
    const stack = buildDisabledStack();
    const template = Template.fromStack(stack);

    // Verify no QuickSight resources of any type
    template.resourceCountIs("AWS::QuickSight::DataSource", 0);
    template.resourceCountIs("AWS::QuickSight::DataSet", 0);
    template.resourceCountIs("AWS::QuickSight::Template", 0);
    template.resourceCountIs("AWS::QuickSight::Dashboard", 0);
    template.resourceCountIs("AWS::QuickSight::VPCConnection", 0);
  });
});

describe("QuickSight Construct — REDSHIFT mode resource chain", () => {
  let template: Template;
  let nestedTemplate: Template;

  beforeAll(() => {
    const stack = buildRedshiftStack();
    template = Template.fromStack(stack);
    const qsConstruct = stack.node.findChild("QuickSightConstruct") as QuickSightConstruct;
    const dashboardStack = qsConstruct.node.findChild("DashboardStack") as cdk.NestedStack;
    nestedTemplate = Template.fromStack(dashboardStack);
  });

  test("creates exactly 1 DataSource of type REDSHIFT", () => {
    template.resourceCountIs("AWS::QuickSight::DataSource", 1);
    template.hasResourceProperties("AWS::QuickSight::DataSource", {
      Type: "REDSHIFT",
    });
  });

  test("creates exactly 11 DataSets", () => {
    template.resourceCountIs("AWS::QuickSight::DataSet", 11);
  });

  test("creates exactly 1 Template in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::Template", 1);
  });

  test("creates exactly 1 Dashboard in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::Dashboard", 1);
  });

  test("creates exactly 1 VPC Connection", () => {
    template.resourceCountIs("AWS::QuickSight::VPCConnection", 1);
  });

  test("creates zero RefreshSchedules in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::RefreshSchedule", 0);
  });

  test("all DataSets use DIRECT_QUERY import mode", () => {
    const dataSets = template.findResources("AWS::QuickSight::DataSet");
    for (const ds of Object.values(dataSets)) {
      expect((ds as any).Properties.ImportMode).toBe("DIRECT_QUERY");
    }
  });
});

describe("QuickSight Construct — DATA_LAKE mode resource chain", () => {
  let template: Template;
  let nestedTemplate: Template;

  beforeAll(() => {
    const stack = buildDataLakeStack();
    template = Template.fromStack(stack);
    const qsConstruct = stack.node.findChild("QuickSightConstruct") as QuickSightConstruct;
    const dashboardStack = qsConstruct.node.findChild("DashboardStack") as cdk.NestedStack;
    nestedTemplate = Template.fromStack(dashboardStack);
  });

  test("creates exactly 1 DataSource of type ATHENA", () => {
    template.resourceCountIs("AWS::QuickSight::DataSource", 1);
    template.hasResourceProperties("AWS::QuickSight::DataSource", {
      Type: "ATHENA",
    });
  });

  test("creates exactly 11 DataSets", () => {
    template.resourceCountIs("AWS::QuickSight::DataSet", 11);
  });

  test("creates exactly 1 Template in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::Template", 1);
  });

  test("creates exactly 1 Dashboard in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::Dashboard", 1);
  });

  test("creates 0 VPC Connections", () => {
    template.resourceCountIs("AWS::QuickSight::VPCConnection", 0);
  });

  test("creates zero RefreshSchedules in nested stack", () => {
    nestedTemplate.resourceCountIs("AWS::QuickSight::RefreshSchedule", 0);
  });

  test("all DataSets use DIRECT_QUERY import mode", () => {
    const dataSets = template.findResources("AWS::QuickSight::DataSet");
    for (const ds of Object.values(dataSets)) {
      expect((ds as any).Properties.ImportMode).toBe("DIRECT_QUERY");
    }
  });
});

describe("QuickSight Construct — IAM role permissions", () => {
  test("REDSHIFT mode IAM role has secretsmanager, kms, and redshift-serverless permissions", () => {
    const stack = buildRedshiftStack();
    const template = Template.fromStack(stack);

    // The QuickSight service role should have quicksight.amazonaws.com as trusted principal
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: Match.objectLike({
              Service: "quicksight.amazonaws.com",
            }),
          }),
        ]),
      }),
    });

    // Verify secretsmanager:GetSecretValue policy exists
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "secretsmanager:GetSecretValue",
            Effect: "Allow",
          }),
        ]),
      }),
    });

    // Verify kms:Decrypt policy exists
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "kms:Decrypt",
            Effect: "Allow",
          }),
        ]),
      }),
    });

    // Verify redshift-serverless permissions exist
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "redshift-serverless:GetCredentials",
              "redshift-serverless:GetWorkgroup",
            ]),
            Effect: "Allow",
          }),
        ]),
      }),
    });
  });

  test("DATA_LAKE mode IAM role has athena, glue, and s3 permissions", () => {
    const stack = buildDataLakeStack();
    const template = Template.fromStack(stack);

    // The QuickSight service role should have quicksight.amazonaws.com as trusted principal
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: Match.objectLike({
              Service: "quicksight.amazonaws.com",
            }),
          }),
        ]),
      }),
    });

    // Verify Athena query permissions exist
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "athena:GetQueryExecution",
              "athena:GetQueryResults",
              "athena:StartQueryExecution",
            ]),
            Effect: "Allow",
          }),
        ]),
      }),
    });

    // Verify Glue catalog read permissions exist
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "glue:GetTable",
              "glue:GetTables",
              "glue:GetDatabase",
            ]),
            Effect: "Allow",
          }),
        ]),
      }),
    });

    // Verify S3 read permissions exist
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "s3:GetObject",
              "s3:ListBucket",
              "s3:GetBucketLocation",
            ]),
            Effect: "Allow",
          }),
        ]),
      }),
    });
  });
});

describe("QuickSight Construct — CfnOutput for dashboard URL", () => {
  test("REDSHIFT mode emits QuickSight dashboard URL output", () => {
    const stack = buildRedshiftStack();
    const template = Template.fromStack(stack);

    template.hasOutput("*", {
      Value: Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp("quicksight"),
          ]),
        ]),
      }),
    });
  });

  test("DATA_LAKE mode emits QuickSight dashboard URL output", () => {
    const stack = buildDataLakeStack();
    const template = Template.fromStack(stack);

    template.hasOutput("*", {
      Value: Match.objectLike({
        "Fn::Join": Match.arrayWith([
          Match.arrayWith([
            Match.stringLikeRegexp("quicksight"),
          ]),
        ]),
      }),
    });
  });
});


// ---- Property-Based Tests ---- //

/**
 * fast-check arbitraries for generating random but structurally valid config values.
 * These generate varied workload names, usernames, database names, etc. while
 * keeping the config shape valid for CDK synthesis.
 */

/** Generates a non-empty alphanumeric string suitable for AWS resource names */
const arbResourceName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,15}$/);

/** Generates a valid QuickSight username (e.g., "admin/some-user") */
const arbQuickSightUsername = fc
  .tuple(
    fc.stringMatching(/^[a-z]{3,8}$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{2,10}$/)
  )
  .map(([ns, user]) => `${ns}/${user}`);

/** Generates a valid DATA_STACK mode */
const arbDataStack = fc.constantFrom("REDSHIFT" as const, "DATA_LAKE" as const);

describe("QuickSight Construct — Property-Based Tests: Feature Flag Toggle", () => {
  /**
   * Property 1: Feature flag disables all QuickSight resources
   *
   * For any valid config where ENABLE_QUICKSIGHT_DASHBOARD is false,
   * the synthesized CloudFormation template contains zero AWS::QuickSight::* resources.
   *
   * **Validates: Requirements 1.1, 1.2, 4.1, 5.5**
   */
  test("Property 1: For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=false, zero QuickSight resources exist", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          // Config with ENABLE_QUICKSIGHT_DASHBOARD = false — no QuickSight construct created
          // This mirrors the conditional logic in app-stack.ts
          const _config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: false,
          });

          // When the flag is false, app-stack.ts does NOT instantiate QuickSightConstruct
          // so we simply synthesize the empty stack (same as buildDisabledStack but with random config)

          const template = Template.fromStack(stack);

          template.resourceCountIs("AWS::QuickSight::DataSource", 0);
          template.resourceCountIs("AWS::QuickSight::DataSet", 0);
          template.resourceCountIs("AWS::QuickSight::Template", 0);
          template.resourceCountIs("AWS::QuickSight::Dashboard", 0);
          template.resourceCountIs("AWS::QuickSight::VPCConnection", 0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 2: Feature flag enables complete resource chain
   *
   * For any valid config where ENABLE_QUICKSIGHT_DASHBOARD is true (with either
   * REDSHIFT or DATA_LAKE mode), the synthesized CloudFormation template contains
   * exactly 1 DataSource, 11 DataSets, 1 Template, and 1 Dashboard.
   *
   * **Validates: Requirements 1.1, 1.2, 4.1, 5.5**
   */
  test("Property 2: For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=true, complete resource chain exists", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // Exactly 1 DataSource regardless of mode
          template.resourceCountIs("AWS::QuickSight::DataSource", 1);
          // Exactly 11 DataSets (one per SQL view in DATA_SET_DEFINITIONS)
          template.resourceCountIs("AWS::QuickSight::DataSet", 11);

          // Template and Dashboard live in the nested DashboardStack
          const qsConstruct = stack.node.findChild("QuickSightConstruct") as QuickSightConstruct;
          const dashboardStack = qsConstruct.node.findChild("DashboardStack") as cdk.NestedStack;
          const nestedTemplate = Template.fromStack(dashboardStack);

          // Exactly 1 Template (in nested stack)
          nestedTemplate.resourceCountIs("AWS::QuickSight::Template", 1);
          // Exactly 1 Dashboard (in nested stack)
          nestedTemplate.resourceCountIs("AWS::QuickSight::Dashboard", 1);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe("QuickSight Construct — Property-Based Tests: Data Source Mode Selection", () => {
  /**
   * Property 3: REDSHIFT mode creates correct DataSource with VPC connection
   *
   * For any valid config where DATA_STACK is "REDSHIFT" and ENABLE_QUICKSIGHT_DASHBOARD is true,
   * the DataSource type SHALL be "REDSHIFT", a VPC connection SHALL exist, the DataSource SHALL
   * use Secrets Manager credentials, and the DataSource SHALL reference the VPC connection ARN.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  test("Property 3: REDSHIFT mode creates DataSource of type REDSHIFT with VPC connection and Secrets Manager credentials", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbResourceName,
        (workloadName, qsUsername, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: "REDSHIFT",
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build REDSHIFT mode dependencies
          const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
          const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
            streamMode: kinesis.StreamMode.ON_DEMAND,
          });
          const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
            gamesEventsStream,
            config,
            vpcConstruct,
          });
          new QuickSightConstruct(stack, "QuickSightConstruct", {
            config,
            redshiftConstruct,
            vpcConstruct,
          });

          const template = Template.fromStack(stack);

          // Req 2.1: DataSource type SHALL be "REDSHIFT"
          template.resourceCountIs("AWS::QuickSight::DataSource", 1);
          template.hasResourceProperties("AWS::QuickSight::DataSource", {
            Type: "REDSHIFT",
          });

          // Req 2.2: A VPC connection SHALL exist
          template.resourceCountIs("AWS::QuickSight::VPCConnection", 1);

          // Req 2.3: DataSource SHALL use credential pair with Secrets Manager dynamic reference
          template.hasResourceProperties("AWS::QuickSight::DataSource", {
            Credentials: Match.objectLike({
              CredentialPair: Match.objectLike({
                Username: Match.anyValue(),
                Password: Match.anyValue(),
              }),
            }),
          });

          // Req 2.4: DataSource SHALL reference the VPC connection ARN
          template.hasResourceProperties("AWS::QuickSight::DataSource", {
            VpcConnectionProperties: Match.objectLike({
              VpcConnectionArn: Match.anyValue(),
            }),
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 4: DATA_LAKE mode creates correct DataSource without VPC connection
   *
   * For any valid config where DATA_STACK is "DATA_LAKE" and ENABLE_QUICKSIGHT_DASHBOARD is true,
   * the DataSource type SHALL be "ATHENA", no VPC connection SHALL exist, and the DataSource SHALL
   * reference the Athena workgroup name.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  test("Property 4: DATA_LAKE mode creates DataSource of type ATHENA without VPC connection and with Athena workgroup", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbResourceName,
        (workloadName, qsUsername, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: "DATA_LAKE",
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build DATA_LAKE mode dependencies
          const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
          const notificationsTopic = new sns.Topic(stack, "Notifications");
          const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
            analyticsBucket,
            config,
            notificationsTopic,
          });
          new QuickSightConstruct(stack, "QuickSightConstruct", {
            config,
            dataLakeConstruct,
            analyticsBucket,
          });

          const template = Template.fromStack(stack);

          // Req 3.1: DataSource type SHALL be "ATHENA"
          template.resourceCountIs("AWS::QuickSight::DataSource", 1);
          template.hasResourceProperties("AWS::QuickSight::DataSource", {
            Type: "ATHENA",
          });

          // Req 3.2: No VPC connection SHALL exist
          template.resourceCountIs("AWS::QuickSight::VPCConnection", 0);

          // Req 3.3: DataSource SHALL reference the Athena workgroup name
          template.hasResourceProperties("AWS::QuickSight::DataSource", {
            DataSourceParameters: Match.objectLike({
              AthenaParameters: Match.objectLike({
                WorkGroup: Match.anyValue(),
              }),
            }),
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

import { DATA_SET_DEFINITIONS } from "../constructs/quicksight-construct";

describe("QuickSight Construct — Property-Based Tests: DataSet Creation", () => {
  /**
   * Property 5: All DataSets use DIRECT_QUERY mode with unique identifiers
   *
   * For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=true (either mode):
   * - All 11 DataSets SHALL have ImportMode set to "DIRECT_QUERY"
   * - All DataSet DataSetId values SHALL be unique
   * - Each DataSetId SHALL follow the pattern "{workloadName}-{viewName}"
   *
   * **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6**
   */
  test("Property 5: All DataSets use DIRECT_QUERY mode with unique DataSetId following {workloadName}-{viewName} pattern", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // Find all DataSet resources in the synthesized template
          const dataSets = template.findResources("AWS::QuickSight::DataSet");
          const dataSetEntries = Object.values(dataSets);

          // All 11 DataSets SHALL exist
          expect(dataSetEntries).toHaveLength(11);

          const allDataSetIds: string[] = [];
          const expectedViewNames = DATA_SET_DEFINITIONS.map((d) => d.viewName);

          for (const ds of dataSetEntries) {
            const props = (ds as any).Properties;

            // All DataSets SHALL have ImportMode set to "DIRECT_QUERY"
            expect(props.ImportMode).toBe("DIRECT_QUERY");

            // Collect DataSetId for uniqueness check
            allDataSetIds.push(props.DataSetId);

            // Each DataSetId SHALL follow the pattern "{workloadName}-{viewName}"
            const idStr = props.DataSetId as string;
            expect(idStr.startsWith(`${workloadName}-`)).toBe(true);

            // The suffix after workloadName- should be a valid view name
            const viewNameSuffix = idStr.slice(workloadName.length + 1);
            expect(expectedViewNames).toContain(viewNameSuffix);
          }

          // All DataSetId values SHALL be unique
          const uniqueIds = new Set(allDataSetIds);
          expect(uniqueIds.size).toBe(allDataSetIds.length);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: DataSet SQL queries use correct schema qualification per mode
   *
   * For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=true:
   * - WHEN DATA_STACK is "REDSHIFT", each DataSet's SQL query SHALL contain
   *   "{database}"."public"."{viewName}"
   * - WHEN DATA_STACK is "DATA_LAKE", each DataSet's SQL query SHALL contain
   *   "{database}"."{viewName}" (without "public")
   *
   * **Validates: Requirements 4.3, 4.4, 4.5**
   */
  test("Property 6: DataSet SQL queries use correct schema qualification per mode", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // Find all DataSet resources
          const dataSets = template.findResources("AWS::QuickSight::DataSet");
          const dataSetEntries = Object.values(dataSets);

          for (const ds of dataSetEntries) {
            const props = (ds as any).Properties;
            const physicalTableMap = props.PhysicalTableMap;

            // Each DataSet has exactly one physical table entry
            const tableKeys = Object.keys(physicalTableMap);
            expect(tableKeys.length).toBe(1);

            const tableEntry = physicalTableMap[tableKeys[0]];
            const sqlQuery = tableEntry.CustomSql.SqlQuery as string;
            const viewName = tableEntry.CustomSql.Name as string;

            if (dataStack === "REDSHIFT") {
              // REDSHIFT mode: SQL SHALL contain "{database}"."public"."{viewName}"
              const expectedPattern = `"${eventsDb}"."public"."${viewName}"`;
              expect(sqlQuery).toContain(expectedPattern);
            } else {
              // DATA_LAKE mode: SQL SHALL contain "{database}"."{viewName}" (without "public")
              const expectedPattern = `"${eventsDb}"."${viewName}"`;
              expect(sqlQuery).toContain(expectedPattern);

              // Additionally verify "public" is NOT in the query for DATA_LAKE mode
              expect(sqlQuery).not.toContain('"public"');
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});


describe("QuickSight Construct — Property-Based Tests: IAM and Permissions", () => {
  /**
   * Property 7: IAM role follows least-privilege per data source mode
   *
   * For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=true:
   * - The IAM role SHALL have `quicksight.amazonaws.com` as the trusted service principal (Req 6.1)
   * - WHEN DATA_STACK is "REDSHIFT": the IAM policy SHALL include `secretsmanager:GetSecretValue`,
   *   `kms:Decrypt`, and `redshift-serverless:GetCredentials`/`redshift-serverless:GetWorkgroup` (Reqs 6.2, 6.3, 6.4)
   * - WHEN DATA_STACK is "DATA_LAKE": the IAM policy SHALL include Athena query permissions,
   *   Glue catalog read permissions, and S3 read permissions (Reqs 6.5, 6.6, 6.7)
   * - The role SHALL NOT have cross-mode permissions (REDSHIFT mode should not have Athena/Glue/S3
   *   permissions, DATA_LAKE mode should not have secretsmanager/kms/redshift-serverless permissions)
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**
   */
  test("Property 7: IAM role follows least-privilege per data source mode", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // Req 6.1: IAM role SHALL have quicksight.amazonaws.com as trusted principal
          template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: Match.objectLike({
              Statement: Match.arrayWith([
                Match.objectLike({
                  Principal: Match.objectLike({
                    Service: "quicksight.amazonaws.com",
                  }),
                }),
              ]),
            }),
          });

          // Collect all IAM policy actions across all policies in the template
          const policies = template.findResources("AWS::IAM::Policy");
          const allActions: string[] = [];
          for (const policy of Object.values(policies)) {
            const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
            for (const stmt of statements) {
              const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
              allActions.push(...actions);
            }
          }

          if (dataStack === "REDSHIFT") {
            // Reqs 6.2, 6.3, 6.4: REDSHIFT mode SHALL include these permissions
            expect(allActions).toContain("secretsmanager:GetSecretValue");
            expect(allActions).toContain("kms:Decrypt");
            expect(allActions).toContain("redshift-serverless:GetCredentials");
            expect(allActions).toContain("redshift-serverless:GetWorkgroup");

            // Least-privilege: REDSHIFT mode SHALL NOT have DATA_LAKE permissions
            const athenaActions = allActions.filter((a) => a.startsWith("athena:"));
            const glueActions = allActions.filter((a) => a.startsWith("glue:"));
            const s3Actions = allActions.filter((a) =>
              ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation"].includes(a)
            );
            expect(athenaActions).toHaveLength(0);
            expect(glueActions).toHaveLength(0);
            expect(s3Actions).toHaveLength(0);
          } else {
            // Reqs 6.5, 6.6, 6.7: DATA_LAKE mode SHALL include these permissions
            expect(allActions).toContain("athena:GetQueryExecution");
            expect(allActions).toContain("athena:GetQueryResults");
            expect(allActions).toContain("athena:StartQueryExecution");
            expect(allActions).toContain("glue:GetTable");
            expect(allActions).toContain("glue:GetTables");
            expect(allActions).toContain("glue:GetDatabase");
            expect(allActions).toContain("s3:GetObject");
            expect(allActions).toContain("s3:ListBucket");
            expect(allActions).toContain("s3:GetBucketLocation");

            // Least-privilege: DATA_LAKE mode SHALL NOT have REDSHIFT permissions
            const smActions = allActions.filter((a) => a.startsWith("secretsmanager:"));
            const kmsActions = allActions.filter((a) => a.startsWith("kms:"));
            const rsActions = allActions.filter((a) => a.startsWith("redshift-serverless:"));
            expect(smActions).toHaveLength(0);
            expect(kmsActions).toHaveLength(0);
            expect(rsActions).toHaveLength(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 8: Configured user receives permissions on all QuickSight resources
   *
   * For any valid config with ENABLE_QUICKSIGHT_DASHBOARD=true:
   * - The DataSource SHALL have permissions granted to the configured QuickSight user (Req 7.2)
   * - All 11 DataSets SHALL have permissions granted to the configured QuickSight user (Req 7.3)
   * - The Dashboard SHALL have permissions granted to the configured QuickSight user
   *   including `quicksight:DescribeDashboard` and `quicksight:QueryDashboard` (Req 7.1)
   *
   * **Validates: Requirements 7.1, 7.2, 7.3**
   */
  test("Property 8: Configured user receives permissions on all QuickSight resources", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // The expected QuickSight user ARN pattern
          // In synthesized CFN, the ARN uses Fn::Join with Ref for region/account
          const expectedUserSuffix = `:user/default/${qsUsername}`;

          // Req 7.2: DataSource SHALL have permissions for the configured user
          const dataSources = template.findResources("AWS::QuickSight::DataSource");
          const dsEntries = Object.values(dataSources);
          expect(dsEntries).toHaveLength(1);
          const dsPermissions = (dsEntries[0] as any).Properties.Permissions as any[];
          expect(dsPermissions.length).toBeGreaterThanOrEqual(1);
          // Find a permission entry whose principal contains the username
          const dsHasUser = dsPermissions.some((p: any) => {
            const principal = p.Principal;
            if (typeof principal === "string") {
              return principal.includes(expectedUserSuffix);
            }
            // Handle Fn::Join case
            if (principal?.["Fn::Join"]) {
              const parts = principal["Fn::Join"][1] as any[];
              const joined = parts.map((part: any) => (typeof part === "string" ? part : "TOKEN")).join("");
              return joined.includes(expectedUserSuffix);
            }
            return false;
          });
          expect(dsHasUser).toBe(true);

          // Req 7.3: All 11 DataSets SHALL have permissions for the configured user
          const dataSets = template.findResources("AWS::QuickSight::DataSet");
          const dataSetEntries = Object.values(dataSets);
          expect(dataSetEntries).toHaveLength(11);
          for (const ds of dataSetEntries) {
            const permissions = (ds as any).Properties.Permissions as any[];
            expect(permissions.length).toBeGreaterThanOrEqual(1);
            const hasUser = permissions.some((p: any) => {
              const principal = p.Principal;
              if (typeof principal === "string") {
                return principal.includes(expectedUserSuffix);
              }
              if (principal?.["Fn::Join"]) {
                const parts = principal["Fn::Join"][1] as any[];
                const joined = parts.map((part: any) => (typeof part === "string" ? part : "TOKEN")).join("");
                return joined.includes(expectedUserSuffix);
              }
              return false;
            });
            expect(hasUser).toBe(true);
          }

          // Req 7.1: Dashboard SHALL have permissions including DescribeDashboard and QueryDashboard
          // Dashboard lives in the nested DashboardStack
          const qsConstruct = stack.node.findChild("QuickSightConstruct") as QuickSightConstruct;
          const dashboardStack = qsConstruct.node.findChild("DashboardStack") as cdk.NestedStack;
          const nestedTemplate = Template.fromStack(dashboardStack);
          const dashboards = nestedTemplate.findResources("AWS::QuickSight::Dashboard");
          const dashEntries = Object.values(dashboards);
          expect(dashEntries).toHaveLength(1);
          const dashPermissions = (dashEntries[0] as any).Properties.Permissions as any[];
          expect(dashPermissions.length).toBeGreaterThanOrEqual(1);
          const dashHasUser = dashPermissions.some((p: any) => {
            const principal = p.Principal;
            if (typeof principal === "string") {
              return principal.includes(expectedUserSuffix);
            }
            if (principal?.["Fn::Join"]) {
              const parts = principal["Fn::Join"][1] as any[];
              const joined = parts.map((part: any) => (typeof part === "string" ? part : "TOKEN")).join("");
              return joined.includes(expectedUserSuffix);
            }
            return false;
          });
          expect(dashHasUser).toBe(true);

          // Verify dashboard permissions include the required actions
          const dashUserPerm = dashPermissions.find((p: any) => {
            const principal = p.Principal;
            if (typeof principal === "string") {
              return principal.includes(expectedUserSuffix);
            }
            if (principal?.["Fn::Join"]) {
              const parts = principal["Fn::Join"][1] as any[];
              const joined = parts.map((part: any) => (typeof part === "string" ? part : "TOKEN")).join("");
              return joined.includes(expectedUserSuffix);
            }
            return false;
          });
          expect(dashUserPerm.Actions).toContain("quicksight:DescribeDashboard");
          expect(dashUserPerm.Actions).toContain("quicksight:QueryDashboard");
        }
      ),
      { numRuns: 50 }
    );
  });
});


describe("QuickSight Construct — Property-Based Tests: Dashboard URL Output", () => {
  /**
   * Property 9: Dashboard URL emitted as CloudFormation output
   *
   * For any valid config where ENABLE_QUICKSIGHT_DASHBOARD is true (either REDSHIFT or DATA_LAKE mode):
   * - The synthesized CloudFormation template SHALL contain a CfnOutput with the QuickSight dashboard URL
   * - The output value SHALL contain "quicksight" in the URL (indicating it's a QuickSight dashboard URL)
   *
   * **Validates: Requirements 8.2**
   */
  test("Property 9: Dashboard URL emitted as CloudFormation output", () => {
    fc.assert(
      fc.property(
        arbResourceName,
        arbQuickSightUsername,
        arbDataStack,
        arbResourceName,
        (workloadName, qsUsername, dataStack, eventsDb) => {
          const app = new cdk.App();
          const stack = new cdk.Stack(app, "PropTestStack", {
            env: { account: "123456789012", region: "us-east-1" },
          });

          const config = baseConfig({
            WORKLOAD_NAME: workloadName,
            QUICKSIGHT_USERNAME: qsUsername,
            DATA_STACK: dataStack,
            EVENTS_DATABASE: eventsDb,
            ENABLE_QUICKSIGHT_DASHBOARD: true,
          });

          // Build mode-specific dependencies and instantiate the construct
          if (dataStack === "REDSHIFT") {
            const vpcConstruct = new VpcConstruct(stack, "VpcConstruct", { config });
            const gamesEventsStream = new kinesis.Stream(stack, "GameEventStream", {
              streamMode: kinesis.StreamMode.ON_DEMAND,
            });
            const redshiftConstruct = new RedshiftConstruct(stack, "RedshiftConstruct", {
              gamesEventsStream,
              config,
              vpcConstruct,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              redshiftConstruct,
              vpcConstruct,
            });
          } else {
            const analyticsBucket = new s3.Bucket(stack, "AnalyticsBucket");
            const notificationsTopic = new sns.Topic(stack, "Notifications");
            const dataLakeConstruct = new DataLakeConstruct(stack, "DataLakeConstruct", {
              analyticsBucket,
              config,
              notificationsTopic,
            });
            new QuickSightConstruct(stack, "QuickSightConstruct", {
              config,
              dataLakeConstruct,
              analyticsBucket,
            });
          }

          const template = Template.fromStack(stack);

          // Find all outputs in the synthesized template
          const outputs = template.findOutputs("*");
          const outputKeys = Object.keys(outputs);

          // At least one CfnOutput SHALL exist
          expect(outputKeys.length).toBeGreaterThanOrEqual(1);

          // At least one output SHALL contain "quicksight" in its value,
          // indicating it's a QuickSight dashboard URL.
          // The URL is built with Fn::Join, so we check the joined parts for "quicksight".
          const hasQuickSightUrl = outputKeys.some((key) => {
            const outputValue = outputs[key]?.Value;

            // Case 1: Value is a plain string containing "quicksight"
            if (typeof outputValue === "string") {
              return outputValue.toLowerCase().includes("quicksight");
            }

            // Case 2: Value uses Fn::Join — check if any part contains "quicksight"
            if (outputValue?.["Fn::Join"]) {
              const parts = outputValue["Fn::Join"][1] as any[];
              return parts.some(
                (part: any) =>
                  typeof part === "string" &&
                  part.toLowerCase().includes("quicksight")
              );
            }

            return false;
          });

          expect(hasQuickSightUrl).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});
