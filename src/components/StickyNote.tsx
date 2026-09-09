import type { CSSProperties } from 'react'
import { NOTE_REMOVAL_HOLD_MS } from '../constants'
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
  '--hold-duration': string
}

export function StickyNote({
  note,
  stackIndex,
  isPending,
  removalLocked,
  isPinned,
  onRemove,
}: StickyNoteProps) {
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
    '--hold-duration': `${NOTE_REMOVAL_HOLD_MS}ms`,
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
            <p>{note.textContent}</p>
          ) : (
            <DrawingNote drawing={note.drawingData} />
          )}
        </div>

        {hold.isHolding && (
          <svg className="note-hold-trace" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="1" y="1" width="98" height="98" rx="0.5" />
          </svg>
        )}
      </div>
    </article>
  )
}
