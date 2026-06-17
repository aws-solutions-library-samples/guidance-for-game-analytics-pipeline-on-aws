/**
 * QuickSight Visual Definition Helpers
 *
 * Reusable TypeScript functions that generate CloudFormation visual definition
 * objects for CfnDashboard.definition.sheets[].visuals[].
 */

function col(dataSetIdentifier: string, columnName: string) {
  return { dataSetIdentifier, columnName };
}

export type DateGranularity = 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

function categoricalDimField(fieldId: string, dataSetIdentifier: string, columnName: string): object {
  return {
    categoricalDimensionField: {
      fieldId,
      column: col(dataSetIdentifier, columnName),
    },
  };
}

function numericalMeasureField(
  fieldId: string,
  dataSetIdentifier: string,
  columnName: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
): object {
  return {
    numericalMeasureField: {
      fieldId,
      column: col(dataSetIdentifier, columnName),
      aggregationFunction: { simpleNumericalAggregation: aggregation },
    },
  };
}

// Shared bar-chart visual body. Three exported bar-chart variants
// (HORIZONTAL/value-sort, HORIZONTAL/category-sort, VERTICAL/category-sort) only
// vary by orientation, sortFieldId, and sortDirection; everything else is identical.
type BarChartObjectArgs = {
  visualId: string;
  title: string;
  dataSetIdentifier: string;
  categoryFieldId: string;
  categoryColumn: string;
  valueFieldId: string;
  valueColumn: string;
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE';
  orientation: 'HORIZONTAL' | 'VERTICAL';
  sortFieldId: string;
  sortDirection: 'ASC' | 'DESC';
};

function barChartObject(args: BarChartObjectArgs): object {
  return {
    barChartVisual: {
      visualId: args.visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: args.title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: args.orientation,
        fieldWells: {
          barChartAggregatedFieldWells: {
            category: [categoricalDimField(args.categoryFieldId, args.dataSetIdentifier, args.categoryColumn)],
            values: [
              numericalMeasureField(args.valueFieldId, args.dataSetIdentifier, args.valueColumn, args.aggregation),
            ],
            colors: [],
          },
        },
        sortConfiguration: {
          categorySort: [{ fieldSort: { fieldId: args.sortFieldId, direction: args.sortDirection } }],
        },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

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

export function buildLineChartVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  dateFieldId: string,
  dateColumn: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  dateGranularity: DateGranularity = 'DAY',
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
                  dateGranularity,
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
  return barChartObject({
    visualId,
    title,
    dataSetIdentifier,
    categoryFieldId,
    categoryColumn,
    valueFieldId,
    valueColumn,
    aggregation,
    orientation: 'HORIZONTAL',
    sortFieldId: valueFieldId,
    sortDirection: 'DESC',
  });
}

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
  return barChartObject({
    visualId,
    title,
    dataSetIdentifier,
    categoryFieldId,
    categoryColumn,
    valueFieldId,
    valueColumn,
    aggregation,
    orientation: 'HORIZONTAL',
    sortFieldId: categoryFieldId,
    sortDirection,
  });
}

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
  return barChartObject({
    visualId,
    title,
    dataSetIdentifier,
    categoryFieldId,
    categoryColumn,
    valueFieldId,
    valueColumn,
    aggregation,
    orientation: 'VERTICAL',
    sortFieldId: categoryFieldId,
    sortDirection,
  });
}

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
  dateGranularity: DateGranularity = 'WEEK',
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
                dateGranularity,
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
          // sparkline render config — required for the trend line to actually
          // appear; without this, only the comparison percentage shows.
          sparkline: {
            visibility: 'VISIBLE',
            type: 'LINE',
            tooltipVisibility: 'VISIBLE',
          },
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
  dateGranularity: DateGranularity = 'WEEK',
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
                dateGranularity,
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
          // sparkline render config — required for the trend line to render.
          sparkline: {
            visibility: 'VISIBLE',
            type: 'LINE',
            tooltipVisibility: 'VISIBLE',
          },
        },
      },
    },
  };
}

