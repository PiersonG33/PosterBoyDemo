import { useState } from 'react'
import {
  getNoteSize,
  normalizeDemoSettings,
  writeDemoSettings,
  type DemoSettings,
} from '../demoSettings'
import { MAX_NOTE_SIZE_PERCENT, MIN_NOTE_SIZE_PERCENT } from '../constants'

interface DebugPanelProps {
  settings: DemoSettings
  isBusy: boolean
  onResetBoard: () => Promise<boolean>
}

export function DebugPanel({ settings, isBusy, onResetBoard }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(settings)
  const hasPendingChanges = draft.noteSizePercent !== settings.noteSizePercent
    || draft.randomTilt !== settings.randomTilt

  const updateDraft = (next: DemoSettings) => {
    const normalized = normalizeDemoSettings(next)
    setDraft(normalized)
    writeDemoSettings(normalized)
  }

  return (
    <aside className={`debug-panel ${isOpen ? 'debug-panel--open' : ''}`}>
      {isOpen && (
        <div className="debug-panel__box">
          <div className="debug-panel__heading">
            <strong>Demo controls</strong>
            <span>Current note: {Math.round(getNoteSize(settings))}px</span>
          </div>

          <label className="debug-field">
            <span>Note size on refresh</span>
            <span className="debug-size-input">
              <input
                type="number"
                min={MIN_NOTE_SIZE_PERCENT}
                max={MAX_NOTE_SIZE_PERCENT}
                step="5"
                value={draft.noteSizePercent}
                onChange={(event) => {
                  if (!Number.isFinite(event.currentTarget.valueAsNumber)) return
                  updateDraft({ ...draft, noteSizePercent: event.currentTarget.valueAsNumber })
                }}
              />
              %
            </span>
          </label>

          <label className="debug-toggle">
            <input
              type="checkbox"
              checked={draft.randomTilt}
              onChange={(event) => updateDraft({ ...draft, randomTilt: event.currentTarget.checked })}
            />
            <span>Random note tilt</span>
          </label>

          <p>Changing layout settings opens a freshly seeded board after refresh.</p>

          <div className="debug-panel__actions">
            <button type="button" onClick={() => location.reload()} disabled={!hasPendingChanges || isBusy}>
              Apply + refresh
            </button>
            <button type="button" onClick={() => void onResetBoard()} disabled={isBusy}>
              Reset demo board
            </button>
          </div>
        </div>
      )}
      <button
        className="debug-panel__trigger"
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        DEV
      </button>
    </aside>
  )
}
