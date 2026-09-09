import {
  DEFAULT_NOTE_SIZE_PERCENT,
  MAX_NOTE_SIZE_PERCENT,
  MIN_NOTE_SIZE_PERCENT,
  REFERENCE_NOTE_SIZE,
} from './constants'

const SETTINGS_KEY = 'poster-boy-demo-settings-v1'

export interface DemoSettings {
  noteSizePercent: number
  randomTilt: boolean
}

export const defaultDemoSettings: DemoSettings = {
  noteSizePercent: DEFAULT_NOTE_SIZE_PERCENT,
  randomTilt: true,
}

const normalizeNoteSize = (value: number) => Math.min(
  MAX_NOTE_SIZE_PERCENT,
  Math.max(MIN_NOTE_SIZE_PERCENT, Math.round(value)),
)

export function normalizeDemoSettings(settings: DemoSettings): DemoSettings {
  return {
    noteSizePercent: normalizeNoteSize(settings.noteSizePercent),
    randomTilt: Boolean(settings.randomTilt),
  }
}

export function readDemoSettings(): DemoSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (!stored) return defaultDemoSettings
    const parsed = JSON.parse(stored) as Partial<DemoSettings>
    return normalizeDemoSettings({
      noteSizePercent: typeof parsed.noteSizePercent === 'number'
        ? parsed.noteSizePercent
        : defaultDemoSettings.noteSizePercent,
      randomTilt: typeof parsed.randomTilt === 'boolean'
        ? parsed.randomTilt
        : defaultDemoSettings.randomTilt,
    })
  } catch {
    return defaultDemoSettings
  }
}

export function writeDemoSettings(settings: DemoSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeDemoSettings(settings)))
}

export function getNoteSize(settings: DemoSettings) {
  return REFERENCE_NOTE_SIZE * settings.noteSizePercent / 100
}

export function getRandomNoteRotation() {
  return Number(((Math.random() - 0.5) * 7).toFixed(2))
}
