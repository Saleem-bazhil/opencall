-- Day-over-day report comparison schema.
--
-- The comparison tables reference report_history_sessions because report
-- generation in the current application is session-scoped by date and region.
-- daily_call_plan_report_rows also receives nullable enrichment columns so a
-- FINAL current report can be read without mutating or joining previous rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'report_change_type'
  ) THEN
    CREATE TYPE report_change_type AS ENUM (
      'NEW',
      'CLOSED',
      'CARRIED',
      'UPDATED'
    );
  END IF;
END $$;

ALTER TABLE daily_call_plan_report_rows
  ADD COLUMN IF NOT EXISTS change_type report_change_type,
  ADD COLUMN IF NOT EXISTS previous_flex_status TEXT,
  ADD COLUMN IF NOT EXISTS previous_rtpl_status TEXT,
  ADD COLUMN IF NOT EXISTS previous_wip_aging TEXT,
  ADD COLUMN IF NOT EXISTS changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS change_summary TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_report_rows_changed_fields_object'
  ) THEN
    ALTER TABLE daily_call_plan_report_rows
      ADD CONSTRAINT daily_report_rows_changed_fields_object
      CHECK (jsonb_typeof(changed_fields) = 'object');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS report_comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  current_session_id UUID NOT NULL REFERENCES report_history_sessions(id) ON DELETE CASCADE,
  previous_session_id UUID NOT NULL REFERENCES report_history_sessions(id) ON DELETE RESTRICT,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT report_comparisons_distinct_sessions
    CHECK (current_session_id <> previous_session_id),
  CONSTRAINT report_comparisons_summary_object
    CHECK (jsonb_typeof(summary_json) = 'object'),
  CONSTRAINT report_comparisons_one_per_current_session
    UNIQUE (current_session_id)
);

CREATE INDEX IF NOT EXISTS idx_report_comparisons_previous_session
  ON report_comparisons(previous_session_id);

CREATE TABLE IF NOT EXISTS report_row_diffs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id TEXT NOT NULL,
  current_session_id UUID NOT NULL REFERENCES report_history_sessions(id) ON DELETE CASCADE,
  previous_session_id UUID NOT NULL REFERENCES report_history_sessions(id) ON DELETE RESTRICT,
  change_type report_change_type NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT report_row_diffs_distinct_sessions
    CHECK (current_session_id <> previous_session_id),
  CONSTRAINT report_row_diffs_changed_fields_object
    CHECK (jsonb_typeof(changed_fields) = 'object'),
  CONSTRAINT report_row_diffs_one_per_ticket_per_current_session
    UNIQUE (current_session_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_report_row_diffs_current_session
  ON report_row_diffs(current_session_id);

CREATE INDEX IF NOT EXISTS idx_report_row_diffs_previous_session
  ON report_row_diffs(previous_session_id);

CREATE INDEX IF NOT EXISTS idx_report_row_diffs_change_type
  ON report_row_diffs(current_session_id, change_type);
