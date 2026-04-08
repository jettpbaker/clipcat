import processVideo from '@/lib/processVideo'
import r2 from '@/lib/r2'
import processSchema from '@/lib/schemas'
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

  const { key, start, end, game } = parsed.data

  const url = r2.presign(key, { expiresIn: ONE_HOUR })
  console.log('Processing video...')
  console.time('processing')
  const {
    err: processErr,
    data: processData,
    outputPath,
  } = await processVideo({ input: url, options: { start, end } })
  console.log('Processing finished!')
  console.timeEnd('processing')

  const file = Bun.file(outputPath)
  const probe = await ffmpeg.probe(outputPath)
  const { size, duration, filename } = probe.format
  console.log({ size, duration, filename })

  if (processErr) {
    // Handle Err
    console.log(processErr)
    return
  }

  const [uploadErr] = await tryCatch(
    r2.write(`clips/${crypto.randomUUID()}.mp4`, file, {
      type: 'video/mp4',
    }),
  )

  if (file) await file.delete()

  if (uploadErr) {
    console.error('Error uploading clip!', uploadErr)
    if (file) await file.delete()
    return
  }

  // const ownerId = 'some bs'
  // const createdClip = await MUTATIONS.createClip({game, duration, ownerId, , })

  return Response.json({ data: processData })
}
