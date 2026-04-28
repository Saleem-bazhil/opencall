import { z } from "zod";

export const loginRequestSchema = z.object({
  email: z.string().email(),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
