import type { CSSProperties } from 'react'
import type { BoardNote } from '../types'
import { DrawingNote } from './DrawingNote'

interface StickyNoteProps {
  note: BoardNote
  isPending: boolean
  onAddPin: () => void
  onRemovePin: () => void
  onRemove: () => void
}

type NoteStyle = CSSProperties & {
  '--note-x': string
  '--note-y': string
  '--note-rotation': string
}

export function StickyNote({
  note,
  isPending,
  onAddPin,
  onRemovePin,
  onRemove,
}: StickyNoteProps) {
  const style: NoteStyle = {
    '--note-x': `${note.boardX * 100}%`,
    '--note-y': `${note.boardY * 100}%`,
    '--note-rotation': `${note.rotation}deg`,
    zIndex: Math.round(note.boardY * 100) + 1,
  }

  return (
    <article
      className={`sticky-shell ${note.removedAt ? 'sticky-shell--removed' : ''}`}
      style={style}
      aria-label={`${note.contentType} note with ${note.pinCount} pins`}
    >
      <div className={`sticky sticky--${note.color}`}>
        <div className="pushpin" aria-hidden="true">
          <span />
        </div>
        {note.pinCount > 0 && <span className="pin-count" title={`${note.pinCount} pins`}>{note.pinCount}</span>}

        <div className="sticky__content">
          {note.contentType === 'text' ? (
            <p>{note.textContent}</p>
          ) : (
            <DrawingNote drawing={note.drawingData} />
          )}
        </div>

        <div className="sticky__actions">
          <button type="button" onClick={onAddPin} disabled={isPending} aria-label="Add a pin">
            <span aria-hidden="true">＋</span> Pin
          </button>
          <button
            type="button"
            onClick={onRemovePin}
            disabled={isPending || note.pinCount === 0}
            aria-label="Remove a pin"
          >
            <span aria-hidden="true">−</span> Pin
          </button>
          <button
            className="sticky__remove"
            type="button"
            onClick={onRemove}
            disabled={isPending || note.pinCount > 0}
            title={note.pinCount > 0 ? 'Remove every pin first' : 'Take down this note'}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  )
}
