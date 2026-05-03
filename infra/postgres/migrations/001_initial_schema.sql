CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM (
  'SUPER_ADMIN',
  'REGION_ADMIN'
);

CREATE TYPE upload_source_type AS ENUM (
  'FLEX_WIP',
  'RENDERWAYS',
  'CALL_PLAN'
);

CREATE TYPE upload_status AS ENUM (
  'UPLOADED',
  'VALIDATED',
  'FAILED',
  'PROCESSED'
);

CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  region_id UUID REFERENCES regions(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- REGION_ADMIN must belong to exactly one region.
  CONSTRAINT users_region_required_for_region_admin
    CHECK (
      role = 'SUPER_ADMIN'
      OR region_id IS NOT NULL
    )
);

CREATE TABLE source_upload_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_type upload_source_type NOT NULL,
  original_file_name TEXT NOT NULL,
  stored_file_path TEXT NOT NULL,
  status upload_status NOT NULL DEFAULT 'UPLOADED',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  region_id UUID REFERENCES regions(id),
  row_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE flex_wip_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_batch_id UUID NOT NULL REFERENCES source_upload_batches(id) ON DELETE CASCADE,

  ticket_id TEXT NOT NULL,
  normalized_ticket_id TEXT NOT NULL,
  case_id TEXT,
  normalized_case_id TEXT,

  product TEXT,
  flex_status TEXT,
  wo_otc_code TEXT,
  account_name TEXT,
  customer_name TEXT,
  contact TEXT,
  customer_email TEXT,
  part_description TEXT,
  customer_pincode TEXT,

  raw_row JSONB NOT NULL,
  row_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flex_wip_ticket
  ON flex_wip_records(normalized_ticket_id);

CREATE INDEX idx_flex_wip_case
  ON flex_wip_records(normalized_case_id);

CREATE TABLE renderways_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_batch_id UUID NOT NULL REFERENCES source_upload_batches(id) ON DELETE CASCADE,

  ticket_id TEXT,
  normalized_ticket_id TEXT,
  case_id TEXT NOT NULL,
  normalized_case_id TEXT NOT NULL,

  partner_accept TIMESTAMPTZ,
  wip_aging TEXT,
  wip_aging_category TEXT,
  rtpl_status TEXT,
  hp_owner TEXT,
  rca_message TEXT,
  product_type TEXT,
  call_classification TEXT,

  raw_row JSONB NOT NULL,
  row_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_renderways_ticket
  ON renderways_records(normalized_ticket_id);

CREATE INDEX idx_renderways_case
  ON renderways_records(normalized_case_id);

CREATE TABLE call_plan_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  upload_batch_id UUID NOT NULL REFERENCES source_upload_batches(id) ON DELETE CASCADE,

  ticket_id TEXT NOT NULL,
  normalized_ticket_id TEXT NOT NULL,
  morning_status TEXT,
  engineer TEXT,
  location TEXT,
  raw_row JSONB NOT NULL,
  row_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_call_plan_ticket
  ON call_plan_records(normalized_ticket_id);

CREATE TABLE pincode_area_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pincode TEXT NOT NULL UNIQUE,
  area_name TEXT NOT NULL,
  region_id UUID REFERENCES regions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sla_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wip_aging_category TEXT NOT NULL UNIQUE,
  sla_hours INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_call_plan_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_date DATE NOT NULL,
  region_id UUID REFERENCES regions(id),
  generated_by UUID NOT NULL REFERENCES users(id),
  flex_upload_batch_id UUID NOT NULL REFERENCES source_upload_batches(id),
  renderways_upload_batch_id UUID REFERENCES source_upload_batches(id),
  call_plan_upload_batch_id UUID REFERENCES source_upload_batches(id),
  total_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_ticket_count INTEGER NOT NULL DEFAULT 0,
  unmatched_ticket_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE daily_call_plan_report_rows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES daily_call_plan_reports(id) ON DELETE CASCADE,

  serial_no INTEGER NOT NULL,
  ticket_id TEXT NOT NULL,
  case_id TEXT,
  case_created_time TIMESTAMPTZ,
  wip_aging TEXT,
  rtpl_status TEXT NOT NULL DEFAULT '',
  segment TEXT NOT NULL DEFAULT '',
  engineer TEXT,
  product TEXT,
  flex_status TEXT,
  hp_owner_status TEXT,
  wo_otc_code TEXT,
  account_name TEXT,
  customer_name TEXT,
  location TEXT,
  contact TEXT,
  part TEXT,
  wip_aging_category TEXT,
  tat TIMESTAMPTZ,
  customer_mail TEXT,
  rca TEXT,

  match_status TEXT NOT NULL,
  match_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_report_serial_no
    UNIQUE (report_id, serial_no)
);

CREATE INDEX idx_daily_report_rows_ticket
  ON daily_call_plan_report_rows(ticket_id);

CREATE INDEX idx_daily_report_rows_case
  ON daily_call_plan_report_rows(case_id);
