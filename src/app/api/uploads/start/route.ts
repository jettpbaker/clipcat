import { CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { env } from '@/env'
import { startUploadSchema } from '@/lib/schemas'
import r2Multipart from '@/lib/r2Multipart'

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = startUploadSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })

  const { key, fileType } = parsed.data

  const command = new CreateMultipartUploadCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: fileType,
  })

  const res = await r2Multipart.send(command)
  if (!res.UploadId) return Response.json({ error: 'UploadId not created' }, { status: 500 })

  return Response.json({
    uploadId: res.UploadId,
  })
}
