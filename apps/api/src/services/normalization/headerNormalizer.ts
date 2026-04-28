import type { RequiredColumnDefinition } from "@opencall/shared";

export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function displayHeader(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function buildHeaderAliasMap(
  requiredColumns: readonly RequiredColumnDefinition[],
): Map<string, string> {
  const aliasMap = new Map<string, string>();

  for (const column of requiredColumns) {
    aliasMap.set(normalizeHeader(column.canonical), column.canonical);

    for (const alias of column.aliases) {
      aliasMap.set(normalizeHeader(alias), column.canonical);
    }
  }

  return aliasMap;
}
