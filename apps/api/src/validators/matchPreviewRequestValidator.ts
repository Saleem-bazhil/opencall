import { z } from "zod";

export const matchPreviewRequestSchema = z.object({
  flexUploadBatchId: z.string().uuid(),
  renderwaysUploadBatchId: z.string().uuid().nullable().optional(),
  callPlanUploadBatchId: z.string().uuid().nullable().optional(),
});

export type MatchPreviewRequestInput = z.infer<
  typeof matchPreviewRequestSchema
>;
