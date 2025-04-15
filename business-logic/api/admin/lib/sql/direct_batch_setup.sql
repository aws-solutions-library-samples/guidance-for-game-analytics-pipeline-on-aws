CREATE TABLE IF NOT EXISTS
  event_data (
    event_id TEXT,
    event_type TEXT,
    event_name TEXT,
    event_version TEXT,
    event_timestamp BIGINT,
    app_version TEXT,
    application_id TEXT,
    application_name TEXT,
    event_data TEXT
  ) distkey (application_id);