"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnUniqueEntry } from "../lib/columnFilter";

export interface ColumnFilterDropdownProps {
  column: string;
  isOpen: boolean;
  uniqueValues: ColumnUniqueEntry[];
  selectedValues: Set<string> | undefined;
  isFiltered: boolean;
  onToggleValue: (column: string, value: string) => void;
  onSelectAll: (column: string) => void;
  onClearAll: (column: string) => void;
  onApply: (column: string, values: Set<string>) => void;
  onOpen: (column: string) => void;
  onClose: () => void;
}

export function ColumnFilterDropdown({
  column,
  isOpen,
  uniqueValues,
  selectedValues,
  isFiltered,
  onSelectAll,
  onApply,
  onOpen,
  onClose,
}: ColumnFilterDropdownProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [draftSelection, setDraftSelection] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftSelection(selectedValues ? new Set(selectedValues) : null);
      setSearch("");
    }
  }, [isOpen, selectedValues]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const visibleEntries = useMemo(() => {
    if (!search.trim()) return uniqueValues;
    const lowerSearch = search.toLowerCase();
    return uniqueValues.filter((entry) =>
      entry.value.toLowerCase().includes(lowerSearch),
    );
  }, [uniqueValues, search]);

  const toggleDraft = useCallback(
    (value: string) => {
      setDraftSelection((prev) => {
        const next = new Set(prev ?? uniqueValues.map((entry) => entry.value));
        if (next.has(value)) {
          next.delete(value);
        } else {
          next.add(value);
        }
        return next;
      });
    },
    [uniqueValues],
  );

  const selectAllDraft = useCallback(() => {
    setDraftSelection(null);
  }, []);

  const unselectAllDraft = useCallback(() => {
    setDraftSelection(new Set());
  }, []);

  const handleApply = useCallback(() => {
    if (draftSelection === null) {
      onSelectAll(column);
    } else {
      onApply(column, draftSelection);
    }
    onClose();
  }, [column, draftSelection, onApply, onClose, onSelectAll]);

  const isAllSelected = draftSelection === null;
  const totalUniqueCount = uniqueValues.length;

  return (
    <div className="colFilterWrap" ref={wrapperRef}>
      <button
        type="button"
        className={`colFilterBtn ${isFiltered ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            onClose();
          } else {
            onOpen(column);
          }
        }}
        title={`Filter ${column}`}
        aria-label={`Filter ${column}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 2h14l-5.5 6.5V14l-3-1.5V8.5L1 2z"
            fill="currentColor"
          />
        </svg>
        {isFiltered && <span className="colFilterDot" />}
      </button>

      {isOpen && (
        <div className="colFilterDropdown">
          <div className="colFilterSearch">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${column}...`}
              autoFocus
            />
          </div>

          <div className="colFilterList">
            <label className="colFilterItem colFilterItemAll">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={() => {
                  if (isAllSelected) {
                    unselectAllDraft();
                  } else {
                    selectAllDraft();
                  }
                }}
              />
              <span>(Select All)</span>
              <span className="colFilterCount">{totalUniqueCount}</span>
            </label>

            {visibleEntries.map((entry) => {
              const checked =
                isAllSelected || Boolean(draftSelection?.has(entry.value));
              return (
                <label className="colFilterItem" key={entry.value}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDraft(entry.value)}
                  />
                  <span className="colFilterValue">{entry.value}</span>
                  <span className="colFilterCount">{entry.count}</span>
                </label>
              );
            })}

            {visibleEntries.length === 0 && (
              <div className="colFilterEmpty">No matches</div>
            )}
          </div>

          <div className="colFilterActions">
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={selectAllDraft}
            >
              Select All
            </button>
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={unselectAllDraft}
            >
              Unselect All
            </button>
            <button
              type="button"
              className="colFilterActionBtn secondary"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
            <button
              type="button"
              className="colFilterActionBtn primary"
              onClick={handleApply}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
