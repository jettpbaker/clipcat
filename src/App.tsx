import { useState } from 'react'
import { parseTimeToSeconds } from './lib/utils'
import { compressVideo } from './lib/video'

function App() {
	const [startTime, setStartTime] = useState<string>('')
	const [endTime, setEndTime] = useState<string>('')
	const [file, setFile] = useState<File | null>(null)
	const [url, setUrl] = useState<string | null>(null)
	const [size, setSize] = useState<string | null>(null)
	const [isConverting, setIsConverting] = useState(false)
	const [progress, setProgress] = useState(0)

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const selectedFile = e.target.files?.[0] ?? null
		setFile(selectedFile)
	}

	async function handleConvert() {
		if (!file) return

		setIsConverting(true)
		setProgress(0)

		const start = parseTimeToSeconds(startTime)
		const end = parseTimeToSeconds(endTime)

		const options = {
			file,
			trim: {
				start,
				end,
			},
			onProgress: setProgress,
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
		<main>
			<h1>ClipCat</h1>

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
				{isConverting
					? `Converting... ${Math.round(progress * 100)}%`
					: 'Convert'}
			</button>

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
						<video src={url} controls style={{ maxWidth: '66%' }} />
					</div>
				)}
			</section>
		</main>
	)
}

export default App
