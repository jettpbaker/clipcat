import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { env } from '@/env'
import { partUploadSchema } from '@/lib/schemas'
import r2Multipart from '@/lib/r2Multipart'

const ONE_HOUR = 3600

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = partUploadSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })

  const { key, uploadId, partNumber } = parsed.data

  const command = new UploadPartCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  })

  const url = await getSignedUrl(r2Multipart, command, {
    expiresIn: ONE_HOUR,
  })

  if (!url) return Response.json({ error: 'Upload url not created' }, { status: 500 })

  return Response.json({ url })
}
