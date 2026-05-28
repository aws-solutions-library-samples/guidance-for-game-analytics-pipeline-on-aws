/**
 * QuickSight Visual Definition Helpers
 *
 * Reusable TypeScript functions that generate CloudFormation visual definition
 * objects for CfnDashboard.definition.sheets[].visuals[].
 *
 * Data Storytelling Visual Library:
 * - KPI with sparklines (directional context — "are we growing?")
 * - Funnel charts (drop-off narrative — "where do we lose players?")
 * - Combo charts (correlation — "how do volume and rate relate?")
 * - Tree maps (hierarchical composition — "what's the biggest slice?")
 * - Stacked bars with color (composition by group — "is it balanced?")
 * - Gauge charts (target progress — "are we hitting our goal?")
 * - Area/Line/Bar/Donut (standard storytelling toolkit)
 */

// ---- Column reference helper ---- //

function col(dataSetIdentifier: string, columnName: string) {
  return { dataSetIdentifier, columnName };
}

// ---- KPI Visual (Distinct Count) ---- //

export function buildDistinctCountKpiVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  measureFieldId: string,
  measureColumn: string,
): object {
  return {
    kpiVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          values: [
            {
              categoricalMeasureField: {
                fieldId: measureFieldId,
                column: col(dataSetIdentifier, measureColumn),
                aggregationFunction: 'DISTINCT_COUNT',
              },
            },
          ],
        },
      },
    },
  };
}

// ---- KPI Visual ---- //

export function buildKpiVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  measureFieldId: string,
  measureColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    kpiVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
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
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    lineChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        type: 'AREA',
        fieldWells: {
          lineChartAggregatedFieldWells: {
            category: [
              {
                dateDimensionField: {
                  fieldId: dateFieldId,
                  column: col(dataSetIdentifier, dateColumn),
                  dateGranularity: 'WEEK',
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
          categorySort: [{ fieldSort: { fieldId: dateFieldId, direction: 'ASC' } }],
        },
        xAxisDisplayOptions: {
          axisLineVisibility: 'VISIBLE',
          tickLabelOptions: { visibility: 'VISIBLE' },
        },
        yAxisDisplayOptions: {
          axisLineVisibility: 'VISIBLE',
        },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

// ---- Stacked Area Chart (multi-series) ---- //

export function buildStackedAreaChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  dateFieldId: string,
  dateColumn: string,
  valueFieldId: string,
  valueColumn: string,
  colorFieldId: string,
  colorColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    lineChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        type: 'STACKED_AREA',
        fieldWells: {
          lineChartAggregatedFieldWells: {
            category: [
              {
                dateDimensionField: {
                  fieldId: dateFieldId,
                  column: col(dataSetIdentifier, dateColumn),
                  dateGranularity: 'DAY',
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
            colors: [
              {
                categoricalDimensionField: {
                  fieldId: colorFieldId,
                  column: col(dataSetIdentifier, colorColumn),
                },
              },
            ],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: dateFieldId, direction: 'ASC' } }],
        },
        xAxisDisplayOptions: {
          axisLineVisibility: 'VISIBLE',
          tickLabelOptions: { visibility: 'VISIBLE' },
        },
        yAxisDisplayOptions: {
          axisLineVisibility: 'VISIBLE',
        },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
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
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    lineChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          lineChartAggregatedFieldWells: {
            category: [
              {
                dateDimensionField: {
                  fieldId: dateFieldId,
                  column: col(dataSetIdentifier, dateColumn),
                  dateGranularity: 'DAY',
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
          categorySort: [{ fieldSort: { fieldId: dateFieldId, direction: 'ASC' } }],
        },
        xAxisDisplayOptions: { axisLineVisibility: 'VISIBLE' },
        yAxisDisplayOptions: { axisLineVisibility: 'VISIBLE' },
        legend: { visibility: 'HIDDEN' },
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
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'HORIZONTAL',
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
          categorySort: [{ fieldSort: { fieldId: valueFieldId, direction: 'DESC' } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'HIDDEN' },
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
  aggregation: 'SUM' | 'COUNT',
): object {
  return {
    pieChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
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
          arcOptions: { arcThickness: 'MEDIUM' },
        },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
        dataLabels: { visibility: 'VISIBLE', labelContent: 'PERCENT' },
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
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    gaugeChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
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
  columns: Array<{ fieldId: string; columnName: string; type?: 'STRING' | 'INTEGER' | 'DECIMAL' | 'DATETIME' }>,
): object {
  return {
    tableVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          tableAggregatedFieldWells: {
            groupBy: columns.map((c) => {
              const t = c.type ?? 'STRING';
              if (t === 'INTEGER' || t === 'DECIMAL') {
                return {
                  numericalDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) },
                };
              }
              if (t === 'DATETIME') {
                return { dateDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) } };
              }
              return {
                categoricalDimensionField: { fieldId: c.fieldId, column: col(dataSetIdentifier, c.columnName) },
              };
            }),
            values: [],
          },
        },
        tableOptions: {
          headerStyle: { backgroundColor: '#232F3E', fontConfiguration: { fontColor: '#FFFFFF' } },
          cellStyle: { border: { uniformBorder: { style: 'SOLID', thickness: 1, color: '#E8E8E8' } } },
        },
      },
    },
  };
}

// ---- Sorted Bar Chart (sort by category field, not value) ---- //

export function buildSortedBarChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  sortDirection: 'ASC' | 'DESC',
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'HORIZONTAL',
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
          categorySort: [{ fieldSort: { fieldId: categoryFieldId, direction: sortDirection } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

// ---- Vertical Bar Chart (histogram-style, sort by category) ---- //

export function buildVerticalBarChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  sortDirection: 'ASC' | 'DESC',
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'VERTICAL',
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
          categorySort: [{ fieldSort: { fieldId: categoryFieldId, direction: sortDirection } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

// ---- Grouped/Stacked Bar Chart (multiple measures on same category axis) ---- //

export function buildGroupedBarChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  values: Array<{ fieldId: string; column: string; aggregation: 'SUM' | 'COUNT' }>,
  orientation: 'HORIZONTAL' | 'VERTICAL',
  sortDirection: 'ASC' | 'DESC',
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation,
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
            values: values.map((v) => ({
              numericalMeasureField: {
                fieldId: v.fieldId,
                column: col(dataSetIdentifier, v.column),
                aggregationFunction: { simpleNumericalAggregation: v.aggregation },
              },
            })),
            colors: [],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: categoryFieldId, direction: sortDirection } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
      },
    },
  };
}

