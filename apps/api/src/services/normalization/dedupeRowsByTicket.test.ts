import { describe, expect, it } from "vitest";
import { dedupeRowsByTicket } from "./dedupeRowsByTicket.js";

describe("dedupeRowsByTicket", () => {
  it("dedupes by normalized ticket key and counts removed duplicates", () => {
    const result = dedupeRowsByTicket([
      {
        ticketId: "WO-000123",
        rowNumber: 2,
        flexStatus: "OPEN",
      },
      {
        ticketId: "123",
        rowNumber: 1,
        flexStatus: "CLOSED",
        engineer: "Alex",
      },
      {
        ticketId: "WO-000124",
        rowNumber: 3,
        flexStatus: "OPEN",
      },
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.dedupedRows).toHaveLength(2);
    expect(result.dedupedRows[0]?.ticketId).toBe("123");
    expect(result.dedupedRows[1]?.ticketId).toBe("WO-000124");
  });

  it("prefers the row with the most meaningful non-null fields", () => {
    const result = dedupeRowsByTicket([
      {
        ticketId: "WO-34004086",
        rowNumber: 1,
        flexStatus: "OPEN",
        engineer: null,
        location: "   ",
      },
      {
        ticketId: "wo34004086",
        rowNumber: 2,
        flexStatus: "OPEN",
        engineer: "Sam",
        location: "Delhi",
      },
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.dedupedRows[0]).toMatchObject({
      rowNumber: 2,
      engineer: "Sam",
      location: "Delhi",
    });
  });

  it("prefers the latest timestamp when completeness ties", () => {
    const result = dedupeRowsByTicket([
      {
        ticketId: "WO-034067433",
        rowNumber: 5,
        flexStatus: "OPEN",
        partnerAccept: new Date("2026-05-04T08:00:00.000Z"),
      },
      {
        ticketId: "WO034067433",
        rowNumber: 9,
        flexStatus: "OPEN",
        partnerAccept: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    expect(result.dedupedRows[0]).toMatchObject({
      rowNumber: 9,
    });
  });

  it("falls back to the lowest row number when completeness and timestamp tie", () => {
    const result = dedupeRowsByTicket([
      {
        ticketId: "WO-900",
        rowNumber: 7,
        flexStatus: "OPEN",
      },
      {
        ticketId: "wo900",
        rowNumber: 3,
        flexStatus: "OPEN",
      },
    ]);

    expect(result.dedupedRows[0]).toMatchObject({
      rowNumber: 3,
    });
  });
});
