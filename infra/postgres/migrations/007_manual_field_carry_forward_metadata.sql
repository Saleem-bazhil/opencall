-- Manual field carry-forward metadata.
--
-- These columns store generation-time operational continuity metadata on each
-- final report row without rewriting historical business values.

ALTER TABLE daily_call_plan_report_rows
  ADD COLUMN IF NOT EXISTS carried_forward_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_fields_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_fields_missing TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_report_rows_carried_forward_fields_array'
  ) THEN
    ALTER TABLE daily_call_plan_report_rows
      ADD CONSTRAINT daily_report_rows_carried_forward_fields_array
      CHECK (jsonb_typeof(carried_forward_fields) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_report_rows_manual_fields_missing_no_nulls'
  ) THEN
    ALTER TABLE daily_call_plan_report_rows
      ADD CONSTRAINT daily_report_rows_manual_fields_missing_no_nulls
      CHECK (array_position(manual_fields_missing, NULL) IS NULL);
  END IF;
END $$;
