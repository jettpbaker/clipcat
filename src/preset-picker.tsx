import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import type { Preset } from '@/hooks/usePresets'

function PresetPicker({
	preset,
	presets,
	onPresetChange,
}: {
	preset: Preset | null
	presets: Preset[]
	onPresetChange: (preset: Preset) => void
}) {
	function handlePresetChange(value: string) {
		const preset = presets.find((p) => p.id === value)
		if (preset) {
			onPresetChange(preset)
		}
	}
	return (
		<div>
			<Select value={preset?.id} onValueChange={handlePresetChange}>
				<SelectTrigger>
					<SelectValue placeholder='Select a preset' />
				</SelectTrigger>
				<SelectContent>
					{presets.map(
						(p) =>
							!p.isDeleted && (
								<SelectItem value={p.id} key={p.id}>
									{p.name}
								</SelectItem>
							)
					)}
				</SelectContent>
			</Select>
		</div>
	)
}

export default PresetPicker
