import { z } from "zod";

function isValidDateOnly(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === value;
}

export const reportGenerationRequestSchema = z.object({
  reportDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidDateOnly, "reportDate must be a valid YYYY-MM-DD date"),
  generatedBy: z.string().uuid(),
  regionId: z.string().uuid().nullable().optional(),
  flexUploadBatchId: z.string().uuid(),
  renderwaysUploadBatchId: z.string().uuid().nullable().optional(),
  callPlanUploadBatchId: z.string().uuid().nullable().optional(),
});

export type ReportGenerationRequestInput = z.infer<
  typeof reportGenerationRequestSchema
>;
