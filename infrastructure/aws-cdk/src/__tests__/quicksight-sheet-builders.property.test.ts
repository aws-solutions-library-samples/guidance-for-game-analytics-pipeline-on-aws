import * as fc from "fast-check";
import {
  buildOverviewSheet,
  buildCombatSheet,
  buildProgressionSheet,
  buildEconomySheet,
} from "../constructs/quicksight-sheet-builders";

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
  "kpiVisual",
  "lineChartVisual",
  "barChartVisual",
  "tableVisual",
  "pieChartVisual",
  "gaugeChartVisual",
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
  throw new Error(
    `Could not extract visualId from visual object with keys: ${Object.keys(visual).join(", ")}`
  );
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
const REQUIRED_DATASET_KEYS = [
  "all_events",
  "match_events",
  "level_events",
  "economy_events",
  "player_health",
];

/** Generates a non-empty alphanumeric string suitable for DataSet identifier values */
const arbIdentifierValue = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/);

/**
 * Generates a valid dataSetIdentifiers map with all required keys.
 * Values are arbitrary non-empty strings (the sheet builders just pass them through).
 */
const arbDataSetIdentifiers = fc
  .tuple(...REQUIRED_DATASET_KEYS.map(() => arbIdentifierValue))
  .map((values) => {
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

describe("QuickSight Sheet Builders — Property-Based Tests (Property 5)", () => {
  /**
   * Property 5: All visual IDs are unique across the template
   *
   * Calls all four sheet builders with valid dataSetIdentifiers and collects
   * all visualId values from the returned visuals across all sheets.
   * Asserts the set of IDs has no duplicates.
   *
   * **Validates: Requirement 10.1**
   */
  test("all visual IDs are unique across all four sheets for any valid dataSetIdentifiers", () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const overviewSheet = buildOverviewSheet(dataSetIdentifiers) as Record<string, any>;
        const combatSheet = buildCombatSheet(dataSetIdentifiers) as Record<string, any>;
        const progressionSheet = buildProgressionSheet(dataSetIdentifiers) as Record<string, any>;
        const economySheet = buildEconomySheet(dataSetIdentifiers) as Record<string, any>;

        const allVisualIds = [
          ...extractVisualIdsFromSheet(overviewSheet),
          ...extractVisualIdsFromSheet(combatSheet),
          ...extractVisualIdsFromSheet(progressionSheet),
          ...extractVisualIdsFromSheet(economySheet),
        ];

        // Every visual ID should be a non-empty string
        for (const id of allVisualIds) {
          expect(typeof id).toBe("string");
          expect(id.length).toBeGreaterThan(0);
        }

        // The set of IDs should have no duplicates
        const uniqueIds = new Set(allVisualIds);
        expect(uniqueIds.size).toBe(allVisualIds.length);
      }),
      { numRuns: 100 }
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
describe("QuickSight Sheet Builders — Property-Based Tests (Property 7)", () => {
  test("grid layout elements do not overlap within any sheet for any valid dataSetIdentifiers", () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildOverviewSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildEconomySheet(dataSetIdentifiers) as Record<string, any>,
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
      { numRuns: 100 }
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
describe("QuickSight Sheet Builders — Property-Based Tests (Property 8)", () => {
  test("grid layout elements stay within the 32-column boundary for any valid dataSetIdentifiers", () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildOverviewSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildEconomySheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const elements = extractGridElements(sheet);

          for (const el of elements) {
            expect(el.columnIndex + el.columnSpan).toBeLessThanOrEqual(32);
          }
        }
      }),
      { numRuns: 100 }
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
describe("QuickSight Sheet Builders — Property-Based Tests (Property 9)", () => {
  test("every grid layout elementId matches a visualId in the same sheet for any valid dataSetIdentifiers", () => {
    fc.assert(
      fc.property(arbDataSetIdentifiers, (dataSetIdentifiers) => {
        const sheets = [
          buildOverviewSheet(dataSetIdentifiers) as Record<string, any>,
          buildCombatSheet(dataSetIdentifiers) as Record<string, any>,
          buildProgressionSheet(dataSetIdentifiers) as Record<string, any>,
          buildEconomySheet(dataSetIdentifiers) as Record<string, any>,
        ];

        for (const sheet of sheets) {
          const visualIds = new Set(extractVisualIdsFromSheet(sheet));
          const gridElements = extractGridElements(sheet);

          for (const element of gridElements) {
            expect(visualIds).toContain(element.elementId);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
