import ky from 'ky'

const DEFAULT_PART_SIZE = 10 * 1024 * 1024
const DEFAULT_CONCURRENCY_SIZE = 3

type StartMultiPartUploadResult = {
  uploadId: string
}

async function uploadPart(
  file: File,
  partSize: number,
  uploadId: string,
  partNumber: number,
  key: string,
): Promise<{ ETag: string; PartNumber: number }> {
  const start = partNumber * partSize
  const end = Math.min(start + partSize, file.size)
  const chunk = file.slice(start, end)

  const { url } = await getPartUploadUrl(uploadId, partNumber, key)

  const response = await ky.put(url, {
    timeout: false,
    body: chunk,
  })

  const etag = response.headers.get('etag')
  if (!etag) throw new Error(`Missing ETag for part ${partNumber + 1}`)
  // s3/r2 completion also expects 1-based indexing
  return { ETag: etag, PartNumber: partNumber + 1 }
}

async function startMultipartUpload(file: File, key: string): Promise<StartMultiPartUploadResult> {
  const body = { key, fileType: file.type }

  const response = await ky
    .post('/api/uploads/start', {
      json: body,
    })
    .json<{ uploadId: string; key: string }>()

  return { uploadId: response.uploadId }
}

type GetPartUploadUrlResult = {
  url: string
}

async function getPartUploadUrl(
  uploadId: string,
  partNumber: number,
  key: string,
): Promise<GetPartUploadUrlResult> {
  // add 1 to partNumber because s3/r2 expects 1-based indexing
  const body = { key, uploadId, partNumber: partNumber + 1 }

  const response = await ky
    .post('/api/uploads/part', {
      json: body,
    })
    .json<{ url: string }>()
  return response
}

type CompleteMulitpartUploadResult = {
  ok: boolean
  location: string
  etag: string
}

async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>,
): Promise<CompleteMulitpartUploadResult> {
  const body = { key, uploadId, parts }

  const response = await ky
    .post('/api/uploads/complete', {
      json: body,
    })
    .json<{ ok: boolean; location: string; etag: string }>()
  return response
}

type AbortMultiPartUploadResult = {
  ok: boolean
}

async function abortMultipartUpload(
  key: string,
  uploadId: string,
): Promise<AbortMultiPartUploadResult> {
  const body = { key, uploadId }

  const response = await ky
    .post('/api/uploads/abort', {
      json: body,
    })
    .json<{ ok: boolean }>()
  return response
}

export type UploadMultipartVideoOptions = {
  key: string
  partSize?: number
  concurrency?: number
  onUploadStart?: (ctx: {
    key: string
    uploadId: string
    totalBytes: number
    partSize: number
    partCount: number
  }) => void | Promise<void>
  onUploadProgress?: (ctx: {
    uploadedBytes: number
    totalBytes: number
    progress: number
    completedParts: number
    totalParts: number
  }) => void | Promise<void>
  onUploadComplete?: (ctx: { key: string; uploadId: string }) => void | Promise<void>
}

export type UploadMultipartVideoResult = {
  key: string
  uploadId: string
}

export async function uploadMultipartVideo(
  file: File,
  options: UploadMultipartVideoOptions,
): Promise<UploadMultipartVideoResult> {
  let uploadId: string | null = null
  try {
    uploadId = (await startMultipartUpload(file, options.key)).uploadId

    const partSize = options.partSize ?? DEFAULT_PART_SIZE
    const partCount = Math.ceil(file.size / partSize)
    const totalBytes = file.size

    await options.onUploadStart?.({
      key: options.key,
      uploadId,
      totalBytes,
      partSize,
      partCount,
    })

    const uploadedParts: Array<{ ETag: string; PartNumber: number }> = []
    let uploadedBytes: number = 0
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY_SIZE
    for (let batchStart = 0; batchStart < partCount; batchStart += concurrency) {
      const batchEnd = Math.min(batchStart + concurrency, partCount)
      const batchPromises = []

      for (let i = batchStart; i < batchEnd; i++) {
        const partNumber = i
        batchPromises.push(uploadPart(file, partSize, uploadId, partNumber, options.key))
      }

      const batchResults = await Promise.all(batchPromises)
      uploadedParts.push(...batchResults)

      const batchBytes = batchResults.length * partSize
      uploadedBytes += batchBytes
      const progress = uploadedBytes / totalBytes
      await options.onUploadProgress?.({
        uploadedBytes,
        totalBytes,
        progress,
        completedParts: uploadedParts.length,
        totalParts: partCount,
      })
    }

    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber)
    await completeMultipartUpload(options.key, uploadId, uploadedParts)

    await options.onUploadComplete?.({ key: options.key, uploadId })

    return { key: options.key, uploadId }
  } catch (err) {
    console.error(`Error uploading video: ${err}`)
    if (!uploadId) {
      throw err
    }

    try {
      await abortMultipartUpload(options.key, uploadId)
    } catch (abortErr) {
      console.error(`Error aborting upload: ${abortErr}`)
    }
    throw err
  }
}
