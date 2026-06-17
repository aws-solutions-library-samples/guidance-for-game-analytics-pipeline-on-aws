import * as fc from 'fast-check';
import {
  buildKpiVisual,
  buildLineChartVisual,
  buildBarChartVisual,
  buildDonutChartVisual,
  buildMultiMeasureTableVisual,
  buildPivotTableVisual,
  buildSortedBarChartVisual,
  buildTableVisual,
  buildVerticalBarChartVisual,
} from '../constructs/quicksight-visual-helpers';

/**
 * Property 4: Visual helper functions produce valid CloudFormation visual definitions
 *
 * For any valid inputs to a Visual_Helper function, the returned object SHALL be a valid
 * QuickSight visual definition compatible with CfnTemplate.definition.sheets[].visuals,
 * containing correctly structured field wells, a visible title, and appropriate sort configuration.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */

const arbId = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,20}$/);
const arbAggregation = fc.constantFrom('SUM' as const, 'COUNT' as const, 'AVERAGE' as const);

describe('QuickSight Visual Helpers — Property-Based Tests (Property 4)', () => {
  /**
   * buildKpiVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.1, 3.7**
   */
  test('buildKpiVisual produces a valid KPI visual definition for any valid inputs', () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbAggregation,
        (visualId, title, dataSetIdentifier, measureFieldId, measureColumn, aggregation) => {
          const result = buildKpiVisual(
            visualId,
            title,
            dataSetIdentifier,
            measureFieldId,
            measureColumn,
            aggregation,
          ) as any;

          expect(result).toHaveProperty('kpiVisual');
          expect(Object.keys(result)).toEqual(['kpiVisual']);

          const kpi = result.kpiVisual;

          expect(kpi.visualId).toBe(visualId);

          expect(kpi.title.visibility).toBe('VISIBLE');
          expect(kpi.title.formatText.plainText).toBe(title);

          const values = kpi.chartConfiguration.fieldWells.values;
          expect(values).toBeDefined();
          expect(values.length).toBeGreaterThan(0);

          const measure = values[0].numericalMeasureField;
          expect(measure.fieldId).toBe(measureFieldId);
          expect(measure.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(measure.column.columnName).toBe(measureColumn);
          expect(measure.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * buildLineChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.2, 3.7**
   */
  test('buildLineChartVisual produces a valid line chart visual definition for any valid inputs', () => {
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
            visualId,
            title,
            dataSetIdentifier,
            dateFieldId,
            dateColumn,
            valueFieldId,
            valueColumn,
            aggregation,
          ) as any;

          expect(result).toHaveProperty('lineChartVisual');
          expect(Object.keys(result)).toEqual(['lineChartVisual']);

          const chart = result.lineChartVisual;

          expect(chart.visualId).toBe(visualId);

          expect(chart.title.visibility).toBe('VISIBLE');
          expect(chart.title.formatText.plainText).toBe(title);

          const fieldWells = chart.chartConfiguration.fieldWells.lineChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          const categoryField = fieldWells.category[0].dateDimensionField;
          expect(categoryField.fieldId).toBe(dateFieldId);
          expect(categoryField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(categoryField.column.columnName).toBe(dateColumn);

          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.fieldId).toBe(valueFieldId);
          expect(valueField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(valueField.column.columnName).toBe(valueColumn);
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * buildBarChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.3, 3.7**
   */
  test('buildBarChartVisual produces a valid bar chart visual definition for any valid inputs', () => {
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
        (
          visualId,
          title,
          dataSetIdentifier,
          categoryFieldId,
          categoryColumn,
          valueFieldId,
          valueColumn,
          aggregation,
        ) => {
          const result = buildBarChartVisual(
            visualId,
            title,
            dataSetIdentifier,
            categoryFieldId,
            categoryColumn,
            valueFieldId,
            valueColumn,
            aggregation,
          ) as any;

          expect(result).toHaveProperty('barChartVisual');
          expect(Object.keys(result)).toEqual(['barChartVisual']);

          const chart = result.barChartVisual;

          expect(chart.visualId).toBe(visualId);

          expect(chart.title.visibility).toBe('VISIBLE');
          expect(chart.title.formatText.plainText).toBe(title);

          const fieldWells = chart.chartConfiguration.fieldWells.barChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          const categoryField = fieldWells.category[0].categoricalDimensionField;
          expect(categoryField.fieldId).toBe(categoryFieldId);
          expect(categoryField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(categoryField.column.columnName).toBe(categoryColumn);

          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.fieldId).toBe(valueFieldId);
          expect(valueField.column.dataSetIdentifier).toBe(dataSetIdentifier);
          expect(valueField.column.columnName).toBe(valueColumn);
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * buildDonutChartVisual: returns object with correct top-level key, visualId, visible title, and non-empty field wells
   *
   * **Validates: Requirements 3.4, 3.7**
   */
  test('buildDonutChartVisual produces a valid donut chart visual definition for any valid inputs', () => {
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
            visualId,
            title,
            dataSetIdentifier,
            categoryFieldId,
            categoryColumn,
            valueFieldId,
            valueColumn,
            'SUM',
          ) as any;

          expect(result).toHaveProperty('pieChartVisual');
          expect(Object.keys(result)).toEqual(['pieChartVisual']);

          const chart = result.pieChartVisual;

          expect(chart.visualId).toBe(visualId);

          expect(chart.title.visibility).toBe('VISIBLE');
          expect(chart.title.formatText.plainText).toBe(title);

          const fieldWells = chart.chartConfiguration.fieldWells.pieChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          expect(chart.chartConfiguration.donutOptions).toBeDefined();
        },
      ),
      { numRuns: 20 },
    );
  });

  test('buildTableVisual produces a valid table visual definition for any valid inputs', () => {
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
        arbId,
        arbId,
        (
          visualId,
          title,
          dataSetIdentifier,
          groupFieldId,
          groupColumn,
          measureFieldId,
          measureColumn,
          aggregation,
          measureLabel,
          groupLabel,
        ) => {
          const result = buildTableVisual(
            visualId,
            title,
            dataSetIdentifier,
            groupFieldId,
            groupColumn,
            measureFieldId,
            measureColumn,
            aggregation,
            measureLabel,
            groupLabel,
          ) as any;

          expect(result).toHaveProperty('tableVisual');
          expect(Object.keys(result)).toEqual(['tableVisual']);

          const table = result.tableVisual;
          expect(table.visualId).toBe(visualId);
          expect(table.title.visibility).toBe('VISIBLE');
          expect(table.title.formatText.plainText).toBe(title);

          const wells = table.chartConfiguration.fieldWells.tableAggregatedFieldWells;
          expect(wells.groupBy.length).toBeGreaterThan(0);
          expect(wells.values.length).toBeGreaterThan(0);
          expect(table.chartConfiguration.fieldOptions.selectedFieldOptions).toHaveLength(2);
        },
      ),
      { numRuns: 20 },
    );
  });

  test('buildMultiMeasureTableVisual produces a valid multi-measure table visual definition', () => {
    fc.assert(
      fc.property(arbId, arbId, arbId, arbId, arbId, (visualId, title, dataSetIdentifier, groupFieldId, groupColumn) => {
        const result = buildMultiMeasureTableVisual(
          visualId,
          title,
          dataSetIdentifier,
          groupFieldId,
          groupColumn,
          [
            { fieldId: 'm1', columnName: 'event_count', aggregation: 'SUM', label: 'Matches' },
            { fieldId: 'm2', columnName: 'win_pct_value', aggregation: 'AVERAGE', label: 'Avg Win %' },
          ],
          'Spell',
        ) as any;

        expect(result).toHaveProperty('tableVisual');
        expect(result.tableVisual.chartConfiguration.fieldWells.tableAggregatedFieldWells.values).toHaveLength(2);
      }),
      { numRuns: 20 },
    );
  });

  test('buildPivotTableVisual produces a valid pivot table visual definition', () => {
    fc.assert(
      fc.property(
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        arbId,
        (visualId, title, dataSetIdentifier, rowFieldId, rowColumn, columnFieldId, columnColumn, valueFieldId, valueColumn) => {
          const result = buildPivotTableVisual(
            visualId,
            title,
            dataSetIdentifier,
            rowFieldId,
            rowColumn,
            columnFieldId,
            columnColumn,
            valueFieldId,
            valueColumn,
            'SUM',
          ) as any;

          expect(result).toHaveProperty('pivotTableVisual');
          expect(result.pivotTableVisual.chartConfiguration.fieldWells.pivotTableAggregatedFieldWells.rows).toHaveLength(1);
          expect(result.pivotTableVisual.chartConfiguration.fieldWells.pivotTableAggregatedFieldWells.columns).toHaveLength(1);
          expect(result.pivotTableVisual.chartConfiguration.fieldWells.pivotTableAggregatedFieldWells.values).toHaveLength(1);
        },
      ),
      { numRuns: 20 },
    );
  });
});

/**
 * Property-based tests for sort-aware bar chart helpers.
 *
 * Tests validate: correct top-level key, visualId matches input, title is visible,
 * field wells are non-empty, and aggregation/sort matches input.
 *
 * **Validates: Requirements 6.5**
 */
describe('QuickSight Visual Helpers — Sorted Bar Chart Property-Based Tests', () => {
  const arbSortDirection = fc.constantFrom('ASC' as const, 'DESC' as const);

  /**
   * buildSortedBarChartVisual: returns a barChartVisual sorted by category field
   *
   * **Validates: Requirements 6.5**
   */
  test('buildSortedBarChartVisual produces a valid bar chart sorted by category field', () => {
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
        arbSortDirection,
        (
          visualId,
          title,
          dataSetIdentifier,
          categoryFieldId,
          categoryColumn,
          valueFieldId,
          valueColumn,
          aggregation,
          sortDirection,
        ) => {
          const result = buildSortedBarChartVisual(
            visualId,
            title,
            dataSetIdentifier,
            categoryFieldId,
            categoryColumn,
            valueFieldId,
            valueColumn,
            aggregation,
            sortDirection,
          ) as any;

          expect(result).toHaveProperty('barChartVisual');
          expect(Object.keys(result)).toEqual(['barChartVisual']);

          const chart = result.barChartVisual;

          expect(chart.visualId).toBe(visualId);

          expect(chart.title.visibility).toBe('VISIBLE');
          expect(chart.title.formatText.plainText).toBe(title);

          const fieldWells = chart.chartConfiguration.fieldWells.barChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          const sortConfig = chart.chartConfiguration.sortConfiguration.categorySort;
          expect(sortConfig).toBeDefined();
          expect(sortConfig.length).toBeGreaterThan(0);
          expect(sortConfig[0].fieldSort.fieldId).toBe(categoryFieldId);
          expect(sortConfig[0].fieldSort.direction).toBe(sortDirection);

          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * buildVerticalBarChartVisual: returns a barChartVisual with VERTICAL orientation sorted by category
   *
   * **Validates: Requirements 6.5**
   */
  test('buildVerticalBarChartVisual produces a valid vertical bar chart sorted by category', () => {
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
        arbSortDirection,
        (
          visualId,
          title,
          dataSetIdentifier,
          categoryFieldId,
          categoryColumn,
          valueFieldId,
          valueColumn,
          aggregation,
          sortDirection,
        ) => {
          const result = buildVerticalBarChartVisual(
            visualId,
            title,
            dataSetIdentifier,
            categoryFieldId,
            categoryColumn,
            valueFieldId,
            valueColumn,
            aggregation,
            sortDirection,
          ) as any;

          expect(result).toHaveProperty('barChartVisual');
          expect(Object.keys(result)).toEqual(['barChartVisual']);

          const chart = result.barChartVisual;

          expect(chart.visualId).toBe(visualId);

          expect(chart.title.visibility).toBe('VISIBLE');
          expect(chart.title.formatText.plainText).toBe(title);

          expect(chart.chartConfiguration.orientation).toBe('VERTICAL');

          const fieldWells = chart.chartConfiguration.fieldWells.barChartAggregatedFieldWells;
          expect(fieldWells.category.length).toBeGreaterThan(0);
          expect(fieldWells.values.length).toBeGreaterThan(0);

          const sortConfig = chart.chartConfiguration.sortConfiguration.categorySort;
          expect(sortConfig).toBeDefined();
          expect(sortConfig.length).toBeGreaterThan(0);
          expect(sortConfig[0].fieldSort.fieldId).toBe(categoryFieldId);
          expect(sortConfig[0].fieldSort.direction).toBe(sortDirection);

          const valueField = fieldWells.values[0].numericalMeasureField;
          expect(valueField.aggregationFunction.simpleNumericalAggregation).toBe(aggregation);
        },
      ),
      { numRuns: 20 },
    );
  });
});
