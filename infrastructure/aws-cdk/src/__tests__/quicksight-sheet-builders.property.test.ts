import * as fc from 'fast-check';
import {
  buildCombatSheet,
  buildMonetizationSheet,
  buildProgressionSheet,
  buildPulseSheet,
  buildSentimentSheet,
} from '../constructs/quicksight-sheet-builders';

/**
 * Property 5: All visual IDs are unique across the template
 *
 * For any two visuals in the template definition across all four sheets,
 * their visualId values SHALL be distinct.
 *
 * **Validates: Requirement 10.1**
 */

// ---- Helpers ---- //

/** Known visual wrapper keys used by the visual helper functions */
const VISUAL_KEYS = [
  'kpiVisual',
  'lineChartVisual',
  'barChartVisual',
  'tableVisual',
  'pieChartVisual',
  'gaugeChartVisual',
  'funnelChartVisual',
  'comboChartVisual',
  'treeMapVisual',
];

/**
 * Extracts the visualId from a visual definition object.
 * Each visual is wrapped in a chart-type key (e.g., kpiVisual, lineChartVisual).
 */
function extractVisualId(visual: Record<string, any>): string {
  for (const key of VISUAL_KEYS) {
    if (visual[key] && visual[key].visualId) {
      return visual[key].visualId;
    }
  }
  throw new Error(`Could not extract visualId from visual object with keys: ${Object.keys(visual).join(', ')}`);
}

/**
 * Extracts all visualIds from a sheet object returned by a sheet builder.
 */
function extractVisualIdsFromSheet(sheet: Record<string, any>): string[] {
  return (sheet.visuals as Record<string, any>[]).map(extractVisualId);
}

// ---- Required DataSet identifier keys ---- //

/**
 * The complete set of DataSet view names required by the four sheet builders.
 * These are the keys that must exist in the dataSetIdentifiers map.
 */
const REQUIRED_DATASET_KEYS = ['all_events', 'match_events', 'level_events', 'economy_events', 'player_health', 'match_lifecycle_funnel'];

/** Generates a non-empty alphanumeric string suitable for DataSet identifier values */
const arbIdentifierValue = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/);

/**
 * Generates a valid dataSetIdentifiers map with all required keys.
 * Values are arbitrary non-empty strings (the sheet builders just pass them through).
 */
const arbDataSetIdentifiers = fc.tuple(...REQUIRED_DATASET_KEYS.map(() => arbIdentifierValue)).map((values) => {
  const map: Record<string, string> = {};
  REQUIRED_DATASET_KEYS.forEach((key, i) => {
    map[key] = values[i];
  });
  return map;
});

/**
 * Represents a grid layout element's bounding rectangle.
 */
interface GridElement {
  elementId: string;
  columnIndex: number;
  columnSpan: number;
  rowIndex: number;
  rowSpan: number;
}

/**
 * Extracts all grid layout elements from a sheet object returned by a sheet builder.
 */
function extractGridElements(sheet: Record<string, any>): GridElement[] {
  const layouts = sheet.layouts as any[];
  const elements: GridElement[] = [];
  for (const layout of layouts) {
    const gridElements = layout.configuration?.gridLayout?.elements ?? [];
    for (const el of gridElements) {
      elements.push({
        elementId: el.elementId,
        columnIndex: el.columnIndex,
        columnSpan: el.columnSpan,
        rowIndex: el.rowIndex,
        rowSpan: el.rowSpan,
      });
    }
  }
  return elements;
}

/**
 * Checks whether two grid elements' bounding rectangles overlap.
 * Two rectangles overlap if they share at least one grid cell.
 */
function doElementsOverlap(a: GridElement, b: GridElement): boolean {
  const aRight = a.columnIndex + a.columnSpan;
  const bRight = b.columnIndex + b.columnSpan;
  const aBottom = a.rowIndex + a.rowSpan;
  const bBottom = b.rowIndex + b.rowSpan;

  // No overlap if one is entirely to the left, right, above, or below the other
  if (aRight <= b.columnIndex || bRight <= a.columnIndex) return false;
  if (aBottom <= b.rowIndex || bBottom <= a.rowIndex) return false;

  return true;
}

// ---- Tests ---- //

