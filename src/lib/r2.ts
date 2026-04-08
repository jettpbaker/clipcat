import 'server-only'

import { env } from '@/env'
import { S3Client } from 'bun'

const r2 = new S3Client({
  accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
  secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
  bucket: env.R2_BUCKET_NAME,
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
})

export default r2
