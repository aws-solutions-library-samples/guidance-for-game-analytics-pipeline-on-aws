/**
 * QuickSight Visual Definition Helpers
 *
 * Reusable TypeScript functions that generate CloudFormation visual definition
 * objects for CfnDashboard.definition.sheets[].visuals[].
 *
 * Enhanced with:
 * - Donut charts (modern pie alternative)
 * - Area charts (filled line charts)
 * - Gauge charts (for rates/percentages)
 * - Conditional formatting on KPIs
 * - Better axis/legend configuration
 */

// ---- Column reference helper ---- //

function col(dataSetIdentifier: string, columnName: string) {
  return { dataSetIdentifier, columnName };
}

// ---- KPI Visual ---- //

export function buildKpiVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  measureFieldId: string,
  measureColumn: string,
  aggregation: "SUM" | "COUNT" | "AVERAGE",
): object {
  return {
    kpiVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        fieldWells: {
          values: [
            {
              numericalMeasureField: {
                fieldId: measureFieldId,
                column: col(dataSetIdentifier, measureColumn),
                aggregationFunction: { simpleNumericalAggregation: aggregation },
              },
            },
          ],
        },
      },
    },
  };
}

// ---- Area Chart (filled line chart) ---- //

export function buildAreaChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  dateFieldId: string,
  dateColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT" | "AVERAGE",
): object {
  return {
    lineChartVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        type: "AREA",
        fieldWells: {
          lineChartAggregatedFieldWells: {
            category: [
              {
                dateDimensionField: {
                  fieldId: dateFieldId,
                  column: col(dataSetIdentifier, dateColumn),
                  dateGranularity: "MONTH",
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: valueFieldId,
                  column: col(dataSetIdentifier, valueColumn),
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: dateFieldId, direction: "ASC" } }],
        },
        xAxisDisplayOptions: {
          axisLineVisibility: "VISIBLE",
          tickLabelOptions: { visibility: "VISIBLE" },
        },
        yAxisDisplayOptions: {
          axisLineVisibility: "VISIBLE",
        },
        legend: { visibility: "HIDDEN" },
      },
    },
  };
}

// ---- Line Chart ---- //

export function buildLineChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  dateFieldId: string,
  dateColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT" | "AVERAGE",
): object {
  return {
    lineChartVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        fieldWells: {
          lineChartAggregatedFieldWells: {
            category: [
              {
                dateDimensionField: {
                  fieldId: dateFieldId,
                  column: col(dataSetIdentifier, dateColumn),
                  dateGranularity: "DAY",
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: valueFieldId,
                  column: col(dataSetIdentifier, valueColumn),
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: dateFieldId, direction: "ASC" } }],
        },
        xAxisDisplayOptions: { axisLineVisibility: "VISIBLE" },
        yAxisDisplayOptions: { axisLineVisibility: "VISIBLE" },
        legend: { visibility: "HIDDEN" },
      },
    },
  };
}

// ---- Horizontal Bar Chart ---- //

export function buildBarChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT" | "AVERAGE",
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        orientation: "HORIZONTAL",
        fieldWells: {
          barChartAggregatedFieldWells: {
            category: [
              {
                categoricalDimensionField: {
                  fieldId: categoryFieldId,
                  column: col(dataSetIdentifier, categoryColumn),
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: valueFieldId,
                  column: col(dataSetIdentifier, valueColumn),
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
            colors: [],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: valueFieldId, direction: "DESC" } }],
        },
        dataLabels: { visibility: "VISIBLE", position: "OUTSIDE" },
        legend: { visibility: "HIDDEN" },
      },
    },
  };
}

// ---- Donut Chart (modern pie) ---- //

export function buildDonutChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT",
): object {
  return {
    pieChartVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        fieldWells: {
          pieChartAggregatedFieldWells: {
            category: [
              {
                categoricalDimensionField: {
                  fieldId: categoryFieldId,
                  column: col(dataSetIdentifier, categoryColumn),
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: valueFieldId,
                  column: col(dataSetIdentifier, valueColumn),
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
          },
        },
        donutOptions: {
          arcOptions: { arcThickness: "MEDIUM" },
        },
        legend: { visibility: "VISIBLE", position: "RIGHT" },
        dataLabels: { visibility: "VISIBLE", labelContent: "PERCENT" },
      },
    },
  };
}

// ---- Gauge Chart (for rates/percentages) ---- //

export function buildGaugeChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT" | "AVERAGE",
): object {
  return {
    gaugeChartVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        fieldWells: {
          values: [
            {
              numericalMeasureField: {
                fieldId: valueFieldId,
                column: col(dataSetIdentifier, valueColumn),
                aggregationFunction: { simpleNumericalAggregation: aggregation },
              },
            },
          ],
        },
      },
    },
  };
}

// ---- Table Visual ---- //

export function buildTableVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  columns: Array<{ fieldId: string; columnName: string; type?: "STRING" | "INTEGER" | "DECIMAL" | "DATETIME" }>,
): object {
  return {
    tableVisual: {
      visualId,
      title: { visibility: "VISIBLE", formatText: { plainText: title } },
      subtitle: { visibility: "HIDDEN" },
      chartConfiguration: {
        fieldWells: {
          tableAggregatedFieldWells: {
            groupBy: columns.map((c) => {
              const t = c.type ?? "STRING";
              if (t === "INTEGER" || t === "DECIMAL") {
                return { numericalDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) } };
              }
              if (t === "DATETIME") {
                return { dateDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) } };
              }
              return { categoricalDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) } };
            }),
            values: [],
          },
        },
        tableOptions: {
          headerStyle: { backgroundColor: "#232F3E", fontConfiguration: { fontColor: "#FFFFFF" } },
          cellStyle: { border: { uniformBorder: { style: "SOLID", thickness: 1, color: "#E8E8E8" } } },
        },
      },
    },
  };
}

// Keep legacy export for backward compat
export function buildPieChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: "SUM" | "COUNT",
): object {
  return buildDonutChartVisual(visualId, title, dataSetIdentifier, categoryFieldId, categoryColumn, valueFieldId, valueColumn, aggregation);
}
