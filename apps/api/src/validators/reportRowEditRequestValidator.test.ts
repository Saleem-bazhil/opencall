import { describe, expect, it } from "vitest";
import { reportRowEditRequestSchema } from "./reportRowEditRequestValidator.js";

describe("reportRowEditRequestSchema", () => {
  it("rejects non-editable system fields", () => {
    const result = reportRowEditRequestSchema.safeParse({
      ticket_id: "WO-123",
    });

    expect(result.success).toBe(false);
  });

  it("maps editable API fields to service fields", () => {
    const result = reportRowEditRequestSchema.parse({
      engineer: "Mike",
      rtpl_status: "Pending",
      customer_mail: "customer@example.com",
      manual_notes: "Call before noon",
    });

    expect(result).toEqual({
      engineer: "Mike",
      rtplStatus: "Pending",
      customerMail: "customer@example.com",
      rca: undefined,
      remarks: undefined,
      manualNotes: "Call before noon",
      location: undefined,
      segment: undefined,
    });
  });
});
