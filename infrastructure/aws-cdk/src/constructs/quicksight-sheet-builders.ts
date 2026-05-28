/**
 * QuickSight Sheet Builder Functions — Game Analytics Dashboard
 *
 * Data Storytelling Dashboard: Each sheet answers a specific business question
 * using the inverted pyramid pattern (KPI Banner → Trends → Details) combined
 * with narrative visual types that communicate direction, drop-off, correlation,
 * and composition at a glance.
 *
 * Storytelling Principles Applied:
 *   - KPIs with sparklines → "Is this metric going up or down?"
 *   - Funnel charts → "Where do we lose players?"
 *   - Combo charts → "How do volume and rate relate?"
 *   - Stacked bars → "Is it balanced across groups?"
 *   - Tree maps → "What's the biggest contributor?"
 *   - Gauge charts → "Are we hitting our target?"
 *   - Subtitles on every visual → explains what the visual answers
 *
 * Sheets:
 *   1. Pulse — "Is the game healthy today?" (directional KPIs + volume trends)
 *   2. Combat & Balance — "Is the game fair?" (match lifecycle funnel + balance)
 *   3. Onboarding & Progression — "Are players progressing?" (tutorial funnel + level performance)
 *   4. Monetization — "Where does revenue come from?" (conversion funnel + composition)
 *   5. Player Sentiment — "Are players happy?" (satisfaction gauge + trend + reasons)
 */

import {
  buildBarChartVisual,
  buildDistinctCountKpiWithSparklineVisual,
  buildDonutChartVisual,
  buildFunnelChartVisual,
  buildGaugeWithTargetVisual,
  buildHeatMapVisual,
  buildKpiWithSparklineVisual,
  buildLineChartVisual,
  buildSortedBarChartVisual,
  buildStackedAreaChartVisual,
  buildStackedBarChartVisual,
  buildTreeMapVisual,
} from './quicksight-visual-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Subtitle Helper — adds storytelling context to each visual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds a visible subtitle to a visual definition object.
 * Works with any visual type by finding the chart-type wrapper key and
 * setting its subtitle property.
 */
