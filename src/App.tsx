import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { parseTimeToSeconds } from '@/lib/utils'
import { compressVideo } from '@/lib/video'
import PresetPicker from '@/preset-picker'
import { Button } from './components/ui/button'
import { Field, FieldLabel } from './components/ui/field'
import type { Preset } from './hooks/usePresets'
import { usePreset } from './hooks/usePresets'

function App() {
	const { presets, defaultPreset } = usePreset()

	const [startTime, setStartTime] = useState<string>('')
	const [endTime, setEndTime] = useState<string>('')
	const [file, setFile] = useState<File | null>(null)
	const [url, setUrl] = useState<string | null>(null)
	const [size, setSize] = useState<string | null>(null)
	const [isConverting, setIsConverting] = useState(false)
	const [passProgress, setPassProgress] = useState(0)
	const [preset, setPreset] = useState<Preset | null>(defaultPreset)

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const selectedFile = e.target.files?.[0] ?? null
		setFile(selectedFile)
	}

	function handleProgress(progress: number) {
		setPassProgress(progress)
	}

	async function handleConvert() {
		if (!file) return

		setIsConverting(true)

		const start = parseTimeToSeconds(startTime)
		const end = parseTimeToSeconds(endTime)

		const options = {
			file,
			trim: {
				start,
				end,
			},
			onProgress: handleProgress,
		}

		try {
			const result = await compressVideo(options)
			if (!result.ok) {
				toast.error(result.reason, { position: 'bottom-right' })
				return
			}

			if (url) URL.revokeObjectURL(url)

			setUrl(result.url)
			setSize(result.size)
		} finally {
			setIsConverting(false)
		}
	}

	return (
		<>
			<header>
				<h1 className='text-6xl'>ClipCat</h1>
			</header>

			<main>
				<PresetPicker
					presets={presets}
					preset={preset}
					onPresetChange={setPreset}
				/>

				<label htmlFor='file-upload'>
					Upload a file:
					<Input
						id='file-upload'
						type='file'
						accept='video/*'
						onChange={handleFileChange}
					/>
				</label>

				<div className='flex mt-4 gap-4'>
					<Field className='w-2xs'>
						<FieldLabel htmlFor='fieldgroup-in-point'>
							Clip start time
						</FieldLabel>
						<Input
							id='fieldgroup-in-point'
							type='text'
							placeholder='00:00'
							onChange={(e) => setStartTime(e.target.value)}
						/>
					</Field>

					<Field className='w-2xs'>
						<FieldLabel htmlFor='fieldgroup-out-point'>
							Clip end time
						</FieldLabel>
						<Input
							id='fieldgroup-out-point'
							type='text'
							placeholder='00:00'
							onChange={(e) => setEndTime(e.target.value)}
						/>
					</Field>
				</div>

				<Button
					className='mt-4'
					onClick={handleConvert}
					disabled={!file || isConverting}
				>
					Convert
				</Button>

				{isConverting && (
					<div className='mt-4'>
						<div>
							<span>Progress: {Math.round(passProgress * 100)}%</span>
							<progress
								value={passProgress}
								max={1}
								style={{ width: '200px', marginLeft: '0.5rem' }}
							/>
						</div>
					</div>
				)}

				<section>
					{size && (
						<div>
							<h2>Compressed Size:</h2>
							<p>{size}</p>
						</div>
					)}

					{url && (
						<div>
							<h2>Compressed Video:</h2>
							{/* biome-ignore lint/a11y/useMediaCaption: Converted clips do not include caption tracks. */}
							<video src={url} controls style={{ maxWidth: '66%' }} />
						</div>
					)}
				</section>
			</main>

			<footer>
				<p>ClipCat – Video Trimmer & Compressor</p>
			</footer>
		</>
	)
}

export default App
