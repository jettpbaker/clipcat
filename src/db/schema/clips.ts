import * as p from 'drizzle-orm/pg-core'

export const clips = p.pgTable('clips', {
  id: p.uuid('id').primaryKey().defaultRandom(),
  userId: p.text('user_id').notNull(),
  title: p.text('title').notNull(),
  game: p.text('game').notNull(),
  storageKey: p.text('storage_key').notNull(),
  fileSize: p.integer('file_size').notNull(),
  duration: p.integer('duration').notNull(),
  createdAt: p.timestamp('created_at').notNull().defaultNow(),
  updatedAt: p
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
