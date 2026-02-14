import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
} from 'mediabunny'
import { AUDIO_BITRATE } from '@/constants'
import { calculateBitrate, formatBytes } from '@/lib/utils'

export async function compressVideo(options: {
	file: File
	trim: { start: number | undefined; end?: number | undefined }
	onProgress?: (progress: number) => void
}): Promise<{
	url: string | null
	size: string | null
	error: boolean
}> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(options.file),
	})

	const videoTrack = await input.getPrimaryVideoTrack()
	if (!videoTrack) throw new Error('No video track found for this file')

	const packetStats = await videoTrack.computePacketStats(100)
	const originalFrameRate = Math.round(packetStats.averagePacketRate)

	const originalWidth = videoTrack.displayWidth

	const inputDuration = await input.computeDuration()
	const trimStart = options.trim.start ?? 0
	const trimEnd = options.trim.end ?? inputDuration
	const trimmedDuration = Math.max(trimEnd - trimStart, 0)

	const videoBitrate = calculateBitrate(trimmedDuration || inputDuration)

	const output = new Output({
		format: new Mp4OutputFormat(),
		target: new BufferTarget(),
	})

	const conversion = await Conversion.init({
		input,
		output,
		video: {
			width: originalWidth,
			bitrate: videoBitrate,
			frameRate: originalFrameRate,
		},
		audio: {
			numberOfChannels: 1,
			bitrate: AUDIO_BITRATE,
		},
		trim: {
			start: trimStart,
			end: trimEnd,
		},
	})

	if (!conversion.isValid) {
		console.error('Conversion failed!')
		return { url: null, size: null, error: true }
	}

	conversion.onProgress = options.onProgress

	await conversion.execute()
	const buffer = output.target.buffer
	if (!buffer) {
		console.error('Conversion failed!')
		return { url: null, size: null, error: true }
	}

	const blob = new Blob([buffer], { type: 'video/mp4' })

	input.dispose()

	return {
		url: URL.createObjectURL(blob),
		size: formatBytes(blob.size),
		error: false,
	}
}
