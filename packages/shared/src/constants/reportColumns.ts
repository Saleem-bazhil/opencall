// Daily Call Plan Report output columns.
// Order is strict and must never be changed without a migration/version update.
export const DAILY_CALL_PLAN_COLUMNS = [
  "S.no",
  "Ticket ID",
  "Case ID",
  "Case Created Time",
  "WIP aging",
  "RTPL status",
  "Segment",
  "Engineer",
  "Product",
  "Product Line Name",
  "Work Location",
  "Flex Status",
  "HP Owner Status",
  "WO OTC CODE",
  "Account Name",
  "Customer Name",
  "Location",
  "Contact",
  "Part",
  "WIP Aging Category",
  "TAT",
  "Customer Mail",
  "RCA",
] as const;

export type DailyCallPlanColumn = (typeof DAILY_CALL_PLAN_COLUMNS)[number];