describe('QuickSight Sheet Builders — Property-Based Tests (Property 5)', () => {
  /**
   * Property 5: All visual IDs are unique across the template
   *
   * Calls all five sheet builders with valid dataSetIdentifiers and collects
   * all visualId values from the returned visuals across all sheets.
   * Asserts the set of IDs has no duplicates.
   *
   * **Validates: Requirement 9.1**
   */
  test('all visual IDs are unique across all five sheets for any valid dataSetIdentifiers', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const pulseSheet = buildPulseSheet(dataSetIdentifiers) as Record<string, any>;
        const progressionSheet = buildProgressionSheet(dataSetIdentifiers) as Record<string, any>;
        const combatSheet = buildCombatSheet(dataSetIdentifiers) as Record<string, any>;
        const monetizationSheet = buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>;
        const sentimentSheet = buildSentimentSheet(dataSetIdentifiers) as Record<string, any>;

        const allVisualIds = [
          ...extractVisualIdsFromSheet(pulseSheet),
          ...extractVisualIdsFromSheet(progressionSheet),
          ...extractVisualIdsFromSheet(combatSheet),
          ...extractVisualIdsFromSheet(monetizationSheet),
          ...extractVisualIdsFromSheet(sentimentSheet),
        ];

        // Every visual ID should be a non-empty string
        for (const id of allVisualIds) {
          expect(typeof id).toBe('string');
          expect(id.length).toBeGreaterThan(0);
        }

        // The set of IDs should have no duplicates
        const uniqueIds = new Set(allVisualIds);
        expect(uniqueIds.size).toBe(allVisualIds.length);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 7: Grid layout elements do not overlap
 *
 * For each sheet returned by the builders, extract all grid layout elements
 * and verify no two elements' bounding rectangles (columnIndex, columnSpan,
 * rowIndex, rowSpan) intersect.
 *
 * **Validates: Requirements 4.4, 5.10, 6.4, 7.1, 7.3**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 7)', () => {
  test('grid layout elements do not overlap within any sheet for any valid dataSetIdentifiers', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const elements = extractGridElements(sheet);

          // Check every pair of elements for overlap
          for (let i = 0; i < elements.length; i++) {
            for (let j = i + 1; j < elements.length; j++) {
              const a = elements[i];
              const b = elements[j];
              expect(doElementsOverlap(a, b)).toBe(false);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 8: Grid layout elements stay within the 32-column boundary
 *
 * For each grid layout element across all sheets, assert
 * `columnIndex + columnSpan <= 32`.
 *
 * **Validates: Requirement 7.2**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 8)', () => {
  test('grid layout elements stay within the 32-column boundary for any valid dataSetIdentifiers', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const elements = extractGridElements(sheet);

          for (const el of elements) {
            expect(el.columnIndex + el.columnSpan).toBeLessThanOrEqual(32);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 9: Layout element IDs match visual IDs
 *
 * For each sheet, verify every `elementId` in the grid layout matches a
 * `visualId` of a visual defined in that same sheet.
 *
 * **Validates: Requirement 10.2**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 9)', () => {
  test('every grid layout elementId matches a visualId in the same sheet for any valid dataSetIdentifiers', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const visualIds = new Set(extractVisualIdsFromSheet(sheet));
          const gridElements = extractGridElements(sheet);

          for (const element of gridElements) {
            expect(visualIds).toContain(element.elementId);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Property 2: High-cardinality categories use bar charts
 *
 * For any visual using a categorical dimension with known cardinality >5
 * (platform, country, rank_reached), verify the visual is a `barChartVisual`,
 * not a `pieChartVisual`.
 *
 * **Validates: Requirements 6.1**
 */
/** High-cardinality columns that must never appear in a pieChartVisual */
const HIGH_CARDINALITY_COLUMNS = ['platform', 'country', 'rank_reached'];

/**
 * Extracts category dimension column names from a pieChartVisual.
 * Returns an empty array if the visual is not a pieChartVisual or has no categories.
 */
function extractPieChartCategoryColumns(visual: Record<string, any>): string[] {
  const pie = visual.pieChartVisual;
  if (!pie) return [];

  const categories = pie.chartConfiguration?.fieldWells?.pieChartAggregatedFieldWells?.category ?? [];

  return categories
    .map((cat: any) => cat?.categoricalDimensionField?.column?.columnName)
    .filter((name: unknown): name is string => typeof name === 'string');
}

describe('QuickSight Sheet Builders — Property-Based Tests (Property 2)', () => {
  test('no pieChartVisual uses a high-cardinality column as a category dimension', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const visuals = sheet.visuals as Record<string, any>[];
          for (const visual of visuals) {
            const pieCategoryColumns = extractPieChartCategoryColumns(visual);
            for (const columnName of pieCategoryColumns) {
              expect(HIGH_CARDINALITY_COLUMNS).not.toContain(columnName);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---- Helpers for Property 1: Multi-currency safety ---- //

/**
 * Collects column names from numericalMeasureField entries found anywhere in the object tree.
 */
function collectMeasureColumns(obj: unknown): string[] {
  const results: string[] = [];
  const json = JSON.stringify(obj);
  if (!json.includes('numericalMeasureField')) return results;

  function walk(node: unknown): void {
    if (node === null || node === undefined || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (
      'numericalMeasureField' in record &&
      typeof record.numericalMeasureField === 'object' &&
      record.numericalMeasureField !== null
    ) {
      const field = record.numericalMeasureField as Record<string, unknown>;
      const column = field.column as Record<string, unknown> | undefined;
      if (column?.columnName && typeof column.columnName === 'string') {
        results.push(column.columnName);
      }
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (typeof value === 'object' && value !== null) {
        walk(value);
      }
    }
  }

  walk(obj);
  return results;
}

/**
 * Collects column names from categoricalDimensionField and dateDimensionField entries
 * found anywhere in the object tree (category, color, or filter positions).
 */
function collectDimensionColumns(obj: unknown): string[] {
  const results: string[] = [];

  function walk(node: unknown): void {
    if (node === null || node === undefined || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;

    if (
      'categoricalDimensionField' in record &&
      typeof record.categoricalDimensionField === 'object' &&
      record.categoricalDimensionField !== null
    ) {
      const field = record.categoricalDimensionField as Record<string, unknown>;
      const column = field.column as Record<string, unknown> | undefined;
      if (column?.columnName && typeof column.columnName === 'string') {
        results.push(column.columnName);
      }
    }
    if (
      'dateDimensionField' in record &&
      typeof record.dateDimensionField === 'object' &&
      record.dateDimensionField !== null
    ) {
      const field = record.dateDimensionField as Record<string, unknown>;
      const column = field.column as Record<string, unknown> | undefined;
      if (column?.columnName && typeof column.columnName === 'string') {
        results.push(column.columnName);
      }
    }

    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else if (typeof value === 'object' && value !== null) {
        walk(value);
      }
    }
  }

  walk(obj);
  return results;
}

/**
 * Property 1: Multi-currency safety
 *
 * For any visual definition in the dashboard that references `currency_amount`
 * as a measure field, the visual SHALL also include `currency_type` as either
 * a category dimension, color dimension, or filter — ensuring currencies are
 * never summed across types.
 *
 * **Validates: Requirements 4.5, 7.5**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 1)', () => {
  test('any visual referencing currency_amount as a measure also includes currency_type as a dimension', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const visuals = sheet.visuals as Record<string, any>[];
          for (const visual of visuals) {
            const measureColumns = collectMeasureColumns(visual);
            const dimensionColumns = collectDimensionColumns(visual);

            // If currency_amount is used as a measure, currency_type must be present as a dimension
            if (measureColumns.includes('currency_amount')) {
              expect(dimensionColumns).toContain('currency_type');
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---- Helpers for Property 3: Time-series chart type compliance ---- //

/**
 * Recursively checks whether an object contains a dateDimensionField
 * with dateGranularity: 'DAY'.
 */
function findDayGranularityDateField(obj: unknown): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') return false;

  const record = obj as Record<string, unknown>;
  if ('dateDimensionField' in record && typeof record.dateDimensionField === 'object' && record.dateDimensionField) {
    const dateField = record.dateDimensionField as Record<string, unknown>;
    if (dateField.dateGranularity === 'DAY') return true;
  }

  return Object.values(record).some((value) => {
    if (Array.isArray(value)) return value.some((item) => findDayGranularityDateField(item));
    return findDayGranularityDateField(value);
  });
}

/**
 * Checks whether a visual object contains a dateDimensionField with DAY granularity
 * anywhere in its field wells.
 */
function hasDateDimensionFieldWithDayGranularity(visual: Record<string, unknown>): boolean {
  const json = JSON.stringify(visual);
  if (!json.includes('dateDimensionField')) return false;
  return findDayGranularityDateField(visual);
}

/**
 * Determines the visual type key (e.g., 'lineChartVisual', 'barChartVisual')
 * from a visual definition object.
 */
function getVisualTypeKey(visual: Record<string, unknown>): string | undefined {
  const knownKeys = [
    'lineChartVisual',
    'barChartVisual',
    'pieChartVisual',
    'kpiVisual',
    'tableVisual',
    'gaugeChartVisual',
    'funnelChartVisual',
    'comboChartVisual',
    'treeMapVisual',
  ];
  return knownKeys.find((key) => key in visual);
}

/**
 * Property 3: Time-series data uses line or area charts
 *
 * For any visual in the dashboard definition that uses a `dateDimensionField`
 * with `DAY` granularity (producing >12 data points over the 30-day recent window),
 * the visual SHALL be a `lineChartVisual` (which includes area type via
 * chartConfiguration.type = "AREA" or "STACKED_AREA"), NOT a `barChartVisual`.
 *
 * **Validates: Requirements 6.2**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 3)', () => {
  test('visuals with dateDimensionField DAY granularity are lineChartVisual, not barChartVisual', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, unknown>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, unknown>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, unknown>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, unknown>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, unknown>,
        ];

        for (const sheet of sheets) {
          const visuals = sheet.visuals as Record<string, unknown>[];
          for (const visual of visuals) {
            if (hasDateDimensionFieldWithDayGranularity(visual)) {
              const typeKey = getVisualTypeKey(visual);
              // Valid time-series visual types: lineChart, comboChart, kpiVisual (sparklines)
              expect(['lineChartVisual', 'comboChartVisual', 'kpiVisual']).toContain(typeKey);
              // Must NOT be a barChartVisual
              expect(typeKey).not.toBe('barChartVisual');
            }
          }
        }
      }),
      { numRuns: 20 },
    );
  });
});

/**
 * Property 4: Naturally-ordered dimensions preserve category order
 *
 * For any visual in the dashboard definition whose category dimension is a
 * naturally-ordered field (rank_reached, level_id, tutorial_screen_id,
 * app_version, user_rating), the sort configuration SHALL sort by the
 * category field in ASC direction, not by the value/measure field.
 *
 * **Validates: Requirements 6.5**
 */
describe('QuickSight Sheet Builders — Property-Based Tests (Property 4)', () => {
  /** Columns that have a natural ordering and must be sorted by category ASC */
  const NATURALLY_ORDERED_COLUMNS = ['rank_reyached', 'level_id', 'tutorial_screen_id', 'app_version', 'user_rating'];

  /**
   * Extracts the category column name from a barChartVisual's field wells.
   * Returns undefined if the visual has no category dimension.
   */
  function getCategoryColumnName(barChartVisual: Record<string, any>): string | undefined {
    const fieldWells = barChartVisual.chartConfiguration?.fieldWells?.barChartAggregatedFieldWells;
    if (!fieldWells?.category?.[0]) return undefined;
    const categoryField = fieldWells.category[0];
    return categoryField.categoricalDimensionField?.column?.columnName;
  }

  /**
   * Extracts the category field ID from a barChartVisual's field wells.
   */
  function getCategoryFieldId(barChartVisual: Record<string, any>): string | undefined {
    const fieldWells = barChartVisual.chartConfiguration?.fieldWells?.barChartAggregatedFieldWells;
    if (!fieldWells?.category?.[0]) return undefined;
    const categoryField = fieldWells.category[0];
    return categoryField.categoricalDimensionField?.fieldId;
  }

  /**
   * Extracts the value (measure) field ID from a barChartVisual's field wells.
   */
  function getValueFieldId(barChartVisual: Record<string, any>): string | undefined {
    const fieldWells = barChartVisual.chartConfiguration?.fieldWells?.barChartAggregatedFieldWells;
    if (!fieldWells?.values?.[0]) return undefined;
    const valueField = fieldWells.values[0];
    return valueField.numericalMeasureField?.fieldId;
  }

  /**
   * Extracts the categorySort configuration from a barChartVisual.
   * Returns the first fieldSort entry in categorySort, or undefined.
   */
  function getCategorySortConfig(
    barChartVisual: Record<string, any>,
  ): { fieldId: string; direction: string } | undefined {
    const sortConfig = barChartVisual.chartConfiguration?.sortConfiguration;
    if (!sortConfig?.categorySort?.[0]?.fieldSort) return undefined;
    return sortConfig.categorySort[0].fieldSort;
  }

  test('naturally-ordered dimensions sort by category field ASC for any valid dataSetIdentifiers', () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildPulseSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildMonetizationSheet(dataSetIdentifiers) as Record<string, any>,
          buildSentimentSheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const visuals = sheet.visuals as Record<string, any>[];

          for (const visual of visuals) {
            // Only check barChartVisual instances
            if (!visual.barChartVisual) continue;

            const barChart = visual.barChartVisual;
            const categoryColumnName = getCategoryColumnName(barChart);

            // Skip visuals whose category is not a naturally-ordered column
            if (!categoryColumnName || !NATURALLY_ORDERED_COLUMNS.includes(categoryColumnName)) continue;

            const categoryFieldId = getCategoryFieldId(barChart);
            const valueFieldId = getValueFieldId(barChart);
            const sortConfig = getCategorySortConfig(barChart);

            // Sort configuration must exist
            expect(sortConfig).toBeDefined();
            if (!sortConfig) return; // guard for type narrowing

            // Sort must be by the category field ID, NOT the value field ID
            expect(sortConfig.fieldId).toBe(categoryFieldId);
            expect(sortConfig.fieldId).not.toBe(valueFieldId);

            // Sort direction must be ASC to preserve natural order
            expect(sortConfig.direction).toBe('ASC');
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
