/**
 * QuickSight Sheet Builder Functions — Game Analytics Dashboard
 *
 * Assembles visual definitions into complete sheet configurations with grid layouts.
 * Each function composes visuals from the visual helper module and positions them
 * in a non-overlapping 32-column grid following the "KPI Banner → Trends → Details"
 * inverted pyramid pattern optimized for competitive multiplayer game analytics.
 *
 * Sheets:
 *   1. Game Overview — high-level health metrics at a glance
 *   2. Combat & Matches — match/combat data, maps, spells, results
 *   3. Player Progression — level starts, completions, failures over time
 *   4. Economy & Revenue — IAP transactions, lootboxes, currency flow
 */

import {
  buildAreaChartVisual,
  buildBarChartVisual,
  buildDonutChartVisual,
  buildKpiVisual,
} from "./quicksight-visual-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 1: Game Overview
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Game Overview sheet — high-level health metrics at a glance.
 *
 * Layout (32-col grid):
 *   Row 0-7:   KPI row — Total Events + Total Players (side by side)
 *   Row 8-21:  Area chart — Daily event volume (full width)
 *   Row 22-33: Donut — Events by Type + Donut — Players by Platform (side by side)
 */
export function buildOverviewSheet(
  dataSetIdentifiers: Record<string, string>,
): object {
  const allEvents = dataSetIdentifiers.all_events;
  const playerHealth = dataSetIdentifiers.player_health;

  const visuals = [
    // KPI row
    buildKpiVisual(
      "ov-total-events-kpi",
      "Total Events",
      allEvents,
      "ov-event-id-measure",
      "event_count",
      "SUM",
    ),
    buildKpiVisual(
      "ov-total-players-kpi",
      "Total Players (Registrations)",
      playerHealth,
      "ov-player-reg-measure",
      "event_count",
      "SUM",
    ),

    // Daily event volume
    buildAreaChartVisual(
      "ov-daily-events-area",
      "Daily Event Volume",
      allEvents,
      "ov-event-date-dim",
      "event_date",
      "ov-event-count-val",
      "event_count",
      "SUM",
    ),

    // Events by Type donut
    buildDonutChartVisual(
      "ov-events-by-type-donut",
      "Events by Type",
      allEvents,
      "ov-event-type-cat",
      "event_type",
      "ov-event-type-count",
      "event_count",
      "SUM",
    ),

    // Players by Platform donut
    buildDonutChartVisual(
      "ov-players-by-platform-donut",
      "Players by Platform",
      playerHealth,
      "ov-platform-cat",
      "platform",
      "ov-platform-count",
      "event_count",
      "SUM",
    ),
  ];

  return {
    sheetId: "overview-sheet",
    name: "Game Overview",
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: "ov-total-events-kpi",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "ov-total-players-kpi",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "ov-daily-events-area",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 8,
                rowSpan: 14,
              },
              {
                elementId: "ov-events-by-type-donut",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "ov-players-by-platform-donut",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 22,
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
// Sheet 2: Combat & Matches
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Combat & Matches sheet.
 *
 * Layout (32-col grid):
 *   Row 0-7:   KPI row — Total Matches + Total Knockouts (side by side)
 *   Row 8-21:  Bar chart — Matches by Map (full width)
 *   Row 22-33: Donut — Match Types + Donut — Most Used Spells (side by side)
 *   Row 34-47: Bar chart — Match Results (full width)
 */
export function buildCombatSheet(
  dataSetIdentifiers: Record<string, string>,
): object {
  const matchEvents = dataSetIdentifiers.match_events;

  const visuals = [
    // KPI row
    buildKpiVisual(
      "cb-total-matches-kpi",
      "Total Matches",
      matchEvents,
      "cb-match-id-measure",
      "event_count",
      "SUM",
    ),
    buildKpiVisual(
      "cb-total-knockouts-kpi",
      "Total Knockouts",
      matchEvents,
      "cb-knockout-measure",
      "event_count",
      "SUM",
    ),

    // Matches by Map
    buildBarChartVisual(
      "cb-matches-by-map-bar",
      "Matches by Map",
      matchEvents,
      "cb-map-id-cat",
      "map_id",
      "cb-map-count-val",
      "event_count",
      "SUM",
    ),

    // Match Types donut
    buildDonutChartVisual(
      "cb-match-types-donut",
      "Match Types",
      matchEvents,
      "cb-match-type-cat",
      "match_type",
      "cb-match-type-count",
      "event_count",
      "SUM",
    ),

    // Most Used Spells donut
    buildDonutChartVisual(
      "cb-spells-donut",
      "Most Used Spells",
      matchEvents,
      "cb-spell-cat",
      "spell_used",
      "cb-spell-count",
      "event_count",
      "SUM",
    ),

    // Match Results bar
    buildBarChartVisual(
      "cb-match-results-bar",
      "Match Results",
      matchEvents,
      "cb-result-cat",
      "match_result",
      "cb-result-count-val",
      "event_count",
      "SUM",
    ),
  ];

  return {
    sheetId: "combat-sheet",
    name: "Combat & Matches",
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: "cb-total-matches-kpi",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "cb-total-knockouts-kpi",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "cb-matches-by-map-bar",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 8,
                rowSpan: 14,
              },
              {
                elementId: "cb-match-types-donut",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "cb-spells-donut",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "cb-match-results-bar",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 34,
                rowSpan: 14,
              },
            ],
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet 3: Player Progression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Player Progression sheet.
 *
 * Layout (32-col grid):
 *   Row 0-7:   KPI — Total Level Attempts (full width)
 *   Row 8-21:  Area chart — Level events over time (full width)
 *   Row 22-33: Bar × 3 — Starts by Level + Completions by Level + Failures by Level
 */
export function buildProgressionSheet(
  dataSetIdentifiers: Record<string, string>,
): object {
  const levelEvents = dataSetIdentifiers.level_events;

  const visuals = [
    // KPI row
    buildKpiVisual(
      "pr-total-attempts-kpi",
      "Total Level Attempts",
      levelEvents,
      "pr-attempts-measure",
      "event_count",
      "SUM",
    ),

    // Level events over time
    buildAreaChartVisual(
      "pr-level-events-area",
      "Level Events Over Time",
      levelEvents,
      "pr-event-date-dim",
      "event_date",
      "pr-level-count-val",
      "event_count",
      "SUM",
    ),

    // Starts by Level
    buildBarChartVisual(
      "pr-starts-by-level-bar",
      "Starts by Level",
      levelEvents,
      "pr-level-start-cat",
      "level_id",
      "pr-starts-count-val",
      "event_count",
      "SUM",
    ),

    // Completions by Level
    buildBarChartVisual(
      "pr-completions-by-level-bar",
      "Completions by Level",
      levelEvents,
      "pr-level-complete-cat",
      "level_id",
      "pr-completions-count-val",
      "event_count",
      "SUM",
    ),

    // Failures by Level
    buildBarChartVisual(
      "pr-failures-by-level-bar",
      "Failures by Level",
      levelEvents,
      "pr-level-fail-cat",
      "level_id",
      "pr-failures-count-val",
      "event_count",
      "SUM",
    ),
  ];

  return {
    sheetId: "progression-sheet",
    name: "Player Progression",
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: "pr-total-attempts-kpi",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "pr-level-events-area",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 8,
                rowSpan: 14,
              },
              {
                elementId: "pr-starts-by-level-bar",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 11,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "pr-completions-by-level-bar",
                elementType: "VISUAL",
                columnIndex: 11,
                columnSpan: 11,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "pr-failures-by-level-bar",
                elementType: "VISUAL",
                columnIndex: 22,
                columnSpan: 10,
                rowIndex: 22,
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
// Sheet 4: Economy & Revenue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the Economy & Revenue sheet.
 *
 * Layout (32-col grid):
 *   Row 0-7:   KPI row — Total Revenue + Total Lootboxes Opened (side by side)
 *   Row 8-21:  Area chart — Daily revenue (full width)
 *   Row 22-33: Donut — Revenue by Currency + Bar — Lootbox Drops by Rarity (side by side)
 */
export function buildEconomySheet(
  dataSetIdentifiers: Record<string, string>,
): object {
  const economyEvents = dataSetIdentifiers.economy_events;

  const visuals = [
    // KPI row
    buildKpiVisual(
      "ec-total-revenue-kpi",
      "Total Revenue",
      economyEvents,
      "ec-revenue-measure",
      "currency_amount",
      "SUM",
    ),
    buildKpiVisual(
      "ec-total-lootboxes-kpi",
      "Total Lootboxes Opened",
      economyEvents,
      "ec-lootbox-measure",
      "event_count",
      "SUM",
    ),

    // Daily revenue area chart
    buildAreaChartVisual(
      "ec-daily-revenue-area",
      "Daily Revenue",
      economyEvents,
      "ec-event-date-dim",
      "event_date",
      "ec-revenue-val",
      "currency_amount",
      "SUM",
    ),

    // Revenue by Currency donut
    buildDonutChartVisual(
      "ec-revenue-by-currency-donut",
      "Revenue by Currency",
      economyEvents,
      "ec-currency-type-cat",
      "currency_type",
      "ec-currency-sum",
      "currency_amount",
      "SUM",
    ),

    // Lootbox Drops by Rarity bar
    buildBarChartVisual(
      "ec-lootbox-rarity-bar",
      "Lootbox Drops by Rarity",
      economyEvents,
      "ec-rarity-cat",
      "item_rarity",
      "ec-rarity-count-val",
      "event_count",
      "SUM",
    ),
  ];

  return {
    sheetId: "economy-sheet",
    name: "Economy & Revenue",
    visuals,
    layouts: [
      {
        configuration: {
          gridLayout: {
            elements: [
              {
                elementId: "ec-total-revenue-kpi",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "ec-total-lootboxes-kpi",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 0,
                rowSpan: 8,
              },
              {
                elementId: "ec-daily-revenue-area",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 32,
                rowIndex: 8,
                rowSpan: 14,
              },
              {
                elementId: "ec-revenue-by-currency-donut",
                elementType: "VISUAL",
                columnIndex: 0,
                columnSpan: 16,
                rowIndex: 22,
                rowSpan: 12,
              },
              {
                elementId: "ec-lootbox-rarity-bar",
                elementType: "VISUAL",
                columnIndex: 16,
                columnSpan: 16,
                rowIndex: 22,
                rowSpan: 12,
              },
            ],
          },
        },
      },
    ],
  };
}
