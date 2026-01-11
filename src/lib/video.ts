import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
} from 'mediabunny'
import { AUDIO_BITRATE, TARGET_OUTPUT_BYTES } from '../constants'
import { calculateBitrate, getVideoDurationSeconds } from './utils'

type CompressionResult = {
	url: string
	sizeBytes: number
	width: number
}

export async function compressVideo(options: {
	file: File
	trim: { start: number | undefined; end?: number | undefined }
	onProgress?: (progress: number) => void
}) {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(options.file),
	})

	try {
		const durationSeconds = await getVideoDurationSeconds(
			options.trim.start,
			options.trim.end,
			input
		)

		const videoTrack = await input.getPrimaryVideoTrack()
		if (!videoTrack) throw new Error('No video track found for this file')

		const packetStats = await videoTrack.computePacketStats(100)
		const frameRate = Math.round(packetStats.averagePacketRate)
		const videoBitrate = calculateBitrate(durationSeconds)
		const originalWidth = videoTrack.displayWidth

		// Determine which widths to try (don't upscale, dedupe)
		const candidateWidths = [1280, 1920, originalWidth]
			.filter((w) => w <= originalWidth)
			.filter((w, i, arr) => arr.indexOf(w) === i)
			.sort((a, b) => a - b)

		// Track progress across all conversions
		const progressMap = new Map<number, number>()
		const updateProgress = () => {
			if (!options.onProgress) return
			const total = Array.from(progressMap.values()).reduce((a, b) => a + b, 0)
			options.onProgress(total / candidateWidths.length)
		}

		// Run all compressions in parallel
		const results = await Promise.all(
			candidateWidths.map((width) =>
				compressAtResolution({
					input,
					trim: options.trim,
					videoBitrate,
					frameRate,
					width,
					onProgress: (p) => {
						progressMap.set(width, p)
						updateProgress()
					},
				})
			)
		)

		// Pick best: largest under target, or smallest if all exceed
		const underLimit = results
			.filter((r) => r.sizeBytes <= TARGET_OUTPUT_BYTES)
			.sort((a, b) => b.sizeBytes - a.sizeBytes)

		const best =
			underLimit[0] || results.sort((a, b) => a.sizeBytes - b.sizeBytes)[0]

		// Clean up unused blob URLs
		for (const result of results) {
			if (result !== best) {
				URL.revokeObjectURL(result.url)
			}
		}

		return {
			url: best.url,
			size: formatBytes(best.sizeBytes),
		}
	} finally {
		input.dispose()
	}
}

async function compressAtResolution(options: {
	input: Input
	trim: { start: number | undefined; end?: number | undefined }
	videoBitrate: number
	frameRate: number
	width: number
	onProgress?: (progress: number) => void
}): Promise<CompressionResult> {
	const output = new Output({
		format: new Mp4OutputFormat(),
		target: new BufferTarget(),
	})

	const conversion = await Conversion.init({
		input: options.input,
		output,
		video: {
			width: options.width,
			bitrate: options.videoBitrate,
			codec: 'avc',
			frameRate: options.frameRate,
		},
		audio: {
			numberOfChannels: 1,
			bitrate: AUDIO_BITRATE,
		},
		trim: options.trim,
		tags: {},
	})

	if (!conversion.isValid) {
		throw new Error(`Conversion invalid at ${options.width}p`)
	}

	if (options.onProgress) {
		conversion.onProgress = options.onProgress
	}

	await conversion.execute()

	const buffer = output.target.buffer
	if (!buffer) {
		throw new Error(`No output buffer at ${options.width}p`)
	}

	const blob = new Blob([buffer], { type: 'video/mp4' })

	return {
		url: URL.createObjectURL(blob),
		sizeBytes: blob.size,
		width: options.width,
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	return `${mb.toFixed(1)} MB`
}
