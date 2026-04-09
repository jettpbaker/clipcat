import { ffmpeg } from 'ffmpeg-kit'
import tryCatch from './tryCatch'

const TARGET_SIZE_MB = 10
const AUDIO_BITRATE_KBPS = 128

type ProcessVideoProps = {
  input: string
  duration: number
}

export default async function processVideo({ input, duration }: ProcessVideoProps) {
  const totalBitrateKbps = Math.max(100, (TARGET_SIZE_MB * 8 * 1024) / duration)
  const videoBitrateKbps = Math.floor(totalBitrateKbps - AUDIO_BITRATE_KBPS)

  const outputPath = `/tmp/clipcat-${crypto.randomUUID()}.mp4`

  const args = [
    '-y',
    '-i',
    input,
    '-vf',
    'scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease',
    '-c:v',
    'libx264',
    '-b:v',
    `${videoBitrateKbps}k`,
    '-c:a',
    'aac',
    '-b:a',
    `${AUDIO_BITRATE_KBPS}k`,
    '-movflags',
    '+faststart',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ]

  console.log('ffmpeg starting', {
    input,
    outputPath,
    duration,
    totalBitrateKbps,
    videoBitrateKbps,
    args,
  })

  const [err, data] = await tryCatch(ffmpeg.execute(args, { logLevel: 'info' }))

  if (data) {
    console.log('ffmpeg completed', {
      outputPath,
      stdout: data.stdout,
      stderr: data.stderr,
    })
  }

  if (err) {
    console.error('ffmpeg failed', {
      outputPath,
      message: err instanceof Error ? err.message : String(err),
      stdout: typeof err === 'object' && err !== null && 'stdout' in err ? err.stdout : undefined,
      stderr: typeof err === 'object' && err !== null && 'stderr' in err ? err.stderr : undefined,
    })
  }

  return { err, data, outputPath }
}
