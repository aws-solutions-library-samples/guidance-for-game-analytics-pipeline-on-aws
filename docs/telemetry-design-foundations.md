# Game Telemetry Design Foundations

## Purpose

Game analysis often requires joining data from multiple features and 

## Foundations

For best results, all telemetry events should include foundational keys that tie events to specific players and sessions.  Here is an example of these standard event fields:

| Event Name | Field | Type | Example |
| --- | --- | --- | --- |
| <all> | pid | string | Player GUID identifying the player uniquely and persistently among all players. |
|  | sid | string | Unique session GUID to link events from the same session, should be constant for the duration of a session. |
|  | event_time | timestamp | UTC (or customer preferred timezone) date/time the event took place (must be server-authoritative) |
|  | session_time_sec | float | Time in seconds since the session started, for the purpose of correctly sequencing events from the same session.  In the session_start event this should be near 0. |