import * as p from 'drizzle-orm/pg-core'

export const clipStatusEnum = p.pgEnum('clip_status', ['processing', 'completed', 'failed'])

export const clips = p.pgTable('clips', {
  id: p.uuid('id').primaryKey().defaultRandom(),
  ownerId: p.text('owner_id').notNull(),
  title: p.text('title').notNull(),
  game: p.text('game').notNull(),

  inputKey: p.text('input_key'),
  videoKey: p.text('video_key'),
  imageKey: p.text('image_key'),
  modalCallId: p.text('modal_call_id'),

  fileSize: p.integer('file_size'),
  duration: p.integer('duration'),
  errorMessage: p.text('error_message'),

  status: clipStatusEnum('status').notNull().default('processing'),

  uploadStartedAt: p.timestamp('upload_started_at'),
  uploadCompletedAt: p.timestamp('upload_completed_at'),
  processingStartedAt: p.timestamp('processing_started_at'),
  processingCompletedAt: p.timestamp('processing_completed_at'),
  failedAt: p.timestamp('failed_at'),
  recordedAt: p.timestamp('recorded_at'),
  createdAt: p.timestamp('created_at').notNull().defaultNow(),
  updatedAt: p
    .timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export type DB_ClipType = typeof clips.$inferSelect
export type DB_ClipInsertType = typeof clips.$inferInsert
