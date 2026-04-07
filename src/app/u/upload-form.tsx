'use client'

import ky from 'ky'
import tryCatch from '@/lib/tryCatch'

import type { User } from 'better-auth'
import { getPresignedUploadUrl } from './uploadSourceVideo'

type UploadFormProps = {
  user: User
}

export default function UploadForm({ user }: UploadFormProps) {
  async function handleSumbit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()

    const formData = new FormData(e.currentTarget)

    const file = formData.get('file') as File
    const ext = file.name.split('.').pop()
    const key = `originals/${user.id}/${crypto.randomUUID()}.${ext}`

    const url = await getPresignedUploadUrl(key, file.type)

    const [uploadErr] = await tryCatch(
      ky.put(url, {
        body: file,
        headers: { 'Content-Type': file.type },
      }),
    )

    if (uploadErr) {
      console.error('Upload failed', uploadErr)
      return
    }

    const [processingErr] = await tryCatch(
      ky
        .post('api/process', {
          json: { key },
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
      <button type="submit">Upload</button>
    </form>
  )
}
