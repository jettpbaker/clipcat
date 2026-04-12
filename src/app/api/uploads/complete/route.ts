import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { env } from '@/env'
import {
  logR2MultipartError,
  logR2MultipartInfo,
  logR2MultipartWarn,
} from '@/lib/r2MultipartLogger'
import { completeUploadSchema } from '@/lib/schemas'
import r2Multipart from '@/lib/r2Multipart'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const parsed = completeUploadSchema.safeParse(body)
    if (!parsed.success) {
      const validationError = z.flattenError(parsed.error)
      logR2MultipartWarn('complete upload validation failed', { body, validationError })
      return Response.json({ error: validationError }, { status: 400 })
    }

    const { key, uploadId, parts } = parsed.data

    logR2MultipartInfo('completing multipart upload', {
      key,
      uploadId,
      partCount: parts.length,
    })

    const command = new CompleteMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    })

    const res = await r2Multipart.send(command)

    logR2MultipartInfo('multipart upload completed', {
      key,
      uploadId,
      location: res.Location,
      etag: res.ETag,
      responseMetadata: res.$metadata,
    })

    return Response.json({
      ok: true,
      location: res.Location,
      etag: res.ETag,
    })
  } catch (error) {
    logR2MultipartError('failed to complete multipart upload', error)
    return Response.json({ error: 'Failed to complete multipart upload' }, { status: 500 })
  }
}
