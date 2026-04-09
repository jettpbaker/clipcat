'use client'

import ky from 'ky'

import tryCatch from '@/lib/tryCatch'
import { processSchema } from '@/lib/schemas'
import { uploadMultipartVideo } from '@/lib/upload/multipartVideo'

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

    function handleUploadProgress({ progress }: { progress: number }) {
      const percentage = progress * 100
      console.log(`Upload Progress: ${Math.floor(percentage)}%`)
    }

    console.time('upload-video')
    await uploadMultipartVideo(file, { key, onUploadProgress: handleUploadProgress })
    console.timeEnd('upload-video')

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
