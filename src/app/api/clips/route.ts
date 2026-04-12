import enqueueClipProcessing from '@/lib/enqueueClipProcessing'
import { enqueueClipProcessingSchema } from '@/lib/schemas'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { MUTATIONS } from '@/db/queries'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

async function getUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return {
      ok: false as const,
      error: 'Unauthorized',
    }
  }
  return {
    ok: true as const,
    data: session.user.id,
  }
}

async function parseBody(request: Request) {
  const body = await request.json()

  const parsed = enqueueClipProcessingSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: z.flattenError(parsed.error),
    }
  }

  return {
    ok: true as const,
    data: parsed.data,
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await getUserId()
    if (!ownerId.ok) {
      return Response.json({ ok: false, error: ownerId.error }, { status: 401 })
    }

    const input = await parseBody(request)
    if (!input.ok) {
      console.error('Failed to parse request body', input.error)
      return Response.json({ ok: false, error: 'Failed to create clip' }, { status: 400 })
    }

    const outputKey = `c/${nanoid()}.mp4`

    const clip = await MUTATIONS.createClip({
      ownerId: ownerId.data,
      title: input.data.title,
      game: input.data.game,
      inputKey: input.data.inputKey,
      videoKey: outputKey,
      uploadStartedAt: input.data.uploadStartedAt,
      uploadCompletedAt: input.data.uploadCompletedAt,
    })

    const clipId = clip.id

    const modalCallId = await enqueueClipProcessing(clipId, input.data.inputKey, outputKey)
    await MUTATIONS.attachModalCallId(clipId, modalCallId)

    return Response.json({ ok: true, clipId, status: 'processing' })
  } catch (err) {
    console.error('Failed to create clip', err)
    return Response.json({ ok: false, error: 'Failed to create clip' }, { status: 500 })
  }
}
