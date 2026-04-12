import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'

import { env } from '@/env'
import r2Multipart from '@/lib/r2Multipart'
import { abortUploadSchema } from '@/lib/schemas'

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = abortUploadSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })

  const { key, uploadId } = parsed.data

  const command = new AbortMultipartUploadCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
  })

  await r2Multipart.send(command)

  return Response.json({ ok: true })
}
