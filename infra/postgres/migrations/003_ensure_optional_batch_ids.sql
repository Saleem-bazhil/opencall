-- Ensure daily_call_plan_reports batch ID columns are nullable
-- This is defensive and idempotent - safe to run even if already applied
--
-- RATIONALE:
-- - Daily call plan reports require Flex WIP data (flex_upload_batch_id is NOT NULL)
-- - But Renderways and Call Plan data are OPTIONAL additional data sources
-- - Setting renderways_upload_batch_id and call_plan_upload_batch_id as nullable allows
--   reports to be generated with just Flex WIP data, or with optional additional sources
-- - The system uses IS NOT DISTINCT FROM for NULL-safe equality checks
--
-- This migration ensures the schema matches the business logic design:
-- Reports CAN be created without Renderways or Call Plan batches

ALTER TABLE daily_call_plan_reports
  ALTER COLUMN renderways_upload_batch_id DROP NOT NULL;

ALTER TABLE daily_call_plan_reports
  ALTER COLUMN call_plan_upload_batch_id DROP NOT NULL;
