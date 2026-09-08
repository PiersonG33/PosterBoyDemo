import { useEffect, useState, type CSSProperties } from 'react'
import type { BoardPin } from '../types'

interface PositionedPinProps {
  pin: BoardPin
  disabled: boolean
  onRemove: () => void
}

export function PositionedPin({ pin, disabled, onRemove }: PositionedPinProps) {
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const style: CSSProperties = { left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }

  useEffect(() => {
    if (!confirmRemoval) return
    const cancel = () => setConfirmRemoval(false)
    const timeout = window.setTimeout(cancel, 4_000)
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('keydown', cancelOnEscape)
    }
  }, [confirmRemoval])

  return (
    <div className="placed-pin" style={style}>
      <button
        className="pin-button"
        type="button"
        disabled={disabled}
        aria-label="Remove this pin"
        onClick={(event) => {
          event.stopPropagation()
          setConfirmRemoval(true)
        }}
      >
        <span className="pin-visual" aria-hidden="true" />
      </button>
      {confirmRemoval && (
        <div className="inline-confirm inline-confirm--pin" role="alertdialog" aria-label="Remove pin confirmation">
          <span>Pull pin?</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setConfirmRemoval(false)
              onRemove()
            }}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setConfirmRemoval(false)
            }}
          >
            No
          </button>
        </div>
      )}
    </div>
  )
}
