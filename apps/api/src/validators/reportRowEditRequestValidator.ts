import { z } from "zod";

export const reportRowEditRequestSchema = z
  .object({
    engineer: z.string().nullable().optional(),
    rtpl_status: z.string().nullable().optional(),
    customer_mail: z.string().nullable().optional(),
    rca: z.string().nullable().optional(),
    remarks: z.string().nullable().optional(),
    manual_notes: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one editable field is required",
  })
  .transform((body) => ({
    engineer: body.engineer,
    rtplStatus: body.rtpl_status,
    customerMail: body.customer_mail,
    rca: body.rca,
    remarks: body.remarks,
    manualNotes: body.manual_notes,
    location: body.location,
    segment: body.segment,
  }));