function withSubtitle(visual: object, subtitle: string): object {
  const record = visual as Record<string, Record<string, unknown>>;
  const key = Object.keys(record)[0];
  if (key && record[key]) {
    record[key].subtitle = { visibility: 'VISIBLE', formatText: { plainText: subtitle } };
  }
  return record;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 1: Pulse — "Is the game healthy today?"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Pulse sheet — high-level operational snapshot with directional context.
 *
 * Story: "At a glance, are our key metrics trending up or down?"
 */
export function buildPulseSheet(dataSetIdentifiers: Record<string, string>): object {
  const allEvents = dataSetIdentifiers.all_events;
  const playerHealth = dataSetIdentifiers.player_health;
  const matchEvents = dataSetIdentifiers.match_events;

  const visuals = [
    // KPI row — headline numbers
    withSubtitle(
      buildKpiWithSparklineVisual(
        'pulse-total-events-kpi',
        'Total Events',
        allEvents,
        'pulse-event-count-measure',
        'event_count',
        'SUM',
        'pulse-event-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),
    withSubtitle(
      buildKpiWithSparklineVisual(
        'pulse-new-players-kpi',
        'New Registrations',
        playerHealth,
        'pulse-player-count-measure',
        'event_count',
        'SUM',
        'pulse-player-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),
    withSubtitle(
      buildKpiWithSparklineVisual(
        'pulse-total-matches-kpi',
        'Total Matches',
        matchEvents,
        'pulse-match-count-measure',
        'event_count',
        'SUM',
        'pulse-match-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),

    // Stacked area: App version adoption over time
    withSubtitle(
      buildStackedAreaChartVisual(
        'pulse-app-version-area',
        'App Version Adoption Over Time',
        allEvents,
        'pulse-version-date-dim',
        'event_date',
        'pulse-version-count-val',
        'event_count',
        'pulse-version-color',
        'app_version',
        'SUM',
      ),
      'Are players upgrading to the latest version?',
    ),

    // Platform distribution
    withSubtitle(
      buildBarChartVisual(
        'pulse-platform-bar',
        'Platform Distribution',
        playerHealth,
        'pulse-platform-cat',
        'platform',
        'pulse-platform-count-val',
        'event_count',
        'SUM',
      ),
      'Which platforms drive the most registrations?',
    ),

    // Country distribution — heatmap showing country × platform
    withSubtitle(
      buildHeatMapVisual(
        'pulse-country-heatmap',
        'Player Distribution by Country',
        playerHealth,
        'pulse-country-row',
        'country',
        'pulse-platform-col',
        'platform',
        'pulse-country-count-val',
        'event_count',
        'SUM',
      ),
      'Where are players coming from and on which platforms?',
    ),
  ];

  return {
    sheetId: 'pulse-sheet',
    name: 'Pulse',
    description: 'High-level game health: Are key metrics trending up or down?',
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: 'pulse-total-events-kpi',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 11,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: 'pulse-new-players-kpi',
                elementType: 'VISUAL',
                columnIndex: 11,
                columnSpan: 11,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: 'pulse-total-matches-kpi',
                elementType: 'VISUAL',
                columnIndex: 22,
                columnSpan: 10,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: 'pulse-app-version-area',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 8,
                rowSpan: 12,
              },
              {
                elementId: 'pulse-platform-bar',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 20,
                rowSpan: 12,
              },
              {
                elementId: 'pulse-country-heatmap',
                elementType: 'VISUAL',
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 20,
                rowSpan: 12,
              },
            ],
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 2: Combat & Balance — "Is the game fair?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildCombatSheet(dataSetIdentifiers: Record<string, string>): object {
  const matchEvents = dataSetIdentifiers.match_events;

  const visuals = [
    withSubtitle(
      buildKpiWithSparklineVisual(
        'cb-total-matches-kpi',
        'Total Matches',
        matchEvents,
        'cb-match-count-measure',
        'event_count',
        'SUM',
        'cb-match-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),

    withSubtitle(
      buildFunnelChartVisual(
        'cb-match-lifecycle-funnel',
        'Match Lifecycle Funnel',
        matchEvents,
        'cb-funnel-event-type-cat',
        'event_type',
        'cb-funnel-count-val',
        'event_count',
        'SUM',
      ),
      'Where do players drop out of the match pipeline?',
    ),

    withSubtitle(
      buildStackedBarChartVisual(
        'cb-outcomes-by-map-bar',
        'Match Outcomes by Map',
        matchEvents,
        'cb-map-cat',
        'map_id',
        'cb-map-outcome-val',
        'event_count',
        'cb-outcome-color',
        'match_result',
        'SUM',
      ),
      'Is any map producing unfair win/loss ratios?',
    ),

    withSubtitle(
      buildDonutChartVisual(
        'cb-match-types-donut',
        'Match Types',
        matchEvents,
        'cb-match-type-cat',
        'match_type',
        'cb-match-type-count',
        'event_count',
        'SUM',
      ),
      'Which game modes are most popular?',
    ),

    withSubtitle(
      buildBarChartVisual(
        'cb-spell-knockouts-bar',
        'Spell Knockouts',
        matchEvents,
        'cb-spell-cat',
        'spell_used',
        'cb-spell-count-val',
        'event_count',
        'SUM',
      ),
      'Which spells dominate? Imbalance signals needed nerfs.',
    ),

    withSubtitle(
      buildBarChartVisual(
        'cb-matchmaking-failures-bar',
        'Matchmaking Failure Reasons',
        matchEvents,
        'cb-failure-reason-cat',
        'matching_failed_msg',
        'cb-failure-count-val',
        'event_count',
        'SUM',
      ),
      'Why are players failing to find matches?',
    ),
  ];

  return {
    sheetId: 'combat-sheet',
    name: 'Combat & Balance',
    description: 'Match lifecycle health and game balance across maps, spells, and modes.',
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: 'cb-total-matches-kpi',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 0,
                rowSpan: 10,
              },
              {
                elementId: 'cb-match-lifecycle-funnel',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 10,
                rowSpan: 14,
              },
              {
                elementId: 'cb-outcomes-by-map-bar',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 20,
                rowIndex: 24,
                rowSpan: 12,
              },
              {
                elementId: 'cb-match-types-donut',
                elementType: 'VISUAL',
                columnIndex: 20,
                columnSpan: 12,
                rowIndex: 24,
                rowSpan: 12,
              },
              {
                elementId: 'cb-spell-knockouts-bar',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 36,
                rowSpan: 12,
              },
              {
                elementId: 'cb-matchmaking-failures-bar',
                elementType: 'VISUAL',
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 36,
                rowSpan: 12,
              },
            ],
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 3: Onboarding & Progression — "Are players progressing?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildProgressionSheet(dataSetIdentifiers: Record<string, string>): object {
  const playerHealth = dataSetIdentifiers.player_health;
  const levelEvents = dataSetIdentifiers.level_events;

  const visuals = [
    withSubtitle(
      buildFunnelChartVisual(
        'pr-tutorial-funnel',
        'Tutorial Drop-off Funnel',
        playerHealth,
        'pr-tutorial-screen-cat',
        'tutorial_screen_id',
        'pr-tutorial-count-val',
        'event_count',
        'SUM',
      ),
      'Where do new players abandon the tutorial?',
    ),

    withSubtitle(buildLevelPerformanceVisual(levelEvents), 'Compare starts, completions, and failures per level'),

    withSubtitle(buildCompletionRateComboVisual(levelEvents), 'Bars = total events, Line = completion rate %'),

    withSubtitle(
      buildSortedBarChartVisual(
        'pr-rank-distribution-bar',
        'Rank Distribution',
        playerHealth,
        'pr-rank-cat',
        'rank_reached',
        'pr-rank-count-val',
        'event_count',
        'SUM',
        'ASC',
      ),
      'How far do players progress in the ranking system?',
    ),
  ];

  return {
    sheetId: 'progression-sheet',
    name: 'Onboarding & Progression',
    description: 'Player journey from tutorial through levels to ranked play.',
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: 'pr-tutorial-funnel',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 0,
                rowSpan: 14,
              },
              {
                elementId: 'pr-level-performance-bar',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 14,
                rowSpan: 14,
              },
              {
                elementId: 'pr-completion-combo',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 20,
                rowIndex: 28,
                rowSpan: 14,
              },
              {
                elementId: 'pr-rank-distribution-bar',
                elementType: 'VISUAL',
                columnIndex: 20,
                columnSpan: 12,
                rowIndex: 28,
                rowSpan: 14,
              },
            ],
          },
        },
      },
    ],
  };
}

function buildLevelPerformanceVisual(dataSetIdentifier: string): object {
  return {
    barChartVisual: {
      visualId: 'pr-level-performance-bar',
      title: { visibility: 'VISIBLE', formatText: { plainText: 'Level Performance (Start / Complete / Fail)' } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'HORIZONTAL',
        fieldWells: {
          barChartAggregatedFieldWells: {
            category: [
              {
                categoricalDimensionField: {
                  fieldId: 'pr-level-id-cat',
                  column: { dataSetIdentifier, columnName: 'level_id' },
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: 'pr-level-event-count-val',
                  column: { dataSetIdentifier, columnName: 'event_count' },
                  aggregationFunction: { simpleNumericalAggregation: 'SUM' },
                },
              },
            ],
            colors: [
              {
                categoricalDimensionField: {
                  fieldId: 'pr-event-type-color',
                  column: { dataSetIdentifier, columnName: 'event_type' },
                },
              },
            ],
          },
        },
        sortConfiguration: { categorySort: [{ fieldSort: { fieldId: 'pr-level-id-cat', direction: 'ASC' } }] },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'VISIBLE', position: 'RIGHT' },
      },
    },
  };
}

