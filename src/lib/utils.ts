import type { Input } from 'mediabunny'
import {
	AUDIO_BITRATE,
	METADATA_FACTOR,
	SAFETY_FACTOR,
	TARGET_OUTPUT_BITS,
} from '../constants'

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

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	return `${mb.toFixed(1)} MB`
}
