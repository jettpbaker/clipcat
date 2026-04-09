import 'server-only'

import { env } from '@/env'
import { S3Client } from '@aws-sdk/client-s3'

const r2Multipart = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
})

export default r2Multipart
