import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'

import { env } from '@/env'
import {
  logR2MultipartError,
  logR2MultipartInfo,
  logR2MultipartWarn,
} from '@/lib/r2MultipartLogger'
import r2Multipart from '@/lib/r2Multipart'
import { abortUploadSchema } from '@/lib/schemas'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const parsed = abortUploadSchema.safeParse(body)
    if (!parsed.success) {
      const validationError = z.flattenError(parsed.error)
      logR2MultipartWarn('abort upload validation failed', { body, validationError })
      return Response.json({ error: validationError }, { status: 400 })
    }

    const { key, uploadId } = parsed.data

    logR2MultipartInfo('aborting multipart upload', { key, uploadId })

    const command = new AbortMultipartUploadCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
    })

    await r2Multipart.send(command)

    logR2MultipartInfo('multipart upload aborted', { key, uploadId })

    return Response.json({ ok: true })
  } catch (error) {
    logR2MultipartError('failed to abort multipart upload', error)
    return Response.json({ error: 'Failed to abort multipart upload' }, { status: 500 })
  }
}
