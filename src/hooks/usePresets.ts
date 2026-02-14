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
	isDeleted: boolean
}

function loadPresetsFromStorage() {
	let presets = localStorage.getItem('presets')
	if (!presets) {
		presets = JSON.stringify(DEFAULT_PRESETS)
		localStorage.setItem('presets', presets)
	}
	const stored = JSON.parse(presets)
	const merged = [
		...stored,
		...DEFAULT_PRESETS.filter(
			(d) => !stored.some((s: Preset) => s.id === d.id)
		),
	]
	localStorage.setItem('presets', JSON.stringify(merged))
	return merged
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
		const exists = presets.some((p) => p.id === id)
		if (!exists) return

		const deleted = presets.map((p) => {
			if (id === p.id) return { ...p, isDeleted: true }
			return p
		})
		savePresetsToStorage(deleted)
		setPresets(deleted)
	}

	function setPresetAsDefault(id: string) {
		const exists = presets.some((p) => p.id === id)
		if (!exists) return
		const canSet = presets.some((p) => p.id === id && !p.isDeleted)
		if (!canSet) {
			console.warn('Trying to set a deleted preset as default!')
			return
		}

		const updated = presets.map((p) => {
			if (p.isDeleted) return p
			return { ...p, isDefault: p.id === id }
		})
		savePresetsToStorage(updated)
		setPresets(updated)
	}

	const defaultPreset = presets.find((p) => p.isDefault && !p.isDeleted) ?? null

	return { presets, defaultPreset, addPreset, deletePreset, setPresetAsDefault }
}
