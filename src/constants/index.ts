import type { Preset } from "../hooks/usePresets"

export const AUDIO_BITRATE = 128000
export const TARGET_OUTPUT_BYTES = 10 * 1024 * 1024
export const TARGET_OUTPUT_BITS = TARGET_OUTPUT_BYTES * 8
export const METADATA_FACTOR = 0.95
export const SAFETY_FACTOR = 1

export const DEFAULT_PRESETS: Preset[] = [
  {
    id: "discord-free",
    name: "Discord Free",
    targetSize: 10,
    resolution: "1080p",
    framerate: "30",
    isCustom: false,
  },
]
