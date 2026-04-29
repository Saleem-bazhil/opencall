import { pool } from "../../config/database.js";
import {
  findCallPlanRecordsByBatchId,
  findFlexWipRecordsByBatchId,
  findRenderwaysRecordsByBatchId,
} from "../../repositories/sourceRecordRepository.js";
import { findUploadBatchesForValidation } from "../../repositories/uploadBatchRepository.js";
import {
  findActiveSlaHoursByCategory,
  findAreaNameByPincode,
} from "../../repositories/businessRuleRepository.js";
import { assertCanAccessBatchRegions } from "../rbac/regionAccessService.js";
import type { AuthenticatedUser } from "../../types/auth.js";
import type {
  EnrichedCallPlanRow,
  MatchedCallPlanRecord,
  MatchStatus,
} from "../../types/matching.js";
import { unprocessableEntity } from "../../utils/httpError.js";
import { matchSourceRecords } from "./matchingEngine.js";

export interface MatchPreviewInput {
  flexUploadBatchId: string;
  renderwaysUploadBatchId: string;
  callPlanUploadBatchId: string;
  currentUser: AuthenticatedUser;
  regionId: string;
}

export interface MatchPreviewResult {
  totalRenderwaysRows: number;
  flexMatchedRows: number;
  callPlanMatchedRows: number;
  unmatchedFlexRows: number;
  unmatchedCallPlanRows: number;
  matchStatusCounts: Record<MatchStatus, number>;
  enrichedRows: EnrichedCallPlanRow[];
  matches: MatchedCallPlanRecord[];
}

export async function previewMatches(
  input: MatchPreviewInput,
): Promise<MatchPreviewResult> {
  const client = await pool.connect();

  try {
    const batchIds = [
      input.flexUploadBatchId,
      input.renderwaysUploadBatchId,
      input.callPlanUploadBatchId,
    ];
    const batches = await findUploadBatchesForValidation(client, batchIds);

    if (batches.length !== batchIds.length) {
      const foundBatchIds = new Set(batches.map((batch) => batch.id));
      throw unprocessableEntity("One or more upload batches were not found", {
        missingBatchIds: batchIds.filter((batchId) => !foundBatchIds.has(batchId)),
      });
    }

    assertCanAccessBatchRegions(input.currentUser, batches);

    const flexWip = await findFlexWipRecordsByBatchId(
      client,
      input.flexUploadBatchId,
    );
    const renderways = await findRenderwaysRecordsByBatchId(
      client,
      input.renderwaysUploadBatchId,
    );
    const callPlan = await findCallPlanRecordsByBatchId(
      client,
      input.callPlanUploadBatchId,
    );

    const slaHoursByWipAgingCategory = await findActiveSlaHoursByCategory(client);
    const areaNameByPincode = await findAreaNameByPincode(
      client,
      input.regionId,
    );

    const matches = matchSourceRecords({
      flexWip,
      renderways,
      callPlan,
      slaHoursByWipAgingCategory,
      areaNameByPincode,
    });
    let flexMatchedRows = 0;
    let callPlanMatchedRows = 0;
    const enrichedRows: EnrichedCallPlanRow[] = [];
    const matchStatusCounts: Record<MatchStatus, number> = {
      MATCHED: 0,
      FLEX_MISSING: 0,
      CALLPLAN_MISSING: 0,
      BOTH_MISSING: 0,
    };

    for (const match of matches) {
      if (match.flexWip) {
        flexMatchedRows += 1;
      }

      if (match.callPlan) {
        callPlanMatchedRows += 1;
      }

      matchStatusCounts[match.matchStatus] += 1;
      enrichedRows.push(match.enrichedRow);
    }

    return {
      totalRenderwaysRows: renderways.length,
      flexMatchedRows,
      callPlanMatchedRows,
      unmatchedFlexRows: renderways.length - flexMatchedRows,
      unmatchedCallPlanRows: renderways.length - callPlanMatchedRows,
      matchStatusCounts,
      enrichedRows,
      matches,
    };
  } finally {
    client.release();
  }
}