// ---- KPI with Sparkline (directional storytelling) ---- //

/**
 * KPI visual with a sparkline trend line — tells the viewer "is this metric
 * going up or down?" at a glance. Requires a date dimension for trendGroups.
 */
export function buildKpiWithSparklineVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  measureFieldId: string,
  measureColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  trendFieldId: string,
  trendColumn: string,
): object {
  return {
    kpiVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
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
          trendGroups: [
            {
              dateDimensionField: {
                fieldId: trendFieldId,
                column: col(dataSetIdentifier, trendColumn),
                dateGranularity: 'WEEK',
              },
            },
          ],
        },
        kpiOptions: {
          primaryValueDisplayType: 'COMPARISON',
          comparison: {
            comparisonMethod: 'PERCENT_DIFFERENCE',
          },
          primaryValueFontConfiguration: { fontSize: { relative: 'LARGE' } },
        },
      },
    },
  };
}

/**
 * KPI visual with sparkline using DISTINCT_COUNT on a STRING column.
 */
export function buildDistinctCountKpiWithSparklineVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  measureFieldId: string,
  measureColumn: string,
  trendFieldId: string,
  trendColumn: string,
): object {
  return {
    kpiVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          values: [
            {
              categoricalMeasureField: {
                fieldId: measureFieldId,
                column: col(dataSetIdentifier, measureColumn),
                aggregationFunction: 'DISTINCT_COUNT',
              },
            },
          ],
          trendGroups: [
            {
              dateDimensionField: {
                fieldId: trendFieldId,
                column: col(dataSetIdentifier, trendColumn),
                dateGranularity: 'WEEK',
              },
            },
          ],
        },
        kpiOptions: {
          primaryValueDisplayType: 'COMPARISON',
          comparison: {
            comparisonMethod: 'PERCENT_DIFFERENCE',
          },
          primaryValueFontConfiguration: { fontSize: { relative: 'LARGE' } },
        },
      },
    },
  };
}

