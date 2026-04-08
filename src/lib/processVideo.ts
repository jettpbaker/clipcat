import { ffmpeg } from 'ffmpeg-kit'
import tryCatch from './tryCatch'

const TARGET_SIZE_MB = 10
const AUDIO_BITRATE_KBPS = 128

type ProcessVideoProps = {
  input: string
  options: {
    start: number
    end: number
  }
}

export default async function processVideo({ input, options }: ProcessVideoProps) {
  const { start, end } = options
  const duration = end - start

  const totalBitrateKbps = Math.max(100, (TARGET_SIZE_MB * 8 * 1024) / duration)
  const videoBitrateKbps = Math.floor(totalBitrateKbps - AUDIO_BITRATE_KBPS)

  const outputPath = `/tmp/clipcat-${crypto.randomUUID()}.mp4`

  const baseArgs = ffmpeg
    .transform()
    .input(input)
    .trimStart(start)
    .duration(duration)
    .output(outputPath)
    .toArgs()

  const args = [
    ...baseArgs.slice(0, -1),
    '-b:v',
    `${videoBitrateKbps}k`,
    '-b:a',
    `${AUDIO_BITRATE_KBPS}k`,
    '-movflags',
    '+faststart',
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ]

  const [err, data] = await tryCatch(ffmpeg.execute(args))
  return { err, data, outputPath }
}
