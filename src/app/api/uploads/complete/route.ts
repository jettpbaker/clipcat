import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { env } from '@/env'
import { completeUploadSchema } from '@/lib/schemas'
import r2Multipart from '@/lib/r2Multipart'

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = completeUploadSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })
  }

  const { key, uploadId, parts } = parsed.data

  const command = new CompleteMultipartUploadCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  })

  const res = await r2Multipart.send(command)

  return Response.json({
    ok: true,
    location: res.Location,
    etag: res.ETag,
  })
}