// ---- Funnel Chart (drop-off storytelling) ---- //

/**
 * Funnel chart — the visual shape itself tells the drop-off story.
 * Wide at top → narrow at bottom = players lost at each stage.
 */
export function buildFunnelChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT',
): object {
  return {
    funnelChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          funnelChartAggregatedFieldWells: {
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
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: categoryFieldId, direction: 'ASC' } }],
        },
        dataLabels: {
          visibility: 'VISIBLE',
          labelContent: 'VALUE_AND_PERCENT',
          categoryLabelVisibility: 'VISIBLE',
          measureLabelVisibility: 'VISIBLE',
        },
      },
    },
  };
}

// ---- Combo Chart (correlation storytelling — bars + line) ---- //

/**
 * Combo chart — bars for volume, line for rate/trend on secondary axis.
 * Answers: "How do these two metrics relate?"
 */
export function buildComboChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  barValueFieldId: string,
  barValueColumn: string,
  barAggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  lineValueFieldId: string,
  lineValueColumn: string,
  lineAggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  categoryType: 'date' | 'categorical' = 'date',
): object {
  const categoryField =
    categoryType === 'date'
      ? {
          dateDimensionField: {
            fieldId: categoryFieldId,
            column: col(dataSetIdentifier, categoryColumn),
            dateGranularity: 'DAY' as const,
          },
        }
      : {
          categoricalDimensionField: {
            fieldId: categoryFieldId,
            column: col(dataSetIdentifier, categoryColumn),
          },
        };

  return {
    comboChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          comboChartAggregatedFieldWells: {
            category: [categoryField],
            barValues: [
              {
                numericalMeasureField: {
                  fieldId: barValueFieldId,
                  column: col(dataSetIdentifier, barValueColumn),
                  aggregationFunction: { simpleNumericalAggregation: barAggregation },
                },
              },
            ],
            lineValues: [
              {
                numericalMeasureField: {
                  fieldId: lineValueFieldId,
                  column: col(dataSetIdentifier, lineValueColumn),
                  aggregationFunction: { simpleNumericalAggregation: lineAggregation },
                },
              },
            ],
            colors: [],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: categoryFieldId, direction: 'ASC' } }],
        },
        barDataLabels: { visibility: 'HIDDEN' },
        lineDataLabels: { visibility: 'HIDDEN' },
        legend: { visibility: 'VISIBLE', position: 'BOTTOM' },
      },
    },
  };
}

// ---- Tree Map (hierarchical composition) ---- //

/**
 * Tree map — shows both volume (size) and a secondary dimension (color grouping).
 * Answers: "What's the biggest slice and what category does it belong to?"
 */
export function buildTreeMapVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  groupFieldId: string,
  groupColumn: string,
  sizeFieldId: string,
  sizeColumn: string,
  aggregation: 'SUM' | 'COUNT',
): object {
  return {
    treeMapVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          treeMapAggregatedFieldWells: {
            groups: [
              {
                categoricalDimensionField: {
                  fieldId: groupFieldId,
                  column: col(dataSetIdentifier, groupColumn),
                },
              },
            ],
            sizes: [
              {
                numericalMeasureField: {
                  fieldId: sizeFieldId,
                  column: col(dataSetIdentifier, sizeColumn),
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
            colors: [],
          },
        },
        sortConfiguration: {
          treeMapSort: [{ fieldSort: { fieldId: sizeFieldId, direction: 'DESC' } }],
          treeMapGroupItemsLimitConfiguration: { itemsLimit: 10, otherCategories: 'INCLUDE' },
        },
        groupLabelOptions: { visibility: 'VISIBLE' },
        sizeLabelOptions: { visibility: 'VISIBLE' },
        dataLabels: { visibility: 'VISIBLE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

// ---- Stacked Bar with Color (composition by group) ---- //

/**
 * Stacked bar chart with a color dimension — shows composition within each category.
 * Answers: "Is it balanced across groups?"
 */
export function buildStackedBarChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  categoryFieldId: string,
  categoryColumn: string,
  valueFieldId: string,
  valueColumn: string,
  colorFieldId: string,
  colorColumn: string,
  aggregation: 'SUM' | 'COUNT',
): object {
  return {
    barChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'HORIZONTAL',
        barsArrangement: 'STACKED',
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
            colors: [
              {
                categoricalDimensionField: {
                  fieldId: colorFieldId,
                  column: col(dataSetIdentifier, colorColumn),
                },
              },
            ],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: valueFieldId, direction: 'DESC' } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'INSIDE' },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
      },
    },
  };
}

