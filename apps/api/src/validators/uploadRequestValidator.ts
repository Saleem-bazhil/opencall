import { z } from "zod";

export const uploadRequestSchema = z.object({
  uploadedBy: z.string().uuid(),
  regionId: z.string().uuid().nullable().optional(),
});

export type UploadRequestInput = z.infer<typeof uploadRequestSchema>;
