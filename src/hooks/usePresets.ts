import { useState } from 'react'
import { DEFAULT_PRESETS } from '@/constants'

export type Preset = {
	id: string
	name: string
	description?: string
	targetSize: number // MB
	resolution: '720p' | '1080p' | '1440p' | 'original'
	framerate: '30' | '60' | 'original'
	isCustom: boolean
	isDefault: boolean
}

function loadPresetsFromStorage() {
	let presets = localStorage.getItem('presets')
	if (!presets) {
		presets = JSON.stringify(DEFAULT_PRESETS)
		localStorage.setItem('presets', presets)
	}
	return JSON.parse(presets)
}

function savePresetsToStorage(presets: Preset[]) {
	localStorage.setItem('presets', JSON.stringify(presets))
}

export function usePreset() {
	const [presets, setPresets] = useState<Preset[]>(loadPresetsFromStorage)

	function addPreset(preset: Preset) {
		const updated = [...presets, preset]
		savePresetsToStorage(updated)
		setPresets(updated)
	}

	function deletePreset(id: string) {
		const updated = presets.filter((p) => p.id !== id)
		savePresetsToStorage(updated)
		setPresets(updated)
	}

	function setPresetAsDefault(id: string) {
		const exists = presets.some((p) => p.id === id)
		if (!exists) return

		const updated = presets.map((p) => ({
			...p,
			isDefault: p.id === id,
		}))
		savePresetsToStorage(updated)
		setPresets(updated)
	}

	return { presets, addPreset, deletePreset, setPresetAsDefault }
}
