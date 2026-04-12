import { clipProcessingCallbackSchema } from '@/lib/schemas'
import { z } from 'zod'
import { MUTATIONS } from '@/db/queries'

async function parseBody(request: Request) {
  const body = await request.json()

  const parsed = clipProcessingCallbackSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false as const,
      error: z.formatError(parsed.error),
    }
  }

  return {
    ok: true as const,
    data: parsed.data,
  }
}

export async function POST(request: Request) {
  // TODO: check that it is modal hitting this endpoint

  const input = await parseBody(request)
  if (!input.ok) {
    console.error('Failed to parse callback body', input.error)
    return Response.json({ ok: false, error: 'Invalid callback body' }, { status: 400 })
  }

  if (!input.data.ok) {
    console.error('Failed to process clip', input.data.errorMessage)
    await MUTATIONS.setClip.failed(input.data)
  } else {
    await MUTATIONS.setClip.completed(input.data)
  }

  return Response.json({ ok: true })
}
