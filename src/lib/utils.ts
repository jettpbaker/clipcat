import type { Input } from 'mediabunny'
import {
	AUDIO_BITRATE,
	METADATA_FACTOR,
	SAFETY_FACTOR,
	TARGET_OUTPUT_BITS,
} from '@/constants'

export function parseTimeToSeconds(time: string): number | undefined {
	const trimmed = time.trim()
	if (!trimmed) return undefined

	const [minutesPart, secondsPart] = trimmed.split(':')
	const minutes = Number(minutesPart)
	const seconds = Number(secondsPart)

	if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return undefined

	return (minutes || 0) * 60 + (seconds || 0)
}

export function getVideoUrlAndSize(buffer: ArrayBuffer) {
	const blob = new Blob([buffer], { type: 'video/mp4' })
	const url = URL.createObjectURL(blob)
	const size = formatBytes(blob.size)

	return { url, size }
}

export async function getVideoDurationSeconds(
	startTime: number | undefined,
	endTime: number | undefined,
	input: Input
) {
	if (startTime !== undefined && endTime !== undefined) {
		return endTime - startTime
	}

	const duration = await input.computeDuration()

	if (startTime !== undefined) {
		return duration - startTime
	}

	if (endTime !== undefined) {
		return endTime
	}

	return duration
}

export function calculateBitrate(durationSeconds: number) {
	const audioBits = AUDIO_BITRATE * durationSeconds

	const availableBits = TARGET_OUTPUT_BITS * METADATA_FACTOR - audioBits
	const bitrate = availableBits / durationSeconds

	const safetyFactorAdjustedBitrate = bitrate * SAFETY_FACTOR
	const finalBitrate = Math.ceil(safetyFactorAdjustedBitrate / 1000) * 1000

	return finalBitrate
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	return `${mb.toFixed(1)} MB`
}

/**
 * Build list of widths to try compression at.
 * Includes 1280 and 1920 if they don't exceed original (no upscaling).
 * Always includes original width. Deduped and sorted smallest-first.
 */
export function getCandidateWidths(originalWidth: number): number[] {
	return [1280, 1920, originalWidth]
		.filter((w) => w <= originalWidth)
		.filter((w, i, arr) => arr.indexOf(w) === i)
		.sort((a, b) => a - b)
}

/**
 * Pick the best result from multiple compression attempts.
 * Prefers: largest file that's still under the target size.
 * Fallback: smallest file if all exceed target.
 */
export function pickBestResult<T extends { sizeBytes: number }>(
	results: T[],
	targetBytes: number
): T {
	const underLimit = results
		.filter((r) => r.sizeBytes <= targetBytes)
		.sort((a, b) => b.sizeBytes - a.sizeBytes)

	return (
		underLimit[0] || [...results].sort((a, b) => a.sizeBytes - b.sizeBytes)[0]
	)
}
