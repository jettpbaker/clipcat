import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  QUALITY_VERY_LOW,
  type Quality,
} from 'mediabunny'
import { useEffect, useRef, useState } from 'react'

function parseTimeToSeconds(time: string): number | null {
  const trimmed = time.trim()
  if (!trimmed) return null

  const [minutesPart, secondsPart] = trimmed.split(':')
  const minutes = Number(minutesPart)
  const seconds = Number(secondsPart)

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null

  return (minutes || 0) * 60 + (seconds || 0)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

const qualityById = {
  veryHigh: QUALITY_VERY_HIGH,
  high: QUALITY_HIGH,
  medium: QUALITY_MEDIUM,
  low: QUALITY_LOW,
  veryLow: QUALITY_VERY_LOW,
} as const satisfies Record<string, Quality>

type QualityId = keyof typeof qualityById

const QUALITY_OPTIONS = [
  { id: 'veryHigh', label: 'Very High' },
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
  { id: 'veryLow', label: 'Very Low' },
] as const satisfies readonly { id: QualityId; label: string }[]

type OutputState = {
  status: 'idle' | 'encoding' | 'done' | 'error'
  url: string | null
  sizeBytes: number | null
  error: string | null
}

const INITIAL_OUTPUT_STATE: OutputState = {
  status: 'idle',
  url: null,
  sizeBytes: null,
  error: null,
}

function App() {
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [qualityId, setQualityId] = useState<QualityId>('medium')
  const [output, setOutput] = useState<OutputState>(INITIAL_OUTPUT_STATE)
  const [isConverting, setIsConverting] = useState(false)

  const jobIdRef = useRef(0)
  const outputUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
    }
  }, [])

  function resetOutput() {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
    outputUrlRef.current = null
    setOutput(INITIAL_OUTPUT_STATE)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    jobIdRef.current += 1

    const selectedFile = e.target.files?.[0] ?? null
    setFile(selectedFile)
    setIsConverting(false)
    resetOutput()
  }

  async function encodeVariant(options: {
    file: File
    trim: { start: number; end?: number }
    width?: number
    videoBitrate: number | Quality
  }): Promise<{ url: string; sizeBytes: number }> {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(options.file),
    })

    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    })

    const videoTrack = await input.getPrimaryVideoTrack()
    const width = options.width ?? videoTrack?.displayWidth

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        width,
        bitrate: options.videoBitrate,
      },
      audio: {
        numberOfChannels: 1,
        bitrate: QUALITY_HIGH,
      },
      trim: options.trim,
      tags: {},
    })

    await conversion.execute()

    const buffer = output.target.buffer
    if (!buffer) {
      throw new Error('Conversion completed but produced no output buffer')
    }

    const blob = new Blob([buffer], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)

    return { url, sizeBytes: blob.size }
  }

  async function handleConvert() {
    if (!file || isConverting) return

    const startSeconds = parseTimeToSeconds(startTime) ?? 0
    const endSeconds = parseTimeToSeconds(endTime)

    if (endSeconds !== null && endSeconds <= startSeconds) {
      setOutput((prev) => ({
        ...prev,
        status: 'error',
        error: 'End time must be after start time',
      }))
      return
    }

    const trim = {
      start: startSeconds,
      ...(endSeconds !== null ? { end: endSeconds } : {}),
    }

    const jobId = jobIdRef.current

    setIsConverting(true)
    resetOutput()
    setOutput({ status: 'encoding', url: null, sizeBytes: null, error: null })

    try {
      const AUTO_TARGET_SIZE_MB = 9
      if (!endSeconds) return
      const durationSeconds = endSeconds - startSeconds
      const targetSizeBits = AUTO_TARGET_SIZE_MB * 8 * 1_000_000
      const videoBitrateBps = Math.round(targetSizeBits / durationSeconds)
      console.log({ videoBitrateBps })


      const { url, sizeBytes } = await encodeVariant({
        file,
        trim,
        // videoBitrate: qualityById[qualityId],
        videoBitrate: videoBitrateBps
      })

      if (jobId !== jobIdRef.current) {
        URL.revokeObjectURL(url)
        return
      }

      outputUrlRef.current = url
      setOutput({ status: 'done', url, sizeBytes, error: null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (jobId !== jobIdRef.current) return

      setOutput({ status: 'error', url: null, sizeBytes: null, error: message })
    } finally {
      if (jobId === jobIdRef.current) setIsConverting(false)
    }
  }

  const sizeLabel =
    output.sizeBytes !== null ? formatBytes(output.sizeBytes) : null

  return (
    <main>
      <h1>ClipCat</h1>

      <label>
        Upload a file:
        <input type='file' accept='video/*' onChange={handleFileChange} />
      </label>

      <label>
        Start time (MM:SS):
        <input
          type='text'
          placeholder='00:00'
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
      </label>

      <label>
        End time (MM:SS):
        <input
          type='text'
          placeholder='00:00'
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
      </label>

      <label>
        Output quality:
        <select
          value={qualityId}
          onChange={(e) => setQualityId(e.currentTarget.value as QualityId)}
        >
          {QUALITY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type='button'
        onClick={handleConvert}
        disabled={!file || isConverting}
      >
        {isConverting ? 'Converting…' : 'Convert'}
      </button>

      {output.status === 'error' && output.error && (
        <p>Error: {output.error}</p>
      )}

      <section>
        <h2>Output{sizeLabel ? ` (${sizeLabel})` : ''}</h2>

        <p>
          {output.status === 'idle' && 'Idle'}
          {output.status === 'encoding' && 'Encoding…'}
          {output.status === 'done' && 'Done'}
          {output.status === 'error' && 'Error'}
        </p>

        {/*biome-ignore lint/a11y/useMediaCaption: user-uploaded video preview */}
        {output.url && <video src={output.url} controls />}
      </section>
    </main>
  )
}

export default App
