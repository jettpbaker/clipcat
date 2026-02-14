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

export type CompressVideoOptions = {
	file: File
	trim: { start?: number; end?: number }
	onProgress: (progress: number) => void
}

type CompressVideoResult =
	| { ok: true; url: string; size: string }
	| { ok: false; reason: string }

export async function compressVideo(
	options: CompressVideoOptions
): Promise<CompressVideoResult> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(options.file),
	})
	try {
		const {
			originalFrameRate,
			originalWidth,
			trimStart,
			trimEnd,
			videoBitrate,
		} = await getConversionMetadata(input, options)

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
			throw new Error('Video conversion failed')
		}

		conversion.onProgress = options.onProgress

		await conversion.execute()
		const buffer = output.target.buffer
		if (!buffer) {
			console.error('Conversion failed!')
			throw new Error('Video output buffer not found')
		}

		const blob = new Blob([buffer], { type: 'video/mp4' })

		return {
			url: URL.createObjectURL(blob),
			size: formatBytes(blob.size),
			ok: true,
		}
	} catch (e: unknown) {
		if (e instanceof Error && e.message) {
			return { ok: false, reason: e.message }
		}
		return { ok: false, reason: 'An unknown error occurred' }
	} finally {
		input.dispose()
	}
}

async function getConversionMetadata(
	input: Input,
	options: CompressVideoOptions
) {
	const videoTrack = await input.getPrimaryVideoTrack()
	if (!videoTrack) throw new Error('No video track found')

	const packetStats = await videoTrack.computePacketStats(100)
	const originalFrameRate = Math.round(packetStats.averagePacketRate)

	const originalWidth = videoTrack.displayWidth

	const inputDuration = await input.computeDuration()
	const trimStart = options.trim.start ?? 0
	const trimEnd = options.trim.end ?? inputDuration
	const trimmedDuration = Math.max(trimEnd - trimStart, 0)

	const videoBitrate = calculateBitrate(trimmedDuration || inputDuration)

	return { originalFrameRate, originalWidth, trimStart, trimEnd, videoBitrate }
}
