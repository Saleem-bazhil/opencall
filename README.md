# OpenCall

Production-grade full-stack system for generating the Daily Call Plan Report from:

- Flex WIP Report
- Renderways Report
- Call Plan / Open Call Sheet

## Phase 1 Scope

This repository currently contains the foundational monorepo structure, shared TypeScript contracts, and PostgreSQL schema required by later implementation phases.

## Workspace

```txt
apps/api        Node.js + Express backend
apps/web        Next.js frontend
packages/shared Shared report, RBAC, and source-type contracts
infra/postgres  PostgreSQL migrations and seeds
```

## Report Contract

The Daily Call Plan Report must always emit exactly 21 columns in the order defined in:

```txt
packages/shared/src/constants/reportColumns.ts
```

## Database

Initial schema:

```txt
infra/postgres/migrations/001_initial_schema.sql
```

Initial seed data:

```txt
infra/postgres/seeds/001_region_mapping.sql
```

## Phase 2 API

Backend entrypoint:

```txt
apps/api/src/server.ts
```

## RBAC

Protected API routes require:

```txt
Authorization: Bearer <jwt>
```

Create a token:

```txt
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@example.com"
}
```

Region behavior:

```txt
SUPER_ADMIN   can access all regions and may pass x-region-id
REGION_ADMIN  is restricted to users.region_id
```

Protected routes:

```txt
POST /api/v1/uploads
POST /api/v1/matches/preview
POST /api/v1/reports/daily-call-plan/generate
```

For `REGION_ADMIN`, any supplied `x-region-id` must match the user assigned region. Upload batches from another region are rejected during match preview and report generation.

Health check:

```txt
GET /api/v1/health
```

Database health check:

```txt
GET /api/v1/health/db
```

Runtime readiness check:

```txt
GET /api/v1/health/runtime
```

This verifies the required PostgreSQL tables and columns for upload parsing, matching, SLA lookup, pincode lookup, and Daily Call Plan persistence.

Successful DB response:

```json
{
  "data": {
    "service": "postgres",
    "status": "connected",
    "connected": true,
    "databaseName": "opencall",
    "latencyMs": 12
  }
}
```

One-time DB check:

```txt
pnpm --filter @opencall/api db:check
```

Upload and validate the three Excel sources:

```txt
POST /api/v1/uploads
Content-Type: multipart/form-data
Headers:
  Authorization: Bearer <jwt>
  x-region-id: <uuid optional>

Fields:
  flexWipReport: <Flex WIP Excel file>
  renderwaysReport: <Renderways Excel file>
  callPlan: <Call Plan Excel file>
```

Phase 2 validates required files, Excel extension, upload metadata, and required source columns. Row-level parsing and matching are implemented in later phases.
Phase 3 parses valid Excel rows into normalized source tables and exposes a match preview API.

Responses:

```txt
201 Created                 all three files passed header validation
422 Unprocessable Content   one or more files are missing required columns
400 Bad Request             invalid metadata, missing files, or unsupported file type
```

Upload response includes:

```txt
batches         persisted source_upload_batches rows
validations     required column validation results
parseSummaries  parsed row counts, row issue counts, and duplicate normalized IDs
```

Match preview:

```txt
POST /api/v1/matches/preview
Content-Type: application/json

{
  "flexUploadBatchId": "<uuid>",
  "renderwaysUploadBatchId": "<uuid>",
  "callPlanUploadBatchId": "<uuid>"
}
```

Matching behavior:

```txt
1. Renderways is the primary row source.
2. Flex WIP is matched by normalized Ticket ID first.
3. If Ticket ID does not match, Flex WIP is matched by normalized Case ID.
4. Call Plan is matched by normalized Ticket ID.
5. If Renderways lacks Ticket ID but Flex matched by Case ID, Call Plan lookup uses the matched Flex Ticket ID.
```

Generate and persist Daily Call Plan Report:

```txt
POST /api/v1/reports/daily-call-plan/generate
Content-Type: application/json
Headers:
  Authorization: Bearer <jwt>
  x-region-id: <uuid optional>

{
  "reportDate": "2026-04-28",
  "flexUploadBatchId": "<uuid>",
  "renderwaysUploadBatchId": "<uuid>",
  "callPlanUploadBatchId": "<uuid>"
}
```

The generated response includes the strict 21 report columns, persisted `reportId`, row totals, duplicate ticket count, unmatched ticket count, and generated rows.

Report generation validation:

```txt
- source batch IDs must be distinct
- batch source types must match Flex WIP, Renderways, and Call Plan
- failed batches or batches with validation errors are rejected
- empty source batches are rejected
- duplicate report generation for the same date and upload batches is rejected
- validation runs inside the same transaction as report persistence
```
