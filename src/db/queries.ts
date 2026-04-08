import 'server-only'

import { DB_ClipInsertType } from './schema'
import { db } from './db'
import { clips } from './schema'

export const MUTATIONS = {
  createClip: async function (clip: DB_ClipInsertType) {
    return await db.insert(clips).values(clip)
  },
}
