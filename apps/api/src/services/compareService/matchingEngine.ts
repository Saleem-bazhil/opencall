import type {
  EnrichedCallPlanRow,
  MatchedCallPlanInput,
  MatchedCallPlanRecord,
  MatchConfidence,
  MatchStatus,
} from "../../types/matching.js";
import type {
  CallPlanParsedRecord,
  FlexWipParsedRecord,
  RenderwaysParsedRecord,
} from "../../types/sourceRecords.js";
import {
  normalizeCaseId,
  normalizeTicketId,
} from "../normalization/valueNormalizer.js";
import {
  calculateTAT,
  getLookupNumber,
  getSegment,
  mapLocation,
} from "./enrichmentHelpers.js";

interface IndexedLookup<TRecord> {
  records: Map<string, TRecord>;
  duplicateKeys: Set<string>;
}

interface MatchResult<TRecord, TConfidence extends MatchConfidence> {
  record: TRecord | null;
  confidence: TConfidence;
  duplicateKey: string | null;
}

function stableRecordRank(record: { rowNumber: number; id?: string }): string {
  return `${String(record.rowNumber).padStart(12, "0")}:${record.id ?? ""}`;
}

function shouldReplaceSelectedRecord<TRecord extends { rowNumber: number; id?: string }>(
  current: TRecord,
  candidate: TRecord,
): boolean {
  return stableRecordRank(candidate) < stableRecordRank(current);
}

function buildSingleRecordLookup<TRecord extends { rowNumber: number; id?: string }>(
  records: readonly TRecord[],
  getKey: (record: TRecord) => string | null,
): IndexedLookup<TRecord> {
  const lookup: IndexedLookup<TRecord> = {
    records: new Map<string, TRecord>(),
    duplicateKeys: new Set<string>(),
  };

  for (const record of records) {
    const key = getKey(record);

    if (!key) {
      continue;
    }

    const current = lookup.records.get(key);

    if (!current) {
      lookup.records.set(key, record);
      continue;
    }

    lookup.duplicateKeys.add(key);

    if (shouldReplaceSelectedRecord(current, record)) {
      lookup.records.set(key, record);
    }
  }

  return lookup;
}

function canonicalTicketKey(
  record: Pick<FlexWipParsedRecord | RenderwaysParsedRecord | CallPlanParsedRecord, "ticketId" | "normalizedTicketId">,
): string | null {
  const key = normalizeTicketId(record.ticketId ?? record.normalizedTicketId);
  return key.length > 0 ? key : null;
}

function canonicalCaseKey(
  record: Pick<FlexWipParsedRecord | RenderwaysParsedRecord, "caseId" | "normalizedCaseId">,
): string | null {
  const key = normalizeCaseId(record.caseId ?? record.normalizedCaseId);
  return key.length > 0 ? key : null;
}

function findFlexMatch(
  renderways: RenderwaysParsedRecord,
  flexByTicket: IndexedLookup<FlexWipParsedRecord>,
  flexByCase: IndexedLookup<FlexWipParsedRecord>,
): MatchResult<FlexWipParsedRecord, MatchConfidence> {
  const ticketKey = canonicalTicketKey(renderways);

  if (ticketKey) {
    const ticketMatch = flexByTicket.records.get(ticketKey);

    if (ticketMatch) {
      return {
        record: ticketMatch,
        confidence: "TICKET_ID",
        duplicateKey: flexByTicket.duplicateKeys.has(ticketKey) ? ticketKey : null,
      };
    }
  }

  const caseKey = canonicalCaseKey(renderways);

  if (caseKey) {
    const caseMatch = flexByCase.records.get(caseKey);

    if (caseMatch) {
      return {
        record: caseMatch,
        confidence: "CASE_ID",
        duplicateKey: flexByCase.duplicateKeys.has(caseKey) ? caseKey : null,
      };
    }
  }

  return {
    record: null,
    confidence: "UNMATCHED",
    duplicateKey: null,
  };
}

function findCallPlanMatch(
  ticketKey: string | null,
  callPlanByTicket: IndexedLookup<CallPlanParsedRecord>,
): MatchResult<CallPlanParsedRecord, Exclude<MatchConfidence, "CASE_ID">> {
  if (!ticketKey) {
    return {
      record: null,
      confidence: "UNMATCHED",
      duplicateKey: null,
    };
  }

  const match = callPlanByTicket.records.get(ticketKey);

  return match
    ? {
        record: match,
        confidence: "TICKET_ID",
        duplicateKey: callPlanByTicket.duplicateKeys.has(ticketKey)
          ? ticketKey
          : null,
      }
    : {
        record: null,
        confidence: "UNMATCHED",
        duplicateKey: null,
      };
}

