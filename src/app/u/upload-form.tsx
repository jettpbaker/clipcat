'use client'

import ky from 'ky'
import type { User } from 'better-auth'

import tryCatch from '@/lib/tryCatch'
import processSchema from '@/lib/schemas'

import { getUploadUrl } from './actions'

type UploadFormProps = {
  user: User
}

export default function UploadForm({ user }: UploadFormProps) {
  async function handleSumbit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)

    const file = formData.get('file')
    if (!(file instanceof File)) {
      console.error('File not provided')
      return
    }

    const ext = file.name.split('.').pop()
    const key = `originals/${user.id}/${crypto.randomUUID()}.${ext}`

    const url = await getUploadUrl(key, file.type)

    // TODO: Get progress from the upload
    const [uploadErr] = await tryCatch(
      ky.put(url, {
        // TODO: Decide on a proper timeout for this
        timeout: false,
        body: file,
        headers: { 'Content-Type': file.type },
      }),
    )

    if (uploadErr) {
      console.error('Upload failed', uploadErr)
      return
    }

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

    const startSeconds = formatTime(start)
    const endSeconds = formatTime(end)

    const game = formData.get('game')
    if (typeof game !== 'string') {
      console.error('Title not provided')
      return
    }

    const body = { key, start: startSeconds, end: endSeconds, game }
    const parsed = processSchema.safeParse(body)

    if (!parsed.success) {
      console.error('Upload failed', parsed.error)
      return
    }

    const [processingErr] = await tryCatch(
      ky
        .post('/api/process', {
          // TODO: Decide on a proper timeout for this
          timeout: false,
          json: parsed.data,
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