function buildCompletionRateComboVisual(dataSetIdentifier: string): object {
  return {
    comboChartVisual: {
      visualId: 'pr-completion-combo',
      title: { visibility: 'VISIBLE', formatText: { plainText: 'Level Starts vs Completion Rate %' } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        fieldWells: {
          comboChartAggregatedFieldWells: {
            category: [
              {
                categoricalDimensionField: {
                  fieldId: 'pr-combo-level-cat',
                  column: { dataSetIdentifier, columnName: 'level_id' },
                },
              },
            ],
            barValues: [
              {
                numericalMeasureField: {
                  fieldId: 'pr-combo-starts-bar',
                  column: { dataSetIdentifier, columnName: 'event_count' },
                  aggregationFunction: { simpleNumericalAggregation: 'SUM' },
                },
              },
            ],
            lineValues: [
              {
                numericalMeasureField: {
                  fieldId: 'pr-combo-rate-line',
                  column: { dataSetIdentifier, columnName: 'completion_rate_pct' },
                },
              },
            ],
            colors: [],
          },
        },
        sortConfiguration: { categorySort: [{ fieldSort: { fieldId: 'pr-combo-level-cat', direction: 'ASC' } }] },
        barDataLabels: { visibility: 'HIDDEN' },
        lineDataLabels: { visibility: 'VISIBLE' },
        legend: { visibility: 'VISIBLE', position: 'BOTTOM' },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 4: Monetization — "Where does revenue come from?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildMonetizationSheet(dataSetIdentifiers: Record<string, string>): object {
  const economyEvents = dataSetIdentifiers.economy_events;
  const allEvents = dataSetIdentifiers.all_events;

  const visuals = [
    withSubtitle(
      buildDistinctCountKpiWithSparklineVisual(
        'mn-total-transactions-kpi',
        'Total Transactions',
        economyEvents,
        'mn-transaction-id-measure',
        'transaction_id',
        'mn-transaction-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),
    withSubtitle(
      buildKpiWithSparklineVisual(
        'mn-total-lootboxes-kpi',
        'Total Lootboxes Opened',
        economyEvents,
        'mn-lootbox-measure',
        'event_count',
        'SUM',
        'mn-lootbox-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),

    withSubtitle(
      buildStackedAreaChartVisual(
        'mn-revenue-by-currency-area',
        'Daily Revenue by Currency',
        economyEvents,
        'mn-event-date-dim',
        'event_date',
        'mn-currency-amount-val',
        'currency_amount',
        'mn-currency-type-color',
        'currency_type',
        'SUM',
      ),
      'Revenue split by currency — never sum across currencies',
    ),

    withSubtitle(
      buildFunnelChartVisual(
        'mn-purchase-funnel',
        'Purchase Conversion Funnel',
        allEvents,
        'mn-funnel-event-type-cat',
        'event_type',
        'mn-funnel-count-val',
        'event_count',
        'SUM',
      ),
      'How many item viewers convert to buyers?',
    ),

    withSubtitle(
      buildTreeMapVisual(
        'mn-top-items-tree',
        'Top Items by Transaction Volume',
        economyEvents,
        'mn-item-id-group',
        'item_id',
        'mn-item-count-size',
        'event_count',
        'SUM',
      ),
      'Larger blocks = more transactions. Which items sell most?',
    ),

    withSubtitle(
      buildSortedBarChartVisual(
        'mn-lootbox-rarity-bar',
        'Lootbox Drops by Rarity',
        economyEvents,
        'mn-rarity-cat',
        'item_rarity',
        'mn-rarity-count-val',
        'event_count',
        'SUM',
        'ASC',
      ),
      'Is the drop rate distribution matching design intent?',
    ),
  ];

  return {
    sheetId: 'monetization-sheet',
    name: 'Monetization',
    description: 'Revenue sources, purchase conversion, and lootbox economy health.',
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: 'mn-total-transactions-kpi',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 10,
              },
              {
                elementId: 'mn-total-lootboxes-kpi',
                elementType: 'VISUAL',
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 10,
              },
              {
                elementId: 'mn-revenue-by-currency-area',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 10,
                rowSpan: 14,
              },
              {
                elementId: 'mn-purchase-funnel',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 24,
                rowSpan: 14,
              },
              {
                elementId: 'mn-top-items-tree',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 20,
                rowIndex: 38,
                rowSpan: 12,
              },
              {
                elementId: 'mn-lootbox-rarity-bar',
                elementType: 'VISUAL',
                columnIndex: 20,
                columnSpan: 12,
                rowIndex: 38,
                rowSpan: 12,
              },
            ],
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 5: Player Sentiment — "Are players happy?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildSentimentSheet(dataSetIdentifiers: Record<string, string>): object {
  const playerHealth = dataSetIdentifiers.player_health;

  const visuals = [
    withSubtitle(
      buildGaugeWithTargetVisual(
        'st-avg-rating-gauge',
        'Average User Rating',
        playerHealth,
        'st-avg-rating-measure',
        'user_rating',
        'AVERAGE',
      ),
      'Target: 4.0+ means players are satisfied',
    ),

    withSubtitle(
      buildKpiWithSparklineVisual(
        'st-total-reports-kpi',
        'Total Reports',
        playerHealth,
        'st-total-reports-measure',
        'event_count',
        'SUM',
        'st-reports-trend-dim',
        'event_date',
      ),
      "Growth % this week vs last week. Dates show each week's total.",
    ),

    withSubtitle(
      buildLineChartVisual(
        'st-avg-rating-line',
        'Average User Rating Over Time',
        playerHealth,
        'st-rating-date-dim',
        'event_date',
        'st-rating-val',
        'user_rating',
        'AVERAGE',
      ),
      'Is player satisfaction improving over time?',
    ),

    withSubtitle(
      buildStackedAreaChartVisual(
        'st-reports-over-time-area',
        'Report Reasons Over Time',
        playerHealth,
        'st-report-date-dim',
        'event_date',
        'st-report-count-val',
        'event_count',
        'st-report-reason-color',
        'report_reason',
        'SUM',
      ),
      'Which toxicity types are trending up?',
    ),

    withSubtitle(
      buildBarChartVisual(
        'st-report-reasons-bar',
        'Report Reasons',
        playerHealth,
        'st-report-reason-cat',
        'report_reason',
        'st-report-reason-count',
        'event_count',
        'SUM',
      ),
      'What makes players file reports?',
    ),

    withSubtitle(buildRatingDistributionVisual(playerHealth), 'Distribution of 1-5 star ratings'),
  ];

  return {
    sheetId: 'sentiment-sheet',
    name: 'Player Sentiment',
    description: 'Player satisfaction, toxicity trends, and report analysis.',
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: 'st-avg-rating-gauge',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 10,
              },
              {
                elementId: 'st-total-reports-kpi',
                elementType: 'VISUAL',
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 10,
              },
              {
                elementId: 'st-avg-rating-line',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 10,
                rowSpan: 14,
              },
              {
                elementId: 'st-reports-over-time-area',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 24,
                rowSpan: 14,
              },
              {
                elementId: 'st-report-reasons-bar',
                elementType: 'VISUAL',
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 38,
                rowSpan: 12,
              },
              {
                elementId: 'st-rating-distribution-vbar',
                elementType: 'VISUAL',
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 38,
                rowSpan: 12,
              },
            ],
          },
        },
      },
    ],
  };
}

