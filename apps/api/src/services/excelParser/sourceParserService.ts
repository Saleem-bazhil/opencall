import type { UploadSourceType } from "@opencall/shared";
import type {
  CallPlanParsedRecord,
  FlexWipParsedRecord,
  ParsedSourceFile,
  RenderwaysParsedRecord,
} from "../../types/sourceRecords.js";
import {
  parseCallPlanReport,
  parseFlexWipReport,
  parseRenderwaysReport,
} from "./sourceParsers.js";

export type ParsedUploadBySource = {
  FLEX_WIP: ParsedSourceFile<FlexWipParsedRecord>;
  RENDERWAYS: ParsedSourceFile<RenderwaysParsedRecord>;
  CALL_PLAN: ParsedSourceFile<CallPlanParsedRecord>;
};

export function parseSourceFile(
  sourceType: "FLEX_WIP",
  filePath: string,
): ParsedUploadBySource["FLEX_WIP"];
export function parseSourceFile(
  sourceType: "RENDERWAYS",
  filePath: string,
): ParsedUploadBySource["RENDERWAYS"];
export function parseSourceFile(
  sourceType: "CALL_PLAN",
  filePath: string,
): ParsedUploadBySource["CALL_PLAN"];
export function parseSourceFile(
  sourceType: UploadSourceType,
  filePath: string,
): ParsedUploadBySource[UploadSourceType] {
  switch (sourceType) {
    case "FLEX_WIP":
      return parseFlexWipReport(filePath);
    case "RENDERWAYS":
      return parseRenderwaysReport(filePath);
    case "CALL_PLAN":
      return parseCallPlanReport(filePath);
  }
}
