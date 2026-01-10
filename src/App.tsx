import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_LOW,
} from 'mediabunny'
import { useState } from 'react'

function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) return

    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    })

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    })

    const videoTrack = await input.getPrimaryVideoTrack()

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        width: videoTrack?.displayWidth,
        bitrate: QUALITY_LOW,
      },
      audio: {
        numberOfChannels: 1,
        bitrate: QUALITY_LOW,
      },
      trim: {
        // Let's keep only the first 60 seconds
        start: 0,
        end: 10,
      },
      tags: {}, // Remove any metadata tags
    })

    await conversion.execute()

    const buffer = output.target.buffer
    if (!buffer) return

    const blob = new Blob([buffer], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    setVideoUrl(url)
  }

  return (
    <main>
      <h1>ClipCat</h1>

      <label>
        Upload a file:
        <input type='file' onChange={handleFileUpload} />
      </label>

      {/*biome-ignore lint/a11y/useMediaCaption: user-uploaded video preview */}
      {videoUrl && <video src={videoUrl} controls />}
    </main>
  )
}

export default App
