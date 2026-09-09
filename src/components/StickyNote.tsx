import type { CSSProperties } from 'react'
import { NOTE_REMOVAL_HOLD_MS } from '../constants'
import { getTextDensityClass } from '../textSizing'
import type { BoardNote } from '../types'
import { DrawingNote } from './DrawingNote'
import { useHoldAction } from './useHoldAction'

interface StickyNoteProps {
  note: BoardNote
  stackIndex: number
  isPending: boolean
  removalLocked: boolean
  isPinned: boolean
  onRemove: () => void
}

type NoteStyle = CSSProperties & {
  '--note-x': string
  '--note-y': string
  '--note-rotation': string
  '--trace-segment-duration': string
  '--trace-second-segment-delay': string
  '--trace-third-segment-delay': string
  '--trace-fourth-segment-delay': string
}

export function StickyNote({
  note,
  stackIndex,
  isPending,
  removalLocked,
  isPinned,
  onRemove,
}: StickyNoteProps) {
  const traceSegmentDuration = (NOTE_REMOVAL_HOLD_MS - 40) / 4
  const removalDisabled = isPending || removalLocked || isPinned || note.removedAt !== null
  const hold = useHoldAction({
    disabled: removalDisabled,
    duration: NOTE_REMOVAL_HOLD_MS,
    onComplete: onRemove,
  })

  const style: NoteStyle = {
    '--note-x': `${note.boardX * 100}%`,
    '--note-y': `${note.boardY * 100}%`,
    '--note-rotation': `${note.rotation}deg`,
    '--trace-segment-duration': `${traceSegmentDuration}ms`,
    '--trace-second-segment-delay': `${traceSegmentDuration}ms`,
    '--trace-third-segment-delay': `${traceSegmentDuration * 2}ms`,
    '--trace-fourth-segment-delay': `${traceSegmentDuration * 3}ms`,
    zIndex: stackIndex + 1,
  }

  return (
    <article
      className={`sticky-shell ${note.removedAt ? 'sticky-shell--removed' : ''} ${!removalDisabled ? 'sticky-shell--removable' : ''} ${hold.isHolding ? 'sticky-shell--holding' : ''}`}
      style={style}
      role={!removalDisabled ? 'button' : undefined}
      tabIndex={!removalDisabled ? 0 : undefined}
      aria-label={`${note.contentType} note${isPinned ? ', pinned' : ', unpinned'}${!removalDisabled ? hold.isHolding ? ', keep holding to remove' : ', press and hold to remove' : ''}`}
      title={isPinned ? 'Pull every pin before taking this note down' : !removalDisabled ? 'Hold to take down note' : undefined}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onPointerLeave={hold.onPointerLeave}
      onKeyDown={hold.onKeyDown}
      onKeyUp={hold.onKeyUp}
      onContextMenu={(event) => {
        if (!removalDisabled) event.preventDefault()
      }}
    >
      <div className={`sticky sticky--${note.color} ${note.contentType === 'drawing' ? 'sticky--drawing' : ''}`}>
        <div className="sticky__content">
          {note.contentType === 'text' ? (
            <p className={getTextDensityClass(note.textContent.length)}>{note.textContent}</p>
          ) : (
            <DrawingNote drawing={note.drawingData} />
          )}
        </div>

        {hold.isHolding && (
          <span className="note-hold-trace" aria-hidden="true">
            <i className="note-hold-trace__segment note-hold-trace__segment--top" />
            <i className="note-hold-trace__segment note-hold-trace__segment--right" />
            <i className="note-hold-trace__segment note-hold-trace__segment--bottom" />
            <i className="note-hold-trace__segment note-hold-trace__segment--left" />
          </span>
        )}
      </div>
    </article>
  )
}
