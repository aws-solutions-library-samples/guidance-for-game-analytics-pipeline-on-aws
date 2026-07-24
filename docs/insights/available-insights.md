
# Available Insights

## User Activity

This insight module tracks user login and logout activity to determine active user count, recurring users, session length (playtime), and user churn. The design of the insight is based off work from [User Acquisition Incrementality for Netflix Games](https://netflixtechblog.com/part-2-a-survey-of-analytics-engineering-work-at-netflix-4f1f53b4ab0f) and [Lifetime Value Part 26: My most valuable retention KPIs by Lloyd Melnick](https://lloydmelnick.com/2019/02/05/lifetime-value-part-26-my-most-valuable-retention-kpis/).

### Source Events

- [login-event](../references/event-library/user-activity.md#login-event)
- [logout-event](../references/event-library/user-activity.md#logout-event)

### How it Works

The data processing jobs are scheduled to run at 00:30 UTC and will incrementally update the tables with the previous day's metrics.

silver-level processing

gold-level processing

### Visualizations

## Store Metrics

This insight module tracks in-game store metrics such as revenue 

### Source Events

### How it Works

A fact table for in-store item prices is created by the pipeline. This fact table contains a mapping of in-store item names to prices. To normalize across currencies and conversion rates, the prices of the in-game items should be an in-game currency (tokens) rather than a real-world currency.

The data processing jobs are scheduled to run at 00:30 UTC and will incrementally update the tables with the previous day's metrics.

### Visualizations

## In-Game Analysis

### Source Events

### How it Works

The data processing jobs are scheduled to run at 00:30 UTC and will incrementally update the tables with the previous day's metrics.

### Visualizations

