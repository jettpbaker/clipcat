import { z } from 'zod'

export const processSchema = z.object({
  key: z.string().min(1),
  duration: z.coerce.number().positive(),
  game: z.string().min(1),
})

export const startUploadSchema = z.object({
  key: z.string().min(1),
  fileType: z.string().min(1),
})

export const partUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
  partNumber: z.number(),
})

export const completeUploadSchema = z.object({
  key: z.string(),
  uploadId: z.string(),
  parts: z.array(z.object({ ETag: z.string().min(1), PartNumber: z.number().int().positive() })),
})

export const abortUploadSchema = z.object({
  key: z.string().min(1),
  uploadId: z.string().min(1),
})
