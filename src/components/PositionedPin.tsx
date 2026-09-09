import type { CSSProperties } from 'react'
import { PIN_REMOVAL_HOLD_MS } from '../constants'
import type { BoardPin } from '../types'
import { useHoldAction } from './useHoldAction'

interface PositionedPinProps {
  pin: BoardPin
  disabled: boolean
  onRemove: () => void
}

export function PositionedPin({ pin, disabled, onRemove }: PositionedPinProps) {
  const hold = useHoldAction({ disabled, duration: PIN_REMOVAL_HOLD_MS, onComplete: onRemove })
  const style = {
    left: `${pin.x * 100}%`,
    top: `${pin.y * 100}%`,
    '--hold-duration': `${PIN_REMOVAL_HOLD_MS}ms`,
  } as CSSProperties

  return (
    <div className="placed-pin" style={style}>
      <button
        className={`pin-button ${hold.isHolding ? 'pin-button--holding' : ''}`}
        type="button"
        disabled={disabled}
        aria-label={hold.isHolding ? 'Keep holding to remove this pin' : 'Press and hold to remove this pin'}
        title="Hold to pull pin"
        onPointerDown={(event) => {
          event.stopPropagation()
          hold.onPointerDown(event)
        }}
        onPointerUp={hold.onPointerUp}
        onPointerCancel={hold.onPointerCancel}
        onPointerLeave={hold.onPointerLeave}
        onKeyDown={hold.onKeyDown}
        onKeyUp={hold.onKeyUp}
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
        }}
      >
        <span className="pin-visual" aria-hidden="true" />
        <svg className="pin-hold-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle cx="18" cy="18" r="15" />
        </svg>
      </button>
    </div>
  )
}
