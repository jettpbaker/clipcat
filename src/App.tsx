import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import { useState } from 'react'

function App() {
	const [duration, setDuration] = useState<null | number>(null)

	async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0] ?? null
		if (!file) return

		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(file),
		})

		const duration = await input.computeDuration()
		setDuration(duration)
	}

	return (
		<main>
			<h1>ClipCat</h1>

			<label>
				Upload a file:
				<input type='file' onChange={handleFileUpload} />
			</label>

			{duration && <p>{duration.toFixed(2)}s</p>}
		</main>
	)
}

export default App
