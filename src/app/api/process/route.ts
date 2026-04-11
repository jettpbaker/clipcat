import processVideo from '@/lib/processVideo'
import { processSchema } from '@/lib/schemas'
import { z } from 'zod'
import r2 from '@/lib/r2'
// import { MUTATIONS } from '@/db/queries'

export async function POST(request: Request) {
  const body = await request.json()

  const parsed = processSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: z.flattenError(parsed.error) }, { status: 400 })

  const { inputKey, duration } = parsed.data
  const outputKey = `clips/${crypto.randomUUID()}.mp4`

  console.log('Processing video...')
  console.time('processing')
  const result = await processVideo({ inputKey, outputKey, duration })
  console.timeEnd('processing')

  if (!result.ok) {
    console.log('Error processing video', result.error)
    return Response.json({ error: result.error }, { status: 500 })
  }

  const clipUrl = r2.presign(outputKey)

  return Response.json({ data: result.data, clipUrl })

  // const ownerId = 'some bs'
  // const createdClip = await MUTATIONS.createClip({game, outputDuration, ownerId, , })
}
