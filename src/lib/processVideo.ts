import { ffmpeg } from 'ffmpeg-kit'
import r2 from './r2'
import tryCatch from './tryCatch'

const TARGET_SIZE_MB = 10
const TARGET_SIZE_HEADROOM = 0.85
const AUDIO_BITRATE_KBPS = 128

type ProcessVideoProps = {
  key: string
  duration: number
}

export default async function processVideo({ key, duration }: ProcessVideoProps) {
  const effectiveTargetSizeMb = TARGET_SIZE_MB * TARGET_SIZE_HEADROOM
  const totalBitrateKbps = Math.max(100, (effectiveTargetSizeMb * 8 * 1024) / duration)
  const videoBitrateKbps = Math.floor(totalBitrateKbps - AUDIO_BITRATE_KBPS)

  const inputPath = `/tmp/clipcat-input-${crypto.randomUUID()}.mp4`
  const outputPath = `/tmp/clipcat-${crypto.randomUUID()}.mp4`
  const passlogPath = `/tmp/clipcat-passlog-${crypto.randomUUID()}`

  await Bun.write(inputPath, r2.file(key))

  const commonVideoArgs = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    'scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease',
    '-c:v',
    'libx264',
    '-b:v',
    `${videoBitrateKbps}k`,
    '-pix_fmt',
    'yuv420p',
  ]

  const pass1Args = [
    ...commonVideoArgs,
    '-pass',
    '1',
    '-passlogfile',
    passlogPath,
    '-an',
    '-f',
    'null',
    '/dev/null',
  ]

  const pass2Args = [
    ...commonVideoArgs,
    '-pass',
    '2',
    '-passlogfile',
    passlogPath,
    '-c:a',
    'aac',
    '-b:a',
    `${AUDIO_BITRATE_KBPS}k`,
    '-movflags',
    '+faststart',
    outputPath,
  ]

  console.log('ffmpeg starting pass 1', {
    key,
    inputPath,
    outputPath,
    duration,
    effectiveTargetSizeMb,
    totalBitrateKbps,
    videoBitrateKbps,
    passlogPath,
    args: pass1Args,
  })

  const [pass1Err, pass1Data] = await tryCatch(ffmpeg.execute(pass1Args, { logLevel: 'info' }))

  if (pass1Data) {
    console.log('ffmpeg completed pass 1', {
      passlogPath,
      stdout: pass1Data.stdout,
      stderr: pass1Data.stderr,
    })
  }

  if (pass1Err) {
    console.error('ffmpeg failed pass 1', {
      passlogPath,
      message: pass1Err instanceof Error ? pass1Err.message : String(pass1Err),
      stdout:
        typeof pass1Err === 'object' && pass1Err !== null && 'stdout' in pass1Err
          ? pass1Err.stdout
          : undefined,
      stderr:
        typeof pass1Err === 'object' && pass1Err !== null && 'stderr' in pass1Err
          ? pass1Err.stderr
          : undefined,
    })

    return { err: pass1Err, data: pass1Data, outputPath }
  }

  console.log('ffmpeg starting pass 2', {
    key,
    inputPath,
    outputPath,
    duration,
    effectiveTargetSizeMb,
    totalBitrateKbps,
    videoBitrateKbps,
    passlogPath,
    args: pass2Args,
  })

  const [pass2Err, pass2Data] = await tryCatch(ffmpeg.execute(pass2Args, { logLevel: 'info' }))

  if (pass2Data) {
    console.log('ffmpeg completed pass 2', {
      outputPath,
      stdout: pass2Data.stdout,
      stderr: pass2Data.stderr,
    })
  }

  if (pass2Err) {
    console.error('ffmpeg failed pass 2', {
      outputPath,
      message: pass2Err instanceof Error ? pass2Err.message : String(pass2Err),
      stdout:
        typeof pass2Err === 'object' && pass2Err !== null && 'stdout' in pass2Err
          ? pass2Err.stdout
          : undefined,
      stderr:
        typeof pass2Err === 'object' && pass2Err !== null && 'stderr' in pass2Err
          ? pass2Err.stderr
          : undefined,
    })
  }

  await Promise.allSettled([
    Bun.file(inputPath).delete(),
    Bun.file(`${passlogPath}-0.log`).delete(),
    Bun.file(`${passlogPath}-0.log.mbtree`).delete(),
  ])

  return { err: pass2Err, data: pass2Data, outputPath }
}
