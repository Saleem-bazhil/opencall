-- Persisted row edit metadata and additional manual operational notes.

ALTER TABLE daily_call_plan_report_rows
  ADD COLUMN IF NOT EXISTS remarks TEXT,
  ADD COLUMN IF NOT EXISTS manual_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_daily_report_rows_updated_by
  ON daily_call_plan_report_rows(updated_by);
