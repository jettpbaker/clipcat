import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Mp4OutputFormat,
	Output,
	QUALITY_HIGH,
	QUALITY_LOW,
	QUALITY_MEDIUM,
	QUALITY_VERY_HIGH,
	QUALITY_VERY_LOW,
	type Quality,
} from 'mediabunny'
import { useEffect, useRef, useState } from 'react'

function parseTimeToSeconds(time: string): number | null {
	const trimmed = time.trim()
	if (!trimmed) return null

	const [minutesPart, secondsPart] = trimmed.split(':')
	const minutes = Number(minutesPart)
	const seconds = Number(secondsPart)

	if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null

	return (minutes || 0) * 60 + (seconds || 0)
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	const kb = bytes / 1024
	if (kb < 1024) return `${kb.toFixed(1)} KB`
	const mb = kb / 1024
	return `${mb.toFixed(1)} MB`
}

const qualityById = {
	veryHigh: QUALITY_VERY_HIGH,
	high: QUALITY_HIGH,
	medium: QUALITY_MEDIUM,
	low: QUALITY_LOW,
	veryLow: QUALITY_VERY_LOW,
} as const satisfies Record<string, Quality>

type QualityId = keyof typeof qualityById

const QUALITY_OPTIONS = [
	{ id: 'veryHigh', label: 'Very High' },
	{ id: 'high', label: 'High' },
	{ id: 'medium', label: 'Medium' },
	{ id: 'low', label: 'Low' },
	{ id: 'veryLow', label: 'Very Low' },
] as const satisfies readonly { id: QualityId; label: string }[]

const AUTO_MAX_ATTEMPTS = 5

type OutputState = {
	status: 'idle' | 'encoding' | 'done' | 'error'
	url: string | null
	sizeBytes: number | null
	error: string | null
}

const INITIAL_OUTPUT_STATE: OutputState = {
	status: 'idle',
	url: null,
	sizeBytes: null,
	error: null,
}

