'use client'

import ky from 'ky'

import tryCatch from '@/lib/tryCatch'
import { processSchema } from '@/lib/schemas'
import { uploadMultipartVideo } from '@/lib/upload/multipartVideo'
import trimVideo from '@/lib/trimVideo'

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

    const inputKey = `originals/${crypto.randomUUID()}.mp4`

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
    const duration = endSeconds - startSeconds

    console.time('trim-video')
    const trimmed = await trimVideo(file, startSeconds, endSeconds)
    console.timeEnd('trim-video')

    console.time('upload-video')
    await uploadMultipartVideo(trimmed, { key: inputKey, onUploadProgress: handleUploadProgress })
    console.timeEnd('upload-video')

    if (typeof start !== 'string' || typeof end !== 'string') {
      console.error('Start or end time not provided')
      return
    }

    const game = formData.get('game')
    if (typeof game !== 'string') {
      console.error('Title not provided')
      return
    }

    const startProcessingBody = { inputKey, duration, game }
    const startProcessingBodyParsed = processSchema.safeParse(startProcessingBody)

    if (!startProcessingBodyParsed.success) {
      console.error('Upload failed', startProcessingBodyParsed.error)
      return
    }

    const [processingErr, processingData] = await tryCatch(
      ky
        .post('/api/process', {
          // TODO: Decide on a proper timeout for this
          timeout: false,
          json: startProcessingBodyParsed.data,
        })
        .json<{
          data: {
            inputKey: string
            outputKey: string
            duration: number
            outputSize: number
            videoBitrateKbps: number
          }
          clipUrl: string
        }>(),
    )

    if (!processingData) throw new Error('Missing processing data')
    setClipUrl(processingData.clipUrl)

    if (processingErr) {
      console.error('Processing failed', processingErr)
      return
    }
  }

  return (
    <>
      <form onSubmit={(e) => handleSumbit(e)}>
        <input type="file" name="file" />
        <input type="text" name="start" placeholder="Start: 00:00" />
        <input type="text" name="end" placeholder="End: 00:00" />
        <input type="text" name="game" placeholder="Clip Game" />
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