function classifyMatchStatus(
  flexWip: FlexWipParsedRecord | null,
  callPlan: CallPlanParsedRecord | null,
): MatchStatus {
  if (flexWip && callPlan) {
    return "MATCHED";
  }

  if (!flexWip && !callPlan) {
    return "BOTH_MISSING";
  }

  return flexWip ? "CALLPLAN_MISSING" : "FLEX_MISSING";
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildEnrichedRow(
  renderways: RenderwaysParsedRecord,
  flexWip: FlexWipParsedRecord | null,
  callPlan: CallPlanParsedRecord | null,
  matchStatus: MatchStatus,
  input: MatchedCallPlanInput,
): EnrichedCallPlanRow {
  const slaHours = getLookupNumber(
    input.slaHoursByWipAgingCategory,
    renderways.wipAgingCategory,
  );

  return {
    ticket_id: renderways.ticketId ?? flexWip?.ticketId ?? callPlan?.ticketId ?? "",
    case_id: renderways.caseId ?? flexWip?.caseId ?? "",
    case_created_time: toIsoString(renderways.partnerAccept),
    wip_aging: renderways.wipAging,
    rtpl_status: callPlan?.morningStatus ?? "",
    segment: getSegment(renderways.productType, renderways.callClassification),
    engineer: callPlan?.engineer ?? null,
    product: flexWip?.product ?? null,
    flex_status: flexWip?.flexStatus ?? null,
    hp_owner_status: renderways.hpOwner,
    wo_otc_code: flexWip?.woOtcCode ?? null,
    account_name: flexWip?.accountName ?? null,
    customer_name: flexWip?.customerName ?? null,
    location: callPlan?.location ?? mapLocation(flexWip?.customerPincode, input.areaNameByPincode),
    contact: flexWip?.contact ?? null,
    part: flexWip?.partDescription ?? null,
    wip_aging_category: renderways.wipAgingCategory,
    tat: calculateTAT(renderways.partnerAccept, slaHours),
    customer_mail: flexWip?.customerEmail ?? null,
    rca: renderways.rcaMessage,
    match_status: matchStatus,
  };
}

function buildMatchNotes(
  flexMatch: MatchResult<FlexWipParsedRecord, MatchConfidence>,
  callPlanMatch: MatchResult<
    CallPlanParsedRecord,
    Exclude<MatchConfidence, "CASE_ID">
  >,
  renderways: RenderwaysParsedRecord,
  flexCallPlanTicketKey: string | null,
): string[] {
  const notes: string[] = [];

  if (flexMatch.confidence === "UNMATCHED") {
    notes.push("No Flex WIP match found by Ticket ID or Case ID");
  }

  if (callPlanMatch.confidence === "UNMATCHED") {
    notes.push("No Call Plan match found by Ticket ID");
  }

  if (flexMatch.duplicateKey) {
    notes.push(
      `Multiple Flex WIP rows found for ${flexMatch.confidence}: ${flexMatch.duplicateKey}; selected lowest row number`,
    );
  }

  if (callPlanMatch.duplicateKey) {
    notes.push(
      `Multiple Call Plan rows found for Ticket ID: ${callPlanMatch.duplicateKey}; selected lowest row number`,
    );
  }

  if (!canonicalTicketKey(renderways) && flexCallPlanTicketKey) {
    notes.push("Call Plan lookup used Flex WIP Ticket ID after Case ID match");
  }

  return notes;
}

export function matchSourceRecords(
  input: MatchedCallPlanInput,
): MatchedCallPlanRecord[] {
  const flexByTicket = buildSingleRecordLookup(input.flexWip, canonicalTicketKey);
  const flexByCase = buildSingleRecordLookup(input.flexWip, canonicalCaseKey);
  const callPlanByTicket = buildSingleRecordLookup(
    input.callPlan,
    canonicalTicketKey,
  );
  const matchedRecords: MatchedCallPlanRecord[] = [];

  for (const renderways of input.renderways) {
    const flexMatch = findFlexMatch(renderways, flexByTicket, flexByCase);
    const renderwaysTicketKey = canonicalTicketKey(renderways);
    const flexCallPlanTicketKey = flexMatch.record
      ? canonicalTicketKey(flexMatch.record)
      : null;
    const callPlanTicketKey = renderwaysTicketKey ?? flexCallPlanTicketKey;
    const callPlanMatch = findCallPlanMatch(callPlanTicketKey, callPlanByTicket);
    const matchStatus = classifyMatchStatus(
      flexMatch.record,
      callPlanMatch.record,
    );

    matchedRecords.push({
      renderways,
      flexWip: flexMatch.record,
      callPlan: callPlanMatch.record,
      flexMatchConfidence: flexMatch.confidence,
      callPlanMatchConfidence: callPlanMatch.confidence,
      matchStatus,
      enrichedRow: buildEnrichedRow(
        renderways,
        flexMatch.record,
        callPlanMatch.record,
        matchStatus,
        input,
      ),
      notes: buildMatchNotes(
        flexMatch,
        callPlanMatch,
        renderways,
        flexCallPlanTicketKey,
      ),
    });
  }

  return matchedRecords;
}
