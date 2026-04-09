'use client'

import ky from 'ky'

import tryCatch from '@/lib/tryCatch'
import {
  abortUploadSchema,
  completeUploadSchema,
  partUploadSchema,
  processSchema,
  startUploadSchema,
} from '@/lib/schemas'

export default function UploadForm() {
  async function handleSumbit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)

    const file = formData.get('file')
    if (!(file instanceof File)) {
      console.error('File not provided')
      return
    }

    const ext = file.name.split('.').pop()
    const key = `originals/${crypto.randomUUID()}.${ext}`

    const startUploadBody = { key, fileType: file.type }
    const startUploadBodyParsed = startUploadSchema.safeParse(startUploadBody)

    if (!startUploadBodyParsed.success) {
      console.error('Upload failed', startUploadBodyParsed.error)
      return
    }

    const [startUploadErr, startUploadData] = await tryCatch(
      ky
        .post('/api/uploads/start', {
          json: startUploadBodyParsed.data,
        })
        .json<{ uploadId: string; key: string }>(),
    )

    if (startUploadErr) {
      console.error('Upload failed', startUploadErr)
      return
    }

    const { uploadId } = startUploadData

    try {
      const partSize = 10 * 1024 * 1024 // 10 MiB
      const partCount = Math.ceil(file.size / partSize)

      const parts: Array<{ ETag: string; PartNumber: number }> = []

      for (let i = 0; i < partCount; i++) {
        const partNumber = i + 1
        const start = i * partSize
        const end = Math.min(start + partSize, file.size)
        const chunk = file.slice(start, end)

        const partUploadBody = { key, uploadId, partNumber }
        const partUploadBodyParsed = partUploadSchema.safeParse(partUploadBody)

        if (!partUploadBodyParsed.success) {
          throw partUploadBodyParsed.error
        }

        const [partUploadErr, partUploadData] = await tryCatch(
          ky
            .post('/api/uploads/part', {
              json: partUploadBodyParsed.data,
            })
            .json<{ url: string }>(),
        )

        if (partUploadErr) {
          throw partUploadErr
        }

        const response = await fetch(partUploadData.url, {
          method: 'PUT',
          body: chunk,
        })

        if (!response.ok)
          throw new Error(`Part ${partNumber} upload failed with ${response.status}`)

        const etag = response.headers.get('etag')
        console.log(response)
        if (!etag) throw new Error(`Missing ETag for part ${partNumber}`)

        parts.push({ ETag: etag, PartNumber: partNumber })

        const uploadedBytes = end
        const progress = uploadedBytes / file.size
        console.log(progress)
      }

      parts.sort((a, b) => a.PartNumber - b.PartNumber)
      console.log({ parts })

      const completeUploadBody = { key, uploadId, parts }
      const completeUploadBodyParsed = completeUploadSchema.safeParse(completeUploadBody)

      if (!completeUploadBodyParsed.success) {
        throw completeUploadBodyParsed.error
      }

      const [completeUploadErr] = await tryCatch(
        ky.post('/api/uploads/complete', {
          json: completeUploadBodyParsed.data,
        }),
      )

      if (completeUploadErr) throw completeUploadErr
    } catch (err) {
      const abortUploadBody = { key, uploadId }
      const abortUploadBodyParsed = abortUploadSchema.safeParse(abortUploadBody)

      if (abortUploadBodyParsed.success) {
        const [abortUploadErr] = await tryCatch(
          ky.post('/api/uploads/abort', {
            json: abortUploadBodyParsed.data,
          }),
        )

        if (abortUploadErr) {
          console.error('Upload abort failed', abortUploadErr)
        }
      }

      console.error('Upload failed', err)
      return
    }
    return

    function formatTime(t: string) {
      const time = t.split(':')

      const minutes = parseInt(time[0])
      const seconds = parseInt(time[1])

      return minutes * 60 + seconds
    }

    const start = formData.get('start')
    const end = formData.get('end')

    if (typeof start !== 'string' || typeof end !== 'string') {
      console.error('Start or end time not provided')
      return
    }

    const startSeconds = formatTime(String(start))
    const endSeconds = formatTime(String(end))

    const game = formData.get('game')
    if (typeof game !== 'string') {
      console.error('Title not provided')
      return
    }

    const startProcessingBody = { key, start: startSeconds, end: endSeconds, game }
    const startProcessingBodyParsed = processSchema.safeParse(startProcessingBody)

    if (!startProcessingBodyParsed.success) {
      console.error('Upload failed', startProcessingBodyParsed.error)
      return
    }

    const [processingErr] = await tryCatch(
      ky
        .post('/api/process', {
          // TODO: Decide on a proper timeout for this
          timeout: false,
          json: startProcessingBodyParsed.data,
        })
        .json(),
    )

    if (processingErr) {
      console.error('Processing failed', processingErr)
      return
    }
  }

  return (
    <form onSubmit={(e) => handleSumbit(e)}>
      <input type="file" name="file" />
      <input type="text" name="start" placeholder="Start: 00:00" />
      <input type="text" name="end" placeholder="End: 00:00" />
      <input type="game" name="game" placeholder="Clip Game" />
      <button type="submit">Upload</button>
    </form>
  )
}
