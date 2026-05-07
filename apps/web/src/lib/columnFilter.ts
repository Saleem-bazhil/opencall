/**
 * Lightweight column-filter engine for the report table.
 *
 * Keeps filter state as a plain map of column → Set<selected values>.
 * All helpers are pure functions – React hook lives in `useColumnFilters`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { DAILY_CALL_PLAN_COLUMNS } from "@opencall/shared";

/** Map of column names to the set of currently-selected (checked) values. */
export type ColumnFilterState = Record<string, Set<string>>;

/** A single column's unique values with their occurrence counts. */
export interface ColumnUniqueEntry {
  value: string;
  count: number;
}

/** Columns that support per-column filtering. */
export const FILTERABLE_COLUMNS = DAILY_CALL_PLAN_COLUMNS;

export type FilterableColumn = (typeof FILTERABLE_COLUMNS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a cell value to a stable string for comparison / display. */
export function normalizeFilterValue(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return s === "" ? "(blank)" : s;
}

/**
 * Extract unique values (+ counts) for a single column from the given rows.
 * Returns entries sorted alphabetically by value.
 */
export function extractUniqueValues<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[], column: string): ColumnUniqueEntry[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const normalised = normalizeFilterValue(row.output[column]);
    counts.set(normalised, (counts.get(normalised) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

/**
 * Build a Map of every filterable column → unique entries for the given rows.
 * This is the value you memoize once per visible-row set.
 */
export function buildUniqueValuesMap<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[]): Map<string, ColumnUniqueEntry[]> {
  const map = new Map<string, ColumnUniqueEntry[]>();

  for (const col of FILTERABLE_COLUMNS) {
    map.set(col, extractUniqueValues(rows, col));
  }

  return map;
}

// ---------------------------------------------------------------------------
// Filter application
// ---------------------------------------------------------------------------

/**
 * Does a single row pass ALL active column filters?
 *
 * A column filter is considered "inactive" (no-op) when:
 *   - Its set is empty (user cleared everything – we treat that as "no filter")
 *   - Its set has the same size as the total unique values for that column
 *     (all selected → same as "no filter").  This check is optional/caller
 *     responsibility; here we only check emptiness.
 */
export function rowPassesFilters<
  T extends { output: Record<string, string | number> },
>(row: T, filters: ColumnFilterState): boolean {
  for (const column of FILTERABLE_COLUMNS) {
    const selected = filters[column];

    // No filter or empty set → column is unfiltered
    if (!selected) {
      continue;
    }

    if (selected.size === 0) {
      return false;
    }

    const normalised = normalizeFilterValue(row.output[column]);

    if (!selected.has(normalised)) {
      return false;
    }
  }

  return true;
}

/**
 * Apply column filters to an array of rows.
 * Returns a new array (never mutates input).
 */
export function applyColumnFilters<
  T extends { output: Record<string, string | number> },
>(rows: readonly T[], filters: ColumnFilterState): T[] {
  // Quick exit when nothing is filtered
  const hasActiveFilter = FILTERABLE_COLUMNS.some((col) => {
    const s = filters[col];
    return Boolean(s);
  });

  if (!hasActiveFilter) {
    return rows as T[];
  }

  return rows.filter((row) => rowPassesFilters(row, filters));
}

/**
 * Returns the number of active column filters (columns that have a
 * non-empty selection set).
 */
export function activeFilterCount(filters: ColumnFilterState): number {
  let count = 0;

  for (const col of FILTERABLE_COLUMNS) {
    const s = filters[col];
    if (s) {
      count++;
    }
  }

  return count;
}

/**
 * Returns true when a specific column has an active filter.
 */
export function isColumnFiltered(
  filters: ColumnFilterState,
  column: string,
): boolean {
  const s = filters[column];
  return Boolean(s);
}
