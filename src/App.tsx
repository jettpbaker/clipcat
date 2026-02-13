import { useState } from 'react'
import { parseTimeToSeconds } from '@/lib/utils'
import { compressVideo, type PassProgress } from '@/lib/video'

import PresetPicker from '@/preset-picker'
import type { Preset } from './hooks/usePresets'

function App() {
	const [startTime, setStartTime] = useState<string>('')
	const [endTime, setEndTime] = useState<string>('')
	const [file, setFile] = useState<File | null>(null)
	const [url, setUrl] = useState<string | null>(null)
	const [size, setSize] = useState<string | null>(null)
	const [isConverting, setIsConverting] = useState(false)
	const [pass1Progress, setPass1Progress] = useState(0)
	const [pass2Progress, setPass2Progress] = useState(0)
	const [currentPass, setCurrentPass] = useState<1 | 2>(1)
	const [preset, setPreset] = useState<Preset>(null)

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const selectedFile = e.target.files?.[0] ?? null
		setFile(selectedFile)
	}

	function handleProgress(progress: PassProgress) {
		setCurrentPass(progress.pass)
		if (progress.pass === 1) {
			setPass1Progress(progress.progress)
		} else {
			setPass2Progress(progress.progress)
		}
	}

	async function handleConvert() {
		if (!file) return

		setIsConverting(true)
		setPass1Progress(0)
		setPass2Progress(0)
		setCurrentPass(1)

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
			const { url: compressedUrl, size } = await compressVideo(options)

			if (url) URL.revokeObjectURL(url)

			setUrl(compressedUrl)
			setSize(size)
		} finally {
			setIsConverting(false)
		}
	}

	return (
		<main className='h-screen w-screen'>
			<header>
				<h1 className='text-6xl'>ClipCat</h1>
			</header>

			<main>
				<PresetPicker preset={preset} onPresetChange={setPreset} />
			</main>

			<footer>
				<p>ClipCat – Video Trimmer & Compressor</p>
			</footer>

			<div className='hidden'>
				<h1>ClipCat</h1>

				<br />

				<PresetPicker />

				<br />

				<label>
					Upload a file:
					<input type='file' accept='video/*' onChange={handleFileChange} />
				</label>

				<br />

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

				<br />

				<button
					type='button'
					onClick={handleConvert}
					disabled={!file || isConverting}
				>
					Convert
				</button>

				{isConverting && (
					<div style={{ marginTop: '1rem' }}>
						<div>
							<span>Pass 1 (Trim): {Math.round(pass1Progress * 100)}%</span>
							<progress
								value={pass1Progress}
								max={1}
								style={{ width: '200px', marginLeft: '0.5rem' }}
							/>
							{currentPass === 1 && ' ⏳'}
						</div>
						<div style={{ marginTop: '0.5rem' }}>
							<span>Pass 2 (Compress): {Math.round(pass2Progress * 100)}%</span>
							<progress
								value={pass2Progress}
								max={1}
								style={{ width: '200px', marginLeft: '0.5rem' }}
							/>
							{currentPass === 2 && ' ⏳'}
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
			</div>
		</main>
	)
}

export default App
