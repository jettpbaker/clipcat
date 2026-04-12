import { z } from 'zod'

const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
})

const createClipResponseSuccessSchema = z.object({
  ok: z.literal(true),
  clipId: z.uuid(),
  status: z.literal('processing'),
})

export const createClipResponseSchema = z.union([apiErrorSchema, createClipResponseSuccessSchema])

export type CreateClipResponse = z.infer<typeof createClipResponseSchema>

export const enqueueClipProcessingSchema = z.object({
  title: z.string().min(1),
  game: z.string().min(1),
  inputKey: z.string().min(1),
  uploadStartedAt: z.coerce.date(),
  uploadCompletedAt: z.coerce.date(),
})

const clipProcessingCallbackFailureSchema = z.object({
  ok: z.literal(false),
  clipId: z.uuid(),
  modalCallId: z.string().min(1),
  errorMessage: z.string().min(1),
  processingStartedAt: z.coerce.date(),
  failedAt: z.coerce.date(),
})

export type ClipProcessingCallbackFailure = z.infer<typeof clipProcessingCallbackFailureSchema>

const clipProcessingCallbackSuccessSchema = z.object({
  ok: z.literal(true),
  clipId: z.uuid(),
  modalCallId: z.string().min(1),
  duration: z.coerce.number().positive(),
  fileSize: z.coerce.number().int().positive(),
  recordedAt: z.coerce.date().optional(),
  processingStartedAt: z.coerce.date(),
  processingCompletedAt: z.coerce.date(),
})

export type ClipProcessingCallbackSuccess = z.infer<typeof clipProcessingCallbackSuccessSchema>

export const clipProcessingCallbackSchema = z.union([
  clipProcessingCallbackFailureSchema,
  clipProcessingCallbackSuccessSchema,
])

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