// ---- Gauge with Target (progress storytelling) ---- //

/**
 * Gauge chart comparing the metric against itself — instantly communicates
 * the metric value with a visual arc. Use when you want to highlight a single
 * number with more visual weight than a KPI.
 */
export function buildGaugeWithTargetVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    gaugeChartVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
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
        gaugeChartOptions: {
          primaryValueFontConfiguration: { fontSize: { relative: 'LARGE' } },
        },
      },
    },
  };
}

// ---- Filled Map / Geospatial Heatmap (geographic distribution) ---- //

/**
 * Geospatial filled map (choropleth) — colors countries by event volume.
 * Answers: "Where are our players geographically?"
 *
 * QuickSight geospatialMapVisual uses:
 * - geospatial field (country name/code) for location
 * - values field for the color intensity (heatmap effect)
 */
export function buildFilledMapVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  geoFieldId: string,
  geoColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    geospatialMapVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          geospatialMapAggregatedFieldWells: {
            geospatial: [
              {
                categoricalDimensionField: {
                  fieldId: geoFieldId,
                  column: col(dataSetIdentifier, geoColumn),
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
        legend: { visibility: 'VISIBLE', position: 'BOTTOM' },
        mapStyleOptions: { baseMapStyle: 'LIGHT_GRAY' },
      },
    },
  };
}

// ---- Heat Map Visual (matrix heatmap — rows × columns with color intensity) ---- //

/**
 * Heat map visual — shows a matrix of two categorical dimensions with color
 * intensity representing the measure value. Great for geographic or cross-tab analysis.
 *
 * QuickSight heatMapVisual uses:
 * - rows: categorical dimension (e.g., country)
 * - columns: categorical dimension (e.g., platform or event_type)
 * - values: numerical measure for color intensity
 */
export function buildHeatMapVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  rowFieldId: string,
  rowColumn: string,
  columnFieldId: string,
  columnColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    heatMapVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          heatMapAggregatedFieldWells: {
            rows: [
              {
                categoricalDimensionField: {
                  fieldId: rowFieldId,
                  column: { dataSetIdentifier, columnName: rowColumn },
                },
              },
            ],
            columns: [
              {
                categoricalDimensionField: {
                  fieldId: columnFieldId,
                  column: { dataSetIdentifier, columnName: columnColumn },
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: valueFieldId,
                  column: { dataSetIdentifier, columnName: valueColumn },
                  aggregationFunction: { simpleNumericalAggregation: aggregation },
                },
              },
            ],
          },
        },
        sortConfiguration: {
          heatMapRowSort: [{ fieldSort: { fieldId: valueFieldId, direction: 'DESC' } }],
          heatMapRowItemsLimitConfiguration: { itemsLimit: 20, otherCategories: 'EXCLUDE' },
        },
        colorScale: {
          colorFillType: 'GRADIENT',
          colors: [{ color: '#F7FBFF' }, { color: '#2171B5' }, { color: '#08306B' }],
        },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
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
  aggregation: 'SUM' | 'COUNT',
): object {
  return buildDonutChartVisual(
    visualId,
    title,
    dataSetIdentifier,
    categoryFieldId,
    categoryColumn,
    valueFieldId,
    valueColumn,
    aggregation,
  );
}
