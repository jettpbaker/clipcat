import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny'
import { AUDIO_BITRATE } from '../constants'
import {
  calculateBitrate,
  formatBytes,
} from './utils'

type CompressionResult = {
  url: string
  sizeBytes: number
  width: number
}

export type PassProgress = {
  pass: 1 | 2
  progress: number
}

export async function compressVideo(options: {
  file: File
  trim: { start: number | undefined; end?: number | undefined }
  onProgress?: (progress: PassProgress) => void
}) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(options.file),
  })

  try {
    const videoTrack = await input.getPrimaryVideoTrack()
    if (!videoTrack) throw new Error('No video track found for this file')

    const packetStats = await videoTrack.computePacketStats(100)
    const originalFrameRate = Math.round(packetStats.averagePacketRate)
    const originalWidth = videoTrack.displayWidth

    // Pass 1: Trim at original quality (no compression)
    console.time('pass1-trim')
    const trimmed = await trimVideo({
      input,
      trim: options.trim,
      width: originalWidth,
      frameRate: originalFrameRate,
      onProgress: (p) => options.onProgress?.({ pass: 1, progress: p }),
    })
    console.timeEnd('pass1-trim')

    // Create new input from trimmed result for pass 2
    const trimmedInput = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(trimmed.blob),
    })

    try {
      const trimmedDuration = await trimmedInput.computeDuration()
      const videoBitrate = calculateBitrate(trimmedDuration)

      // Pass 2: Compress the trimmed clip at original resolution/framerate
      console.time('pass2-compress')
      const best = await compressAtResolution({
        input: trimmedInput,
        trim: { start: undefined, end: undefined },
        videoBitrate,
        frameRate: originalFrameRate,
        width: originalWidth,
        onProgress: (p) => options.onProgress?.({ pass: 2, progress: p }),
      })
      console.timeEnd('pass2-compress')

      // Clean up trimmed blob
      URL.revokeObjectURL(trimmed.url)

      return {
        url: best.url,
        size: formatBytes(best.sizeBytes),
      }
    } finally {
      trimmedInput.dispose()
    }
  } finally {
    input.dispose()
  }
}

async function trimVideo(options: {
  input: Input
  trim: { start: number | undefined; end?: number | undefined }
  width: number
  frameRate: number
  onProgress?: (progress: number) => void
}): Promise<{ url: string; blob: Blob }> {
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  // Use high bitrate for trim pass to preserve quality
  const conversion = await Conversion.init({
    input: options.input,
    output,
    video: {
      width: options.width,
      codec: 'avc',
      frameRate: options.frameRate,
    },
    audio: {
      numberOfChannels: 2,
      bitrate: 192_000,
    },
    trim: options.trim,
    tags: {},
  })

  if (!conversion.isValid) {
    throw new Error('Trim conversion invalid')
  }

  if (options.onProgress) {
    conversion.onProgress = options.onProgress
  }

  await conversion.execute()

  const buffer = output.target.buffer
  if (!buffer) {
    throw new Error('No output buffer from trim')
  }

  const blob = new Blob([buffer], { type: 'video/mp4' })

  return {
    url: URL.createObjectURL(blob),
    blob,
  }
}

async function compressAtResolution(options: {
  input: Input
  trim: { start: number | undefined; end?: number | undefined }
  videoBitrate: number
  frameRate: number
  width: number
  onProgress?: (progress: number) => void
}): Promise<CompressionResult> {
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  const conversion = await Conversion.init({
    input: options.input,
    output,
    video: {
      width: options.width,
      bitrate: options.videoBitrate,
      codec: 'avc',
      frameRate: options.frameRate,
    },
    audio: {
      numberOfChannels: 1,
      bitrate: AUDIO_BITRATE,
    },
    trim: options.trim,
    tags: {},
  })

  if (!conversion.isValid) {
    throw new Error(`Conversion invalid at ${options.width}p`)
  }

  if (options.onProgress) {
    conversion.onProgress = options.onProgress
  }

  await conversion.execute()

  const buffer = output.target.buffer
  if (!buffer) {
    throw new Error(`No output buffer at ${options.width}p`)
  }

  const blob = new Blob([buffer], { type: 'video/mp4' })

  return {
    url: URL.createObjectURL(blob),
    sizeBytes: blob.size,
    width: options.width,
  }
}
