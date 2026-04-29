import { cleanString, normalizePincode } from "../normalization/valueNormalizer.js";

export type Segment = "PC" | "Print" | "Install" | "";

export type LookupSource = ReadonlyMap<string, string> | Record<string, string>;

function isReadonlyMap<TValue>(
  lookup: ReadonlyMap<string, TValue> | Record<string, TValue>,
): lookup is ReadonlyMap<string, TValue> {
  return typeof (lookup as ReadonlyMap<string, TValue>).get === "function";
}

export function getSegment(
  productType: string | null | undefined,
  callClassification: string | null | undefined,
): Segment {
  const normalizedProductType = cleanString(productType)?.toUpperCase() ?? "";
  const normalizedClassification =
    cleanString(callClassification)?.toUpperCase() ?? "";

  if (normalizedProductType === "PC") {
    return "PC";
  }

  if (normalizedProductType === "PRINT") {
    return normalizedClassification === "INSTALL" ? "Install" : "Print";
  }

  return "";
}

export function calculateTAT(
  partnerAccept: Date | string | null | undefined,
  slaHours: number | null | undefined,
): string | null {
  if (!partnerAccept || slaHours === null || slaHours === undefined) {
    return null;
  }

  const start =
    partnerAccept instanceof Date ? partnerAccept : new Date(partnerAccept);

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  return new Date(start.getTime() + slaHours * 60 * 60 * 1000).toISOString();
}

export function mapLocation(
  pincode: string | null | undefined,
  areaNameByPincode?: LookupSource,
): string | null {
  const normalizedPincode = normalizePincode(pincode);

  if (!normalizedPincode) {
    return null;
  }

  if (!areaNameByPincode) {
    return normalizedPincode;
  }

  if (isReadonlyMap(areaNameByPincode)) {
    return areaNameByPincode.get(normalizedPincode) ?? normalizedPincode;
  }

  const areaByPincodeRecord = areaNameByPincode;
  return areaByPincodeRecord[normalizedPincode] ?? normalizedPincode;
}

export function getLookupNumber(
  lookup: ReadonlyMap<string, number> | Record<string, number> | undefined,
  key: string | null | undefined,
): number | null {
  const normalizedKey = cleanString(key);

  if (!lookup || !normalizedKey) {
    return null;
  }

  if (isReadonlyMap(lookup)) {
    return lookup.get(normalizedKey) ?? lookup.get(normalizedKey.toUpperCase()) ?? null;
  }

  const lookupRecord = lookup;
  return lookupRecord[normalizedKey] ?? lookupRecord[normalizedKey.toUpperCase()] ?? null;
}
