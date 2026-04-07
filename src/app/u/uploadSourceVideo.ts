'use server'

import R2 from '@/lib/R2'

import { env } from '@/env'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ONE_HOUR = 3600

// Generate presigned URL for writing (PUT)
// Specify ContentType to restrict uploads to a specific file type
export async function getPresignedUploadUrl(key: string, contentType: string) {
  return await getSignedUrl(
    R2,
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: ONE_HOUR },
  )
}

// Generate presigned URL for reading (GET)
// https://my-bucket.<ACCOUNT_ID>.r2.cloudflarestorage.com/image.png?X-Amz-Algorithm=...
export async function getPresignedDownloadUrl(key: string) {
  return await getSignedUrl(R2, new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }), {
    expiresIn: ONE_HOUR,
  })
}
