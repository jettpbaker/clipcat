import 'server-only'

import { env } from '@/env'

function maskValue(value: string, visible = 4) {
  if (!value) return '<missing>'
  if (value.length <= visible * 2) return `${value.slice(0, visible)}...`
  return `${value.slice(0, visible)}...${value.slice(-visible)}`
}

function getErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { error }

  const errorWithMetadata = error as Error & {
    code?: string
    Code?: string
    requestId?: string
    cfId?: string
    statusCode?: number
    $metadata?: {
      attempts?: number
      httpStatusCode?: number
      requestId?: string
      totalRetryDelay?: number
    }
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    code: errorWithMetadata.code ?? errorWithMetadata.Code,
    statusCode: errorWithMetadata.statusCode,
    requestId: errorWithMetadata.requestId,
    cfId: errorWithMetadata.cfId,
    metadata: errorWithMetadata.$metadata,
  }
}

function getBaseContext() {
  return {
    bucket: env.R2_BUCKET_NAME,
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    accountId: maskValue(env.CLOUDFLARE_ACCOUNT_ID),
    accessKeyId: maskValue(env.CLOUDFLARE_ACCESS_KEY_ID),
  }
}

export function logR2MultipartInfo(message: string, context: Record<string, unknown> = {}) {
  console.info(`[r2-multipart] ${message}`, {
    ...getBaseContext(),
    ...context,
  })
}

export function logR2MultipartWarn(message: string, context: Record<string, unknown> = {}) {
  console.warn(`[r2-multipart] ${message}`, {
    ...getBaseContext(),
    ...context,
  })
}

export function logR2MultipartError(
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  console.error(`[r2-multipart] ${message}`, {
    ...getBaseContext(),
    ...context,
    error: getErrorDetails(error),
  })
}
