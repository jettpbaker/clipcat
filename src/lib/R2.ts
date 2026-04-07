import 'server-only'

import { env } from '@/env'
import { S3Client } from '@aws-sdk/client-s3'

const R2 = new S3Client({
  region: 'auto', // Required by SDK but not used by R2
  // Provide your Cloudflare account ID
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  // Retrieve your S3 API credentials for your R2 bucket via API tokens (see: https://developers.cloudflare.com/r2/api/tokens)
  credentials: {
    accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
})

export default R2
