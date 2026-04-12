'use client'

import ky from 'ky'

import { enqueueClipProcessingSchema } from '@/lib/schemas'
import { uploadMultipartVideo } from '@/lib/upload/multipartVideo'
import trimVideo from '@/lib/trimVideo'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'

import { createClipResponseSchema } from '@/lib/schemas'

import { useRef, useState } from 'react'

export default function UploadForm() {
  const [clipUrl, setClipUrl] = useState<null | string>(null)
  const [progress, setProgress] = useState<number>(0)
  const lastProgressUpdateAt = useRef(0)

  async function handleSumbit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()

    setClipUrl(null)

    const formData = new FormData(e.currentTarget)

    const file = formData.get('file')
    if (!(file instanceof File)) {
      console.error('File not provided')
      return
    }

    const inputKey = `o/${nanoid()}.mp4`

    function handleUploadProgress({ progress }: { progress: number }) {
      const now = performance.now()
      if (now - lastProgressUpdateAt.current < 100) return
      lastProgressUpdateAt.current = now
      const percentage = Math.floor(progress * 100)
      setProgress(percentage)
    }

    function formatTime(t: string) {
      const time = t.split(':')

      const minutes = parseInt(time[0])
      const seconds = parseInt(time[1])

      return minutes * 60 + seconds
    }

    const start = formData.get('start')
    const end = formData.get('end')

    const startSeconds = formatTime(String(start))
    const endSeconds = formatTime(String(end))

    const uploadStartedAt = new Date()
    const trimmed = await trimVideo(file, startSeconds, endSeconds)

    await uploadMultipartVideo(trimmed, { key: inputKey, onUploadProgress: handleUploadProgress })
    const uploadCompletedAt = new Date()

    if (typeof start !== 'string' || typeof end !== 'string') {
      console.error('Start or end time not provided')
      return
    }

    const game = formData.get('game')
    if (typeof game !== 'string') {
      console.error('Title not provided')
      return
    }

    const title = formData.get('title')
    if (typeof title !== 'string') {
      console.error('Title not provided')
      return
    }

    const body = { game, title, inputKey, uploadStartedAt, uploadCompletedAt }
    const parsedBody = enqueueClipProcessingSchema.safeParse(body)

    if (!parsedBody.success) {
      console.error('Upload failed', parsedBody.error)
      return
    }

    const response = await ky.post('/api/clips', { json: parsedBody.data }).json()
    const result = createClipResponseSchema.parse(response)
    if (!result.ok) {
      toast.error(result.error)
      console.error(result.error)
    }
  }

  return (
    <>
      <form onSubmit={(e) => handleSumbit(e)}>
        <input type="file" name="file" />
        <input type="text" name="start" placeholder="Start: 00:00" />
        <input type="text" name="end" placeholder="End: 00:00" />
        <input type="text" name="game" placeholder="Clip Game" />
        <input type="text" name="title" placeholder="Clip Game" />
        <button type="submit">Upload</button>
      </form>

      <p>Upload progress: {progress}%</p>

      <br />

      {clipUrl && (
        <div>
          <video src={clipUrl} controls />
        </div>
      )}
    </>
  )
}
