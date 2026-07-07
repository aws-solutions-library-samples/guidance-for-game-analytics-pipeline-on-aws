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
 *
 * Direct-query performance guardrails applied:
 *   - Keep sheets lean (roughly 3-6 visuals each)
 *   - Put cheapest KPI/summary visuals first in the grid
 *   - Avoid adding high-cardinality controls in code-defined dashboards
 */

import {
  buildBarChartVisual,
  buildDistinctCountKpiWithSparklineVisual,
  buildDonutChartVisual,
  buildFilledMapVisual,
  buildFunnelChartVisual,
  buildHeatMapVisual,
  buildKpiVisual,
  buildKpiWithSparklineVisual,
  buildLineChartVisual,
  buildMultiMeasureTableVisual,
  buildPivotTableVisual,
  buildSortedBarChartVisual,
  buildStackedBarChartVisual,
  buildTreeMapVisual,
  buildVerticalBarChartVisual,
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
// Grid Layout Helper — collapses the layouts/gridLayout/elements wrapper that
// was duplicated across every sheet builder.
// ─────────────────────────────────────────────────────────────────────────────

/** Tuple: `[elementId, columnIndex, columnSpan, rowIndex, rowSpan]`. */
type GridElementSpec = readonly [
  elementId: string,
  columnIndex: number,
  columnSpan: number,
  rowIndex: number,
  rowSpan: number,
];

function buildGridLayout(elements: readonly GridElementSpec[]): object[] {
  return [
    {
      configuration: {
        gridLayout: {
          elements: elements.map(([elementId, columnIndex, columnSpan, rowIndex, rowSpan]) => ({
            elementId,
            elementType: 'VISUAL',
            columnIndex,
            columnSpan,
            rowIndex,
            rowSpan,
          })),
        },
      },
    },
  ];
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
      'Week-over-week growth. Watch for sudden drops — they signal outages or churn.',
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
      'Acquisition health: a flat trend means marketing or virality has stalled.',
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
      'Engagement proxy: rising matches per player indicates retention strength.',
    ),

    // Daily activity volume — replaces version-adoption stacked area (only 3 versions, low signal)
    withSubtitle(
      buildLineChartVisual(
        'pulse-daily-events-line',
        'Daily Active Events',
        allEvents,
        'pulse-daily-date-dim',
        'event_date',
        'pulse-daily-count-val',
        'event_count',
        'SUM',
      ),
      'Daily volume across the 33-day window. Spot weekly seasonality and anomalies.',
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
      'Where to focus optimization: heaviest platform deserves the most QA budget.',
    ),

    // Login vs Logout — session abandonment indicator
    withSubtitle(
      buildVerticalBarChartVisual(
        'pulse-login-logout-bar',
        'Logins vs Logouts',
        allEvents,
        'pulse-login-logout-cat',
        'event_type',
        'pulse-login-logout-val',
        'event_count',
        'SUM',
        'DESC',
      ),
      'Gap between logins and logouts = sessions abandoned without clean exit.',
    ),

    // Country distribution — filled map showing player concentration
    withSubtitle(
      buildFilledMapVisual(
        'pulse-country-heatmap',
        'Player Distribution by Country',
        playerHealth,
        'pulse-country-row',
        'country',
        'pulse-country-count-val',
        'event_count',
        'SUM',
      ),
      'Darker regions = more players. Prioritize localization and server placement there.',
    ),

    withSubtitle(
      buildHeatMapVisual(
        'pulse-country-platform-heatmap',
        'Country × Platform Registrations',
        playerHealth,
        'pulse-cp-country-row',
        'country',
        'pulse-cp-platform-col',
        'platform',
        'pulse-cp-count-val',
        'event_count',
        'SUM',
      ),
      'Cross-tab of registrations by country (rows) and platform (cols). Reveals which platforms dominate which markets — e.g. iOS in Japan vs xbox in US.',
    ),
  ];

  return {
    sheetId: 'pulse-sheet',
    name: 'Pulse',
    description: 'High-level game health: Are key metrics trending up or down?',
    visuals,
    layouts: buildGridLayout([
      ['pulse-total-events-kpi', 0, 8, 0, 6],
      ['pulse-new-players-kpi', 8, 8, 0, 6],
      ['pulse-total-matches-kpi', 16, 8, 0, 6],
      ['pulse-daily-events-line', 0, 32, 6, 12],
      ['pulse-platform-bar', 0, 16, 18, 12],
      ['pulse-login-logout-bar', 16, 16, 18, 12],
      ['pulse-country-heatmap', 0, 32, 30, 12],
      ['pulse-country-platform-heatmap', 0, 32, 42, 14],
    ]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 2: Combat & Balance — "Is the game fair?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildCombatSheet(dataSetIdentifiers: Record<string, string>): object {
  const matchEvents = dataSetIdentifiers.match_events;
  const matchLifecycleFunnel = dataSetIdentifiers.match_lifecycle_funnel;

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
      'Combat throughput. A drop after a patch hints at balance backlash.',
    ),

    withSubtitle(
      buildKpiVisual('cb-avg-xp-kpi', 'Avg XP per Match', matchEvents, 'cb-avg-xp-measure', 'exp_gained', 'AVERAGE'),
      'Reward economy health. Tune match length or XP curve if this drifts.',
    ),

    withSubtitle(
      buildFunnelChartVisual(
        'cb-match-lifecycle-funnel',
        'Match Lifecycle Success Funnel',
        matchLifecycleFunnel,
        'cb-funnel-stage-cat',
        'stage_label',
        'cb-funnel-count-val',
        'event_count',
        'SUM',
        true,
      ),
      'Match success path: matchmaking_start → matchmaking_complete → match_start → match_end. Stage with biggest drop = where to invest matchmaking or stability fixes. Failed matchmaking is shown separately in the failures bar below.',
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
      'Lopsided win/loss on a map signals layout or spawn-point issues to redesign.',
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
      'Mode mix tells you which queues to prioritize for matchmaking improvements.',
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
      'Top-1 spell dominance is a balance flag — consider nerfs or counter-play buffs.',
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
      'Most-frequent reason should drive the next matchmaking-service fix.',
    ),

    withSubtitle(
      buildBarChartVisual(
        'cb-spell-volume-bar',
        'Most-Used Spell by Match Volume',
        matchEvents,
        'cb-spell-volume-cat',
        'most_used_spell',
        'cb-spell-volume-val',
        'event_count',
        'SUM',
      ),
      'Total matches where each spell was the most-used. Higher = more popular spell.',
    ),

    withSubtitle(
      buildBarChartVisual(
        'cb-spell-winrate-bar',
        'Most-Used Spell by Win Rate (%)',
        matchEvents,
        'cb-spell-winrate-cat',
        'most_used_spell',
        'cb-spell-winrate-val',
        'win_pct_value',
        'AVERAGE',
      ),
      'Avg win % among matches where each spell was most-used. High volume + low win rate = nerf candidate.',
    ),

    withSubtitle(
      buildMultiMeasureTableVisual(
        'cb-spell-performance-table',
        'Spell Performance Detail',
        matchEvents,
        'cb-spell-performance-cat',
        'most_used_spell',
        [
          {
            fieldId: 'cb-spell-performance-matches-val',
            columnName: 'event_count',
            aggregation: 'SUM',
            label: 'Matches',
          },
          {
            fieldId: 'cb-spell-performance-winrate-val',
            columnName: 'win_pct_value',
            aggregation: 'AVERAGE',
            label: 'Avg Win %',
          },
        ],
        'Spell',
      ),
      'Different from the bars: this combines popularity and win rate in one sortable detail view for balance review.',
    ),

    withSubtitle(
      buildPivotTableVisual(
        'cb-map-outcome-pivot',
        'Map × Outcome Pivot',
        matchEvents,
        'cb-map-pivot-row',
        'map_id',
        'cb-map-pivot-col',
        'match_result',
        'cb-map-pivot-count-val',
        'event_count',
        'SUM',
      ),
      'Matrix view of wins and losses by map. Faster to compare balance patterns than separate bars when scanning exact counts.',
    ),
  ];

  return {
    sheetId: 'combat-sheet',
    name: 'Combat & Balance',
    description: 'Match lifecycle health and game balance across maps, spells, and modes.',
    visuals,
    layouts: buildGridLayout([
      ['cb-total-matches-kpi', 0, 16, 0, 6],
      ['cb-avg-xp-kpi', 16, 16, 0, 6],
      ['cb-match-lifecycle-funnel', 0, 32, 6, 14],
      ['cb-outcomes-by-map-bar', 0, 20, 20, 12],
      ['cb-match-types-donut', 20, 12, 20, 12],
      ['cb-spell-knockouts-bar', 0, 16, 32, 12],
      ['cb-matchmaking-failures-bar', 16, 16, 32, 12],
      ['cb-spell-volume-bar', 0, 14, 44, 12],
      ['cb-spell-winrate-bar', 14, 18, 44, 12],
      ['cb-spell-performance-table', 0, 16, 56, 10],
      ['cb-map-outcome-pivot', 16, 16, 56, 10],
    ]),
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
      buildKpiWithSparklineVisual(
        'pr-tutorial-sessions-kpi',
        'Tutorial Sessions',
        playerHealth,
        'pr-tutorial-sessions-measure',
        'event_count',
        'SUM',
        'pr-tutorial-sessions-trend-dim',
        'event_date',
      ),
      'Onboarding throughput. Slower growth here forecasts weaker D1 retention.',
    ),

    withSubtitle(
      buildKpiWithSparklineVisual(
        'pr-levels-completed-kpi',
        'Levels Completed',
        levelEvents,
        'pr-levels-completed-measure',
        'event_count',
        'SUM',
        'pr-levels-completed-trend-dim',
        'event_date',
      ),
      'Mid-funnel velocity. Drops imply difficulty spike or content fatigue.',
    ),

    withSubtitle(
      buildDistinctCountKpiWithSparklineVisual(
        'pr-rank-ups-kpi',
        'Players Ranked Up',
        playerHealth,
        'pr-rank-ups-measure',
        'event_id',
        'pr-rank-ups-trend-dim',
        'event_date',
      ),
      'End-funnel signal. Trending down? Re-balance ranked ladder or rewards.',
    ),

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
        true,
      ),
      'Biggest stage drop = the tutorial screen to redesign or shorten next sprint.',
    ),

    withSubtitle(
      buildLevelPerformanceVisual(levelEvents),
      'Compare starts, completions, and failures per level. Skew toward fails = difficulty spike.',
    ),

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
      'A long tail at low ranks signals progression friction or matchmaking unfairness.',
    ),
  ];

  return {
    sheetId: 'progression-sheet',
    name: 'Onboarding & Progression',
    description: 'Player journey from tutorial through levels to ranked play.',
    visuals,
    layouts: buildGridLayout([
      ['pr-tutorial-sessions-kpi', 0, 11, 0, 6],
      ['pr-levels-completed-kpi', 11, 11, 0, 6],
      ['pr-rank-ups-kpi', 22, 10, 0, 6],
      ['pr-tutorial-funnel', 0, 32, 6, 14],
      ['pr-level-performance-bar', 0, 32, 20, 16],
      ['pr-rank-distribution-bar', 0, 32, 36, 12],
    ]),
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
      'Paying-user momentum. Trending down? Re-evaluate offer placement and pricing.',
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
      'Engagement signal for the chase loop. Sudden drops imply waning rarity appeal.',
    ),

    withSubtitle(
      buildDonutChartVisual(
        'mn-revenue-by-currency-area',
        'Transactions by Currency',
        economyEvents,
        'mn-currency-type-cat',
        'currency_type',
        'mn-currency-tx-count-val',
        'event_count',
        'SUM',
      ),
      'Which currencies do players transact in. Mixing currency_amount across USD/EUR/YEN/RMB is meaningless without FX, so this counts transactions instead.',
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
      'View → transaction drop-off shows where to A/B test storefront copy or pricing.',
    ),

    withSubtitle(
      buildVerticalBarChartVisual(
        'mn-transaction-amount-distribution-bar',
        'USD Transaction Amount Distribution',
        economyEvents,
        'mn-amount-cat',
        'currency_amount_band',
        'mn-amount-count-val',
        'event_count',
        'SUM',
        'ASC',
      ),
      'Scoped to USD only — mixing currency_amount across currencies without FX would be meaningless. Peaks reveal the most effective USD price bands.',
    ),

    withSubtitle(
      buildBarChartVisual(
        'mn-lootbox-rarity-bar',
        'Lootbox Drops by Rarity',
        economyEvents,
        'mn-rarity-cat',
        'item_rarity',
        'mn-rarity-count-val',
        'event_count',
        'SUM',
      ),
      'Compare actual drops to design intent — rarity inversions break trust.',
    ),

    withSubtitle(
      buildTreeMapVisual(
        'mn-lootbox-rarity-treemap',
        'Rarity Scarcity (treemap)',
        economyEvents,
        'mn-rarity-tree-cat',
        'item_rarity',
        'mn-rarity-tree-size',
        'event_count',
        'SUM',
      ),
      'Same rarity counts as the bar at left, sized as proportional tiles. COMMON dwarfs LEGENDARY at-a-glance — native QuickSight visual conveying scarcity disproportion.',
    ),
  ];

  return {
    sheetId: 'monetization-sheet',
    name: 'Monetization',
    description: 'Revenue sources, purchase conversion, and lootbox economy health.',
    visuals,
    layouts: buildGridLayout([
      ['mn-total-transactions-kpi', 0, 16, 0, 6],
      ['mn-total-lootboxes-kpi', 16, 16, 0, 6],
      ['mn-purchase-funnel', 0, 32, 6, 14],
      ['mn-revenue-by-currency-area', 0, 12, 20, 12],
      ['mn-transaction-amount-distribution-bar', 12, 20, 20, 12],
      ['mn-lootbox-rarity-bar', 0, 16, 32, 12],
      ['mn-lootbox-rarity-treemap', 16, 16, 32, 12],
    ]),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 5: Player Sentiment — "Are players happy?"
// ─────────────────────────────────────────────────────────────────────────────

export function buildSentimentSheet(dataSetIdentifiers: Record<string, string>): object {
  const playerHealth = dataSetIdentifiers.player_health;

  const visuals = [
    withSubtitle(
      buildKpiVisual(
        'st-avg-rating-gauge',
        'Average User Rating',
        playerHealth,
        'st-avg-rating-measure',
        'user_rating',
        'AVERAGE',
      ),
      'Below 4.0 sustained = NPS-style alarm; review the top report reasons next.',
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
      'Spikes correlate with toxicity events — escalate moderation if trend rises.',
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
      'Sustained dips after a release = patch regressions or content backlash.',
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
      'Top reason = the next moderation rule or in-game messaging to prioritize.',
    ),

    withSubtitle(
      buildRatingDistributionVisual(playerHealth),
      '1-5 star spread. Bimodal? You have lovers and haters — investigate both.',
    ),
  ];

  return {
    sheetId: 'sentiment-sheet',
    name: 'Player Sentiment',
    description: 'Player satisfaction, toxicity trends, and report analysis.',
    visuals,
    layouts: buildGridLayout([
      ['st-avg-rating-gauge', 0, 16, 0, 6],
      ['st-total-reports-kpi', 16, 16, 0, 6],
      ['st-avg-rating-line', 0, 32, 6, 14],
      ['st-report-reasons-bar', 0, 16, 20, 12],
      ['st-rating-distribution-vbar', 16, 16, 20, 12],
    ]),
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
