import { z } from "zod";

export const settingsSchema = z.object({
  mediaBias: z.string().trim().min(1).max(100),
  mediaBiasId: z.string().trim().min(1).max(80).optional(),
  biasIntensity: z.number().int().min(0).max(100),
  criticalIntensity: z.number().int().min(0).max(100),
  excitement: z.number().int().min(0).max(100),
  outputLength: z.string().trim().min(1).max(100),
  audience: z.string().trim().min(1).max(100),
  platform: z.string().trim().min(1).max(100),
});

export const generationSchema = z.object({
  articleId: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(3).max(300),
  sources: z.array(z.object({ kind:z.enum(["url","text"]), value:z.string().trim().min(1).max(120_000) })).min(1).max(6),
}).merge(settingsSchema);

export const biasInputSchema=z.object({
  name:z.string().trim().min(2).max(100),
  worldview:z.string().trim().min(3).max(4000),
  tone:z.string().trim().min(2).max(1000),
  goals:z.string().trim().min(2).max(4000),
  redLines:z.string().trim().min(2).max(4000),
});

export const biasUpdateSchema=biasInputSchema.extend({
  prompt:z.string().trim().min(20).max(80_000),
  status:z.enum(["active","archived"]).optional(),
});

export const saveSchema = z.object({
  id: z.string().optional(), subject:z.string().trim().min(1), headline:z.string(), lead:z.string(), body:z.string(), status:z.enum(["draft","ready"]).optional(),
  sources:z.array(z.any()).optional(),
}).merge(settingsSchema);