/**
 * Funnel chart — the visual shape itself tells the drop-off story.
 * Wide at top → narrow at bottom = players lost at each stage.
 *
 * Sort logic:
 *   - sortByCategory=false (default): sort by value field DESC. Use for natural
 *     funnels where each stage is a strict subset of the prior (e.g. matchmaking_start
 *     → matchmaking_complete → match_start → match_end). Biggest stage on top.
 *   - sortByCategory=true: sort by category field ASC. Use when the category column
 *     is naturally ordered (e.g. tutorial_screen_id values "1_INTRO" < "2_MOVEMENT"
 *     < "3_WEAPONS" < "4_FINISH") and stages may have ties or non-monotonic counts.
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
  sortByCategory: boolean = false,
): object {
  const sortFieldId = sortByCategory ? categoryFieldId : valueFieldId;
  const sortDirection: 'ASC' | 'DESC' = sortByCategory ? 'ASC' : 'DESC';
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
          categorySort: [{ fieldSort: { fieldId: sortFieldId, direction: sortDirection } }],
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

export function buildGaugeWithTargetVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  valueFieldId: string,
  valueColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  targetFieldId: string,
  targetColumn: string,
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
          targetValues: [
            {
              numericalMeasureField: {
                fieldId: targetFieldId,
                column: col(dataSetIdentifier, targetColumn),
                aggregationFunction: { simpleNumericalAggregation: 'AVERAGE' },
              },
            },
          ],
        },
        gaugeChartOptions: {
          arc: { arcAngle: 270, arcThickness: 'MEDIUM' },
          primaryValueDisplayType: 'ACTUAL',
          primaryValueFontConfiguration: { fontSize: { relative: 'LARGE' } },
        },
      },
    },
  };
}

/**
 * Geospatial filled map (choropleth) — colors countries by event volume.
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
            geospatial: [categoricalDimField(geoFieldId, dataSetIdentifier, geoColumn)],
            values: [numericalMeasureField(valueFieldId, dataSetIdentifier, valueColumn, aggregation)],
            colors: [],
          },
        },
        legend: { visibility: 'VISIBLE', position: 'BOTTOM' },
        mapStyleOptions: { baseMapStyle: 'LIGHT_GRAY' },
      },
    },
  };
}

/**
 * Heat map — matrix of two categorical dimensions with color intensity for the measure.
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
                  column: col(dataSetIdentifier, rowColumn),
                },
              },
            ],
            columns: [
              {
                categoricalDimensionField: {
                  fieldId: columnFieldId,
                  column: col(dataSetIdentifier, columnColumn),
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

/**
 * Tree map — proportional tiles for "scarcity at a glance" stories. Native QuickSight
 * equivalent of a Highcharts packed bubble for showing rarity hierarchy by tile size.
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
        },
        groupLabelOptions: { visibility: 'VISIBLE' },
        sizeLabelOptions: { visibility: 'VISIBLE' },
        dataLabels: { visibility: 'VISIBLE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

export function buildTableVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  groupFieldId: string,
  groupColumn: string,
  measureFieldId: string,
  measureColumn: string,
  aggregation: 'SUM' | 'COUNT' | 'AVERAGE',
  measureLabel: string,
  groupLabel: string,
): object {
  return {
    tableVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          tableAggregatedFieldWells: {
            groupBy: [
              {
                categoricalDimensionField: {
                  fieldId: groupFieldId,
                  column: col(dataSetIdentifier, groupColumn),
                },
              },
            ],
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
        sortConfiguration: {
          rowSort: [{ fieldSort: { fieldId: measureFieldId, direction: 'DESC' } }],
          paginationConfiguration: { pageSize: 100, pageNumber: 1 },
        },
        fieldOptions: {
          selectedFieldOptions: [
            { fieldId: groupFieldId, customLabel: groupLabel, visibility: 'VISIBLE', width: '220px' },
            { fieldId: measureFieldId, customLabel: measureLabel, visibility: 'VISIBLE', width: '120px' },
          ],
        },
        tableOptions: {
          headerStyle: {
            backgroundColor: '#232F3E',
            fontConfiguration: { fontColor: '#FFFFFF', fontWeight: { name: 'BOLD' } },
            horizontalTextAlignment: 'LEFT',
          },
          cellStyle: {
            horizontalTextAlignment: 'LEFT',
          },
        },
        totalOptions: {
          totalsVisibility: 'VISIBLE',
          placement: 'END',
          customLabel: 'Total',
        },
      },
    },
  };
}

export function buildMultiMeasureTableVisual(
  visualId: string,
  title: string,
  dataSetIdentifier: string,
  groupFieldId: string,
  groupColumn: string,
  measures: Array<{
    fieldId: string;
    columnName: string;
    aggregation: 'SUM' | 'COUNT' | 'AVERAGE';
    label: string;
    width?: string;
  }>,
  groupLabel: string,
): object {
  return {
    tableVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          tableAggregatedFieldWells: {
            groupBy: [
              {
                categoricalDimensionField: {
                  fieldId: groupFieldId,
                  column: col(dataSetIdentifier, groupColumn),
                },
              },
            ],
            values: measures.map((measure) => ({
              numericalMeasureField: {
                fieldId: measure.fieldId,
                column: col(dataSetIdentifier, measure.columnName),
                aggregationFunction: { simpleNumericalAggregation: measure.aggregation },
              },
            })),
          },
        },
        sortConfiguration: {
          rowSort: [{ fieldSort: { fieldId: measures[0].fieldId, direction: 'DESC' } }],
          paginationConfiguration: { pageSize: 100, pageNumber: 1 },
        },
        fieldOptions: {
          selectedFieldOptions: [
            { fieldId: groupFieldId, customLabel: groupLabel, visibility: 'VISIBLE', width: '180px' },
            ...measures.map((measure) => ({
              fieldId: measure.fieldId,
              customLabel: measure.label,
              visibility: 'VISIBLE' as const,
              width: measure.width ?? '120px',
            })),
          ],
        },
        tableOptions: {
          headerStyle: {
            backgroundColor: '#232F3E',
            fontConfiguration: { fontColor: '#FFFFFF', fontWeight: { name: 'BOLD' } },
            horizontalTextAlignment: 'LEFT',
          },
          cellStyle: {
            horizontalTextAlignment: 'LEFT',
          },
        },
      },
    },
  };
}

export function buildPivotTableVisual(
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
    pivotTableVisual: {
      visualId,
      title: { visibility: 'VISIBLE', formatText: { plainText: title } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          pivotTableAggregatedFieldWells: {
            rows: [categoricalDimField(rowFieldId, dataSetIdentifier, rowColumn)],
            columns: [categoricalDimField(columnFieldId, dataSetIdentifier, columnColumn)],
            values: [numericalMeasureField(valueFieldId, dataSetIdentifier, valueColumn, aggregation)],
          },
        },
        tableOptions: {
          metricPlacement: 'COLUMN',
          singleMetricVisibility: 'VISIBLE',
          columnNamesVisibility: 'VISIBLE',
          rowsLayout: 'TABULAR',
          toggleButtonsVisibility: 'HIDDEN',
        },
        totalOptions: {
          rowTotalOptions: { totalsVisibility: 'VISIBLE', placement: 'END' },
          columnTotalOptions: { totalsVisibility: 'VISIBLE', placement: 'END' },
        },
      },
    },
  };
}
