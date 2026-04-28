import { normalizeHeader } from "../normalization/headerNormalizer.js";

export function getCell(
  row: Record<string, unknown>,
  aliases: readonly string[],
): unknown {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([key]) =>
    normalizedAliases.has(normalizeHeader(key)),
  );

  return entry?.[1] ?? null;
}
