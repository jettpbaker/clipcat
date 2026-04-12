import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { env } from '@/env'
import {
  logR2MultipartError,
  logR2MultipartInfo,
  logR2MultipartWarn,
} from '@/lib/r2MultipartLogger'
import { partUploadSchema } from '@/lib/schemas'
import r2Multipart from '@/lib/r2Multipart'

const ONE_HOUR = 3600

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const parsed = partUploadSchema.safeParse(body)
    if (!parsed.success) {
      const validationError = z.flattenError(parsed.error)
      logR2MultipartWarn('part upload validation failed', { body, validationError })
      return Response.json({ error: validationError }, { status: 400 })
    }

    const { key, uploadId, partNumber } = parsed.data

    logR2MultipartInfo('signing multipart upload part', {
      key,
      uploadId,
      partNumber,
      expiresIn: ONE_HOUR,
    })

    const command = new UploadPartCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    })

    const url = await getSignedUrl(r2Multipart, command, {
      expiresIn: ONE_HOUR,
    })

    if (!url) {
      logR2MultipartWarn('multipart upload part signing returned empty url', {
        key,
        uploadId,
        partNumber,
      })
      return Response.json({ error: 'Upload url not created' }, { status: 500 })
    }

    logR2MultipartInfo('multipart upload part signed', { key, uploadId, partNumber })

    return Response.json({ url })
  } catch (error) {
    logR2MultipartError('failed to sign multipart upload part', error)
    return Response.json({ error: 'Failed to sign multipart upload part' }, { status: 500 })
  }
}
