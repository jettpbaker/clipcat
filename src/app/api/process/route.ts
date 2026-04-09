import processVideo from '@/lib/processVideo'
import r2 from '@/lib/r2'
import { processSchema } from '@/lib/schemas'
import { z } from 'zod'
import { ffmpeg } from 'ffmpeg-kit'
import tryCatch from '@/lib/tryCatch'
// import { MUTATIONS } from '@/db/queries'

const ONE_HOUR = 3600

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = processSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })

  const { key, duration } = parsed.data

  const url = r2.presign(key, { expiresIn: ONE_HOUR })
  console.log('Processing video...')
  console.time('processing')
  const {
    err: processErr,
    data: processData,
    outputPath,
  } = await processVideo({ input: url, duration })
  console.timeEnd('processing')

  const file = Bun.file(outputPath)
  const probe = await ffmpeg.probe(outputPath)
  const { size, duration: outputDuration, filename } = probe.format
  console.log({ size, outputDuration, filename })

  if (processErr) {
    // Handle Err
    console.log(processErr)
    return
  }

  console.log('Uploading clip...')
  console.time('uploading')
  const [uploadErr] = await tryCatch(
    r2.write(`clips/${crypto.randomUUID()}.mp4`, file, {
      type: 'video/mp4',
    }),
  )
  console.timeEnd('uploading')

  if (file) await file.delete()

  if (uploadErr) {
    console.error('Error uploading clip!', uploadErr)
    if (file) await file.delete()
    return
  }

  // const ownerId = 'some bs'
  // const createdClip = await MUTATIONS.createClip({game, outputDuration, ownerId, , })

  return Response.json({ data: processData })
}
