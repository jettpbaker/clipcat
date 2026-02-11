import { usePreset } from './hooks/usePresets'

function PresetPicker() {
	const { presets } = usePreset()

	return (
		<div>
			<select>
				{presets.map((p) => (
					<option value={p.id} key={p.id}>
						{p.name}
					</option>
				))}
			</select>
		</div>
	)
}

export default PresetPicker
