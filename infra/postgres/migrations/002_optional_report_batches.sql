ALTER TABLE daily_call_plan_reports
  ALTER COLUMN renderways_upload_batch_id DROP NOT NULL,
  ALTER COLUMN call_plan_upload_batch_id DROP NOT NULL;

ALTER TABLE renderways_records
  ADD COLUMN IF NOT EXISTS rtpl_status TEXT;
