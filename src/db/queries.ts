import 'server-only'

import { DB_ClipInsertType } from './schema'
import { db } from './db'
import { clips } from './schema'
import { eq } from 'drizzle-orm'

import { ClipProcessingCallbackFailure, ClipProcessingCallbackSuccess } from '@/lib/schemas'

export const MUTATIONS = {
  createClip: async function (clip: DB_ClipInsertType) {
    const [createdClip] = await db.insert(clips).values(clip).returning({ id: clips.id })
    return createdClip
  },
  attachModalCallId: async function (clipId: string, modalCallId: string) {
    const [updatedClip] = await db
      .update(clips)
      .set({ modalCallId })
      .where(eq(clips.id, clipId))
      .returning({ id: clips.id, modalCallId: clips.modalCallId })

    return updatedClip
  },
  setClip: {
    completed: async function (data: ClipProcessingCallbackSuccess) {
      await db
        .update(clips)
        .set({
          status: 'completed',
          duration: data.duration,
          fileSize: data.fileSize,
          recordedAt: data.recordedAt,
          processingStartedAt: data.processingStartedAt,
          processingCompletedAt: data.processingCompletedAt,
          errorMessage: null,
          failedAt: null,
        })
        .where(eq(clips.id, data.clipId))
    },

    failed: async function (data: ClipProcessingCallbackFailure) {
      await db
        .update(clips)
        .set({
          status: 'failed',
          errorMessage: data.errorMessage,
          processingStartedAt: data.processingStartedAt,
          failedAt: data.failedAt,
        })
        .where(eq(clips.id, data.clipId))
    },
  },
}
