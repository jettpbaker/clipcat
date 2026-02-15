import type { Preset } from '@/hooks/usePresets'

export const AUDIO_BITRATE = 128000
export const TARGET_OUTPUT_BYTES = 10 * 1024 * 1024
export const TARGET_OUTPUT_BITS = TARGET_OUTPUT_BYTES * 8
export const METADATA_FACTOR = 0.95
export const SAFETY_FACTOR = 1

export const DEFAULT_PRESETS: Preset[] = [
	{
		id: 'discord-free',
		name: 'Discord Free',
		description:
			"Preset optimised for getting clip size under Discord's free 10MB limit",
		targetSize: 10,
		resolution: '1920',
		framerate: '30',
		isCustom: false,
		isDefault: false,
		isDeleted: false,
	},
	{
		id: 'discord-nitro',
		name: 'Discord Nitro',
		description:
			"Preset optimised for getting clip size under Discord Nitro's 500MB limit",
		targetSize: 500,
		resolution: 'original',
		framerate: 'original',
		isCustom: false,
		isDefault: true,
		isDeleted: false,
	},
	{
		id: 'discord-nitro-basic',
		name: 'Discord Nitro Basic',
		description:
			"Preset optimised for getting clip size under Discord Nitro Basic's 50MB limit",
		targetSize: 50,
		resolution: '1920',
		framerate: '60',
		isCustom: false,
		isDefault: false,
		isDeleted: false,
	},
]
