import {
  DAILY_CALL_PLAN_COLUMNS,
  type DailyCallPlanColumn,
} from "@opencall/shared";
import type { EnrichedCallPlanRow } from "../../types/matching.js";
import type { DailyCallPlanOutputRow } from "../../types/reportGeneration.js";

function valueOrEmpty(value: string | number | null | undefined): string | number {
  return value ?? "";
}

export function formatDailyCallPlanRow(
  serialNo: number,
  row: EnrichedCallPlanRow,
): DailyCallPlanOutputRow {
  return {
    "S.no": serialNo,
    "Ticket ID": valueOrEmpty(row.ticket_id),
    "Case ID": valueOrEmpty(row.case_id),
    "Case Created Time": valueOrEmpty(row.case_created_time),
    "WIP aging": valueOrEmpty(row.wip_aging),
    "RTPL status": valueOrEmpty(row.rtpl_status),
    Segment: valueOrEmpty(row.segment),
    Engineer: valueOrEmpty(row.engineer),
    Product: valueOrEmpty(row.product),
    "Flex Status": valueOrEmpty(row.flex_status),
    "HP Owner Status": valueOrEmpty(row.hp_owner_status),
    "WO OTC CODE": valueOrEmpty(row.wo_otc_code),
    "Account Name": valueOrEmpty(row.account_name),
    "Customer Name": valueOrEmpty(row.customer_name),
    Location: valueOrEmpty(row.location),
    Contact: valueOrEmpty(row.contact),
    Part: valueOrEmpty(row.part),
    "WIP Aging Category": valueOrEmpty(row.wip_aging_category),
    TAT: valueOrEmpty(row.tat),
    "Customer Mail": valueOrEmpty(row.customer_mail),
    RCA: valueOrEmpty(row.rca),
  };
}

export function orderedDailyCallPlanRow(
  row: DailyCallPlanOutputRow,
): DailyCallPlanOutputRow {
  return DAILY_CALL_PLAN_COLUMNS.reduce((ordered, column) => {
    ordered[column] = row[column];
    return ordered;
  }, {} as Record<DailyCallPlanColumn, string | number>);
}