function App() {
	const [startTime, setStartTime] = useState('')
	const [endTime, setEndTime] = useState('')
	const [file, setFile] = useState<File | null>(null)
	const [qualityId, setQualityId] = useState<QualityId>('medium')
	const [output, setOutput] = useState<OutputState>(INITIAL_OUTPUT_STATE)
	const [isConverting, setIsConverting] = useState(false)
	const [autoPass, setAutoPass] = useState<number | null>(null)

	const jobIdRef = useRef(0)
	const outputUrlRef = useRef<string | null>(null)

	useEffect(() => {
		return () => {
			if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
		}
	}, [])

	function resetOutput() {
		if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current)
		outputUrlRef.current = null
		setOutput(INITIAL_OUTPUT_STATE)
		setAutoPass(null)
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		jobIdRef.current += 1

		const selectedFile = e.target.files?.[0] ?? null
		setFile(selectedFile)
		setIsConverting(false)
		resetOutput()
	}

	async function encodeVariant(options: {
		file: File
		trim: { start: number; end?: number }
		width?: number
		height?: number
		videoBitrate: number | Quality
		audio?: {
			numberOfChannels: number
			bitrate: number | Quality
		}
	}): Promise<{ blob: Blob; sizeBytes: number }> {
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(options.file),
		})

		const output = new Output({
			format: new Mp4OutputFormat(),
			target: new BufferTarget(),
		})

		try {
			const video = {
				bitrate: options.videoBitrate,
				forceTranscode: true,
				...(options.width !== undefined ? { width: options.width } : {}),
				...(options.height !== undefined ? { height: options.height } : {}),
			}

			const audio = options.audio
				? {
						...options.audio,
						forceTranscode: true,
					}
				: { discard: true }

			const conversion = await Conversion.init({
				input,
				output,
				video,
				audio,
				trim: options.trim,
				tags: {},
			})

			await conversion.execute()

			const buffer = output.target.buffer
			if (!buffer) {
				throw new Error('Conversion completed but produced no output buffer')
			}

			const blob = new Blob([buffer], { type: 'video/mp4' })
			return { blob, sizeBytes: blob.size }
		} finally {
			input.dispose()
		}
	}

	async function handleConvert() {
		if (!file || isConverting) return

		const startSeconds = parseTimeToSeconds(startTime) ?? 0
		const endSeconds = parseTimeToSeconds(endTime)

		if (endSeconds === null) {
			setOutput((prev) => ({
				...prev,
				status: 'error',
				error: 'Please enter an end time',
			}))
			return
		}

		if (endSeconds <= startSeconds) {
			setOutput((prev) => ({
				...prev,
				status: 'error',
				error: 'End time must be after start time',
			}))
			return
		}

		const trim = {
			start: startSeconds,
			end: endSeconds,
		}

		const jobId = jobIdRef.current

		setIsConverting(true)
		resetOutput()
		setOutput({ status: 'encoding', url: null, sizeBytes: null, error: null })

		try {
			const AUTO_TARGET_BYTES = 9_800_000
			const AUDIO_BITRATE_BPS = 96_000
			const BPP_THRESHOLD = 0.02
			const MIN_VIDEO_BITRATE_BPS = 150_000

			setAutoPass(null)

			const durationSeconds = endSeconds - startSeconds

			const analysisInput = new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(file),
			})

			let displayWidth = 0
			let displayHeight = 0
			let estimatedFps = 30
			let hasAudio = false

			try {
				const videoTrack = await analysisInput.getPrimaryVideoTrack()
				if (!videoTrack) {
					throw new Error('No video track found in the selected file')
				}

				displayWidth = videoTrack.displayWidth
				displayHeight = videoTrack.displayHeight

				const videoStats = await videoTrack.computePacketStats(300)
				estimatedFps = Math.min(Math.max(videoStats.averagePacketRate, 15), 120)

				const audioTrack = await analysisInput.getPrimaryAudioTrack()
				hasAudio = audioTrack !== null
			} finally {
				analysisInput.dispose()
			}

			const overheadBytes = Math.max(
				150_000,
				Math.round(AUTO_TARGET_BYTES * 0.015)
			)
			const audioBytesBudget = hasAudio
				? Math.ceil((AUDIO_BITRATE_BPS * durationSeconds) / 8)
				: 0

			const videoBytesBudget =
				AUTO_TARGET_BYTES - overheadBytes - audioBytesBudget
			if (videoBytesBudget <= 0) {
				throw new Error('Clip is too short to safely fit under 10MB')
			}

			let videoBitrateBps = Math.floor((videoBytesBudget * 8) / durationSeconds)

			const pixelsPerSecond = displayWidth * displayHeight * estimatedFps
			const bitsPerPixel =
				pixelsPerSecond > 0 ? videoBitrateBps / pixelsPerSecond : Infinity

			const isLandscape = displayWidth >= displayHeight
			const isOver1080p = isLandscape
				? displayHeight > 1080
				: displayWidth > 1080
			const shouldDownscale = isOver1080p && bitsPerPixel < BPP_THRESHOLD

			let downscaleWidth: number | undefined
			let downscaleHeight: number | undefined

			if (shouldDownscale) {
				if (isLandscape) {
					downscaleHeight = 1080
				} else {
					downscaleWidth = 1080
				}
			}

			for (let attempt = 1; attempt <= AUTO_MAX_ATTEMPTS; attempt += 1) {
				if (jobId !== jobIdRef.current) return
				if (attempt > 1) setAutoPass(attempt)

				const variantOptions = {
					file,
					trim,
					videoBitrate: videoBitrateBps,
					...(downscaleWidth !== undefined ? { width: downscaleWidth } : {}),
					...(downscaleHeight !== undefined ? { height: downscaleHeight } : {}),
					...(hasAudio
						? {
								audio: {
									numberOfChannels: 1,
									bitrate: AUDIO_BITRATE_BPS,
								},
							}
						: {}),
				}

				const { blob, sizeBytes } = await encodeVariant(variantOptions)

				if (sizeBytes <= AUTO_TARGET_BYTES) {
					const url = URL.createObjectURL(blob)

					if (jobId !== jobIdRef.current) {
						URL.revokeObjectURL(url)
						return
					}

					outputUrlRef.current = url
					setOutput({ status: 'done', url, sizeBytes, error: null })
					return
				}

				const ratio = AUTO_TARGET_BYTES / sizeBytes
				const nextBitrate = Math.floor(videoBitrateBps * ratio * 0.92)
				const reducedBitrate =
					nextBitrate < videoBitrateBps
						? nextBitrate
						: Math.floor(videoBitrateBps * 0.85)

				videoBitrateBps = Math.max(reducedBitrate, MIN_VIDEO_BITRATE_BPS)
			}

			throw new Error(
				'Auto mode could not hit the target size. Try trimming more.'
			)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)

			if (jobId !== jobIdRef.current) return

			setOutput({ status: 'error', url: null, sizeBytes: null, error: message })
		} finally {
			if (jobId === jobIdRef.current) {
				setIsConverting(false)
				setAutoPass(null)
			}
		}
	}

	const sizeLabel =
		output.sizeBytes !== null ? formatBytes(output.sizeBytes) : null

	return (
		<main>
			<h1>ClipCat</h1>

			<label>
				Upload a file:
				<input type='file' accept='video/*' onChange={handleFileChange} />
			</label>

			<label>
				Start time (MM:SS):
				<input
					type='text'
					placeholder='00:00'
					value={startTime}
					onChange={(e) => setStartTime(e.target.value)}
				/>
			</label>

			<label>
				End time (MM:SS):
				<input
					type='text'
					placeholder='00:00'
					value={endTime}
					onChange={(e) => setEndTime(e.target.value)}
				/>
			</label>

			<label>
				Output quality:
				<select
					value={qualityId}
					onChange={(e) => setQualityId(e.currentTarget.value as QualityId)}
				>
					{QUALITY_OPTIONS.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
			</label>

			<button
				type='button'
				onClick={handleConvert}
				disabled={!file || isConverting}
			>
				{isConverting ? 'Converting…' : 'Convert'}
			</button>

			{output.status === 'error' && output.error && (
				<p>Error: {output.error}</p>
			)}

			<section>
				<h2>Output{sizeLabel ? ` (${sizeLabel})` : ''}</h2>

				<p>
					{output.status === 'idle' && 'Idle'}
					{output.status === 'encoding' &&
						(autoPass === null
							? 'Encoding…'
							: `Encoding… (pass ${autoPass}/${AUTO_MAX_ATTEMPTS})`)}
					{output.status === 'done' && 'Done'}
					{output.status === 'error' && 'Error'}
				</p>

				{/*biome-ignore lint/a11y/useMediaCaption: user-uploaded video preview */}
				{output.url && <video src={output.url} controls />}
			</section>
		</main>
	)
}

export default App