function buildRatingDistributionVisual(dataSetIdentifier: string): object {
  return {
    barChartVisual: {
      visualId: 'st-rating-distribution-vbar',
      title: { visibility: 'VISIBLE', formatText: { plainText: 'Rating Distribution' } },
      subtitle: { visibility: 'HIDDEN' },
      chartConfiguration: {
        orientation: 'VERTICAL',
        fieldWells: {
          barChartAggregatedFieldWells: {
            category: [
              {
                numericalDimensionField: {
                  fieldId: 'st-rating-cat',
                  column: { dataSetIdentifier, columnName: 'user_rating' },
                },
              },
            ],
            values: [
              {
                numericalMeasureField: {
                  fieldId: 'st-rating-count-val',
                  column: { dataSetIdentifier, columnName: 'event_count' },
                  aggregationFunction: { simpleNumericalAggregation: 'SUM' },
                },
              },
            ],
            colors: [],
          },
        },
        sortConfiguration: { categorySort: [{ fieldSort: { fieldId: 'st-rating-cat', direction: 'ASC' } }] },
        dataLabels: { visibility: 'VISIBLE', position: 'OUTSIDE' },
        legend: { visibility: 'HIDDEN' },
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports (kept for backward compatibility with tests)
// ─────────────────────────────────────────────────────────────────────────────

export function buildOverviewSheet(dataSetIdentifiers: Record<string, string>): object {
  return buildPulseSheet(dataSetIdentifiers);
}

export function buildEconomySheet(dataSetIdentifiers: Record<string, string>): object {
  return buildMonetizationSheet(dataSetIdentifiers);
}
