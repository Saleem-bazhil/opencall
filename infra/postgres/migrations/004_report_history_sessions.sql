CREATE TABLE report_history_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  region_id UUID REFERENCES regions(id),
  flex_upload_batch_id UUID REFERENCES source_upload_batches(id),
  renderways_upload_batch_id UUID REFERENCES source_upload_batches(id),
  call_plan_upload_batch_id UUID REFERENCES source_upload_batches(id),
  daily_call_plan_report_id UUID REFERENCES daily_call_plan_reports(id),
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
