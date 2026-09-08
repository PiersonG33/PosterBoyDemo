import { useEffect, useState, type CSSProperties, type MouseEvent } from 'react'
import type { BoardNote } from '../types'
import { DrawingNote } from './DrawingNote'

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
}

export function StickyNote({
  note,
  stackIndex,
  isPending,
  removalLocked,
  isPinned,
  onRemove,
}: StickyNoteProps) {
  const [confirmRemoval, setConfirmRemoval] = useState(false)

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

  const style: NoteStyle = {
    '--note-x': `${note.boardX * 100}%`,
    '--note-y': `${note.boardY * 100}%`,
    '--note-rotation': `${note.rotation}deg`,
    zIndex: stackIndex + 1,
  }

  const handleNoteClick = (event: MouseEvent<HTMLElement>) => {
    if (isPending || removalLocked || isPinned) return
    const target = event.target as Element
    if (target === event.currentTarget || !target.closest('button')) setConfirmRemoval(true)
  }

  return (
    <article
      className={`sticky-shell ${note.removedAt ? 'sticky-shell--removed' : ''} ${!removalLocked && !isPinned ? 'sticky-shell--removable' : ''}`}
      style={style}
      aria-label={`${note.contentType} note${isPinned ? ', pinned' : ', unpinned'}`}
      onClick={handleNoteClick}
    >
      <div className={`sticky sticky--${note.color} ${note.contentType === 'drawing' ? 'sticky--drawing' : ''}`}>
        <div className="sticky__content">
          {note.contentType === 'text' ? (
            <p>{note.textContent}</p>
          ) : (
            <DrawingNote drawing={note.drawingData} />
          )}
        </div>

        {confirmRemoval && !isPinned && (
          <div className="inline-confirm inline-confirm--note" role="alertdialog" aria-label="Remove note confirmation">
            <span>Take this down?</span>
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
    </article>
  )
}
