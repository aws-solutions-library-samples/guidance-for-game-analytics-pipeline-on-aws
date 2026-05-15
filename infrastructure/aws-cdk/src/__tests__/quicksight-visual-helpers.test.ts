import * as fc from "fast-check";
import {
  buildKpiVisual,
  buildLineChartVisual,
  buildBarChartVisual,
  buildTableVisual,
  buildPieChartVisual,
  buildDonutChartVisual,
} from "../constructs/quicksight-visual-helpers";

/**
 * Property 4: Visual helper functions produce valid CloudFormation visual definitions
 *
 * For any valid inputs to a Visual_Helper function, the returned object SHALL be a valid
 * QuickSight visual definition compatible with CfnTemplate.definition.sheets[].visuals,
 * containing correctly structured field wells, a visible title, and appropriate sort configuration.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */

// ---- Shared arbitraries ---- //

/** Generates a non-empty alphanumeric string suitable for IDs and names */
const arbId = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,20}$/);

/** Generates a valid aggregation value for most helpers */
const arbAggregation = fc.constantFrom("SUM" as const, "COUNT" as const, "AVERAGE" as const);

/** Generates a valid aggregation value for pie chart (SUM or COUNT only) */
const arbPieAggregation = fc.constantFrom("SUM" as const, "COUNT" as const);

