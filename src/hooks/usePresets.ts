import { useState } from 'react'
import { DEFAULT_PRESETS } from '@/constants'

export type Preset = {
	id: string
	name: string
	targetSize: number // MB
	resolution: '720p' | '1080p' | '1440p' | 'original'
	framerate: '30' | '60' | 'original'
	isCustom: boolean
}

function getPresets() {
	let presets = localStorage.getItem('presets')
	if (!presets) {
		presets = JSON.stringify(DEFAULT_PRESETS)
		localStorage.setItem('presets', presets)
	}

	return JSON.parse(presets)
}

export function usePreset() {
	const [presets, setPresets] = useState<Preset[]>(getPresets)

	function addPreset(preset: Preset) {
		const updated = [...presets, preset]
		localStorage.setItem('presets', JSON.stringify(updated))
		setPresets(updated)
	}

	function deletePreset(id: string) {
		const updated = presets.filter((p) => p.id !== id)
		localStorage.setItem('presets', JSON.stringify(updated))
		setPresets(updated)
	}

	return { presets, addPreset, deletePreset }
}
