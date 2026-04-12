CREATE TYPE "public"."clip_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
ALTER TABLE "clips" RENAME COLUMN "storage_key" TO "video_key";--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "file_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clips" ALTER COLUMN "duration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "input_key" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "image_key" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "modal_call_id" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "status" "clip_status" DEFAULT 'processing' NOT NULL;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "upload_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "upload_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "processing_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "processing_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "clips" ADD COLUMN "recorded_at" timestamp;