describe("QuickSight Visual Helpers — Property-Based Tests (Property 4)", () => {
  /**
   * buildKpiVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.1, 3.7**
   */
  test("buildKpiVisual produces a valid KPI visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbAggregation,
        (visualId, title, dataSetIdentifier, measureFieldId, measureColumn, aggregation) => {
          const result = buildKpiVisual(visualId, title, dataSetIdentifier, measureFieldId, measureColumn, aggregation) as any;

          // Correct top-level key exists
          expect(result).toHaveProperty("kpiVisual");
          expect(Object.keys(result)).toEqual(["kpiVisual"]);

          const kpi = result.kpiVisual;

          // visualId matches input
          expect(kpi.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(kpi.title.visibility).toBe("VISIBLE");
          expect(kpi.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — contains at least one measure value
          const values = kpi.chartConfiguration.fieldWells.values;
          expect(values).toBeDefined();
          expect(values.length).toBeGreaterThan(0);

          // Measure field references correct dataSetIdentifier and column
          const measure = values[0].numericalMeasureField;
          expect(measure.fieldId).toBe(measureFieldId);
          expect(measure.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(measure.column.columnName).toBe(measureColumn);
          expect(measure.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * buildLineChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.2, 3.7**
   */
  test("buildLineChartVisual produces a valid line chart visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbAggregation,
        (visualId, title, dataSetIdentifier, dateFieldId, dateColumn, valueFieldId, valueColumn, aggregation) => {
          const result = buildLineChartVisual(
            visualId, title, dataSetIdentifier, dateFieldId, dateColumn, valueFieldId, valueColumn, aggregation
          ) as any;

          // Correct top-level key exists
          expect(result).toHaveProperty("lineChartVisual");
          expect(Object.keys(result)).toEqual(["lineChartVisual"]);

          const chart = result.lineChartVisual;

          // visualId matches input
          expect(chart.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(chart.title.visibility).toBe("VISIBLE");
          expect(chart.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — category and values exist
          const fieldWells = chart.chartConfiguration.fieldWells.lineChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          // Category field references correct inputs
          const categoryField = fieldWells.category[0].dateDimensionField;
          expect(categoryField.fieldId).toBe(dateFieldId);
          expect(categoryField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(categoryField.column.columnName).toBe(dateColumn);

          // Value field references correct inputs
          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.fieldId).toBe(valueFieldId);
          expect(valueField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(valueField.column.columnName).toBe(valueColumn);
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * buildBarChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.3, 3.7**
   */
  test("buildBarChartVisual produces a valid bar chart visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbAggregation,
        (visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, aggregation) => {
          const result = buildBarChartVisual(
            visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, aggregation
          ) as any;

          // Correct top-level key exists
          expect(result).toHaveProperty("barChartVisual");
          expect(Object.keys(result)).toEqual(["barChartVisual"]);

          const chart = result.barChartVisual;

          // visualId matches input
          expect(chart.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(chart.title.visibility).toBe("VISIBLE");
          expect(chart.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — category and values exist
          const fieldWells = chart.chartConfiguration.fieldWells.barChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          // Category field uses categoricalDimensionField
          const categoryField = fieldWells.category[0].categoricalDimensionField;
          expect(categoryField.fieldId).toBe(categoryFieldId);
          expect(categoryField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(categoryField.column.columnName).toBe(categoryColumn);

          // Value field references correct inputs
          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.fieldId).toBe(valueFieldId);
          expect(valueField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(valueField.column.columnName).toBe(valueColumn);
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * buildDonutChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.4, 3.7**
   */
  test("buildDonutChartVisual produces a valid donut chart visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        (visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn) => {
          const result = buildDonutChartVisual(
            visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, "SUM"
          ) as any;

          // Correct top-level key
          expect(result).toHaveProperty("pieChartVisual");
          expect(Object.keys(result)).toEqual(["pieChartVisual"]);

          const chart = result.pieChartVisual;

          // visualId matches input
          expect(chart.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(chart.title.visibility).toBe("VISIBLE");
          expect(chart.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — category and values exist
          const fieldWells = chart.chartConfiguration.fieldWells.pieChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          // Donut options present
          expect(chart.chartConfiguration.donutOptions).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * buildTableVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.5, 3.7**
   */
  test("buildTableVisual produces a valid table visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        fc.array(
          fc.record({
            fieldId: arbId,
            columnName: arbId,
          }),
          { minLength: 1, maxLength: 8 }
        ),
        (visualId, title, dataSetIdentifier, columns) => {
          const result = buildTableVisual(visualId, title, dataSetIdentifier, columns) as any;

          // Correct top-level key exists
          expect(result).toHaveProperty("tableVisual");
          expect(Object.keys(result)).toEqual(["tableVisual"]);

          const table = result.tableVisual;

          // visualId matches input
          expect(table.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(table.title.visibility).toBe("VISIBLE");
          expect(table.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — groupBy has all columns
          const fieldWells = table.chartConfiguration.fieldWells.tableAggregatedFieldWells;
          expect(fieldWells.groupBy.length).toBe(columns.length);

          // Each groupBy field maps correctly
          for (let i = 0; i < columns.length; i++) {
            const groupByField = fieldWells.groupBy[i].categoricalDimensionField;
            expect(groupByField.fieldId).toBe(columns[i].fieldId);
            expect(groupByField.column.dataSetIdentifier).toBe(dataSetIdentifier);
            expect(groupByField.column.columnName).toBe(columns[i].columnName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * buildPieChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.6, 3.7**
   */
  test("buildPieChartVisual produces a valid pie chart visual definition for any valid inputs", () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbPieAggregation,
        (visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, aggregation) => {
          const result = buildPieChartVisual(
            visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, aggregation
          ) as any;

          // Correct top-level key exists
          expect(result).toHaveProperty("pieChartVisual");
          expect(Object.keys(result)).toEqual(["pieChartVisual"]);

          const chart = result.pieChartVisual;

          // visualId matches input
          expect(chart.visualId).toBe(visualId);

          // Title is visible with correct text
          expect(chart.title.visibility).toBe("VISIBLE");
          expect(chart.title.formatText.plainText).toBe(title);

          // Field wells are non-empty — category and values exist
          const fieldWells = chart.chartConfiguration.fieldWells.pieChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          // Category field uses categoricalDimensionField
          const categoryField = fieldWells.category[0].categoricalDimensionField;
          expect(categoryField.fieldId).toBe(categoryFieldId);
          expect(categoryField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(categoryField.column.columnName).toBe(categoryColumn);

          // Value field references correct inputs
          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.fieldId).toBe(valueFieldId);
          expect(valueField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(valueField.column.columnName).toBe(valueColumn);
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        }
      ),
      { numRuns: 100 }
    );
  });
});
