export function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value).trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

export function cleanRequiredString(value: unknown): string {
  return cleanString(value) ?? "";
}

export function normalizeIdentifier(value: unknown): string {
  const cleaned = cleanRequiredString(value).toUpperCase();
  return cleaned.replace(/[^A-Z0-9]/g, "");
}

export function normalizeTicketId(value: unknown): string {
  const cleaned = cleanRequiredString(value).toUpperCase();
  const withoutSeparators = cleaned.replace(/[\s_-]+/g, "");
  return withoutSeparators.replace(/[^A-Z0-9]/g, "");
}

export function normalizeCaseId(value: unknown): string {
  return normalizeIdentifier(value).replace(/^CASE/, "");
}

export function normalizePincode(value: unknown): string | null {
  const digits = cleanRequiredString(value).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export function parseExcelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const cleaned = cleanString(value)?.replace(/^Cre:\s*/i, "");
  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
