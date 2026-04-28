import { z } from "zod";

export const matchPreviewRequestSchema = z.object({
  flexUploadBatchId: z.string().uuid(),
  renderwaysUploadBatchId: z.string().uuid(),
  callPlanUploadBatchId: z.string().uuid(),
});

export type MatchPreviewRequestInput = z.infer<
  typeof matchPreviewRequestSchema
>;
