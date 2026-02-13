import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { usePreset } from '@/hooks/usePresets'

function PresetPicker() {
	const { presets } = usePreset()

	return (
		<div>
			<Select>
				<SelectTrigger className='w-[240px]'>
					<SelectValue placeholder='Select a preset' />
				</SelectTrigger>
				<SelectContent>
					{presets.map((p) => (
						<SelectItem value={p.id} key={p.id}>
							{p.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

export default PresetPicker
