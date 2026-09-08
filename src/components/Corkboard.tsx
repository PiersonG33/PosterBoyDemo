import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { calculatePlacement } from '../board/calculatePlacement'
import type { BoardNote, PlacementSelection } from '../types'
import { StickyNote } from './StickyNote'

interface CorkboardProps {
  notes: BoardNote[]
  pendingNoteId: string | null
  isPlacing: boolean
  selection: PlacementSelection | null
  onPlace: (selection: PlacementSelection) => void
  onAddPin: (noteId: string) => void
  onRemovePin: (noteId: string) => void
  onRemoveNote: (noteId: string) => void
  children?: ReactNode
}

type FocusStyle = CSSProperties & {
  '--focus-x'?: string
  '--focus-y'?: string
  '--focus-offset-x'?: string
  '--focus-offset-y'?: string
  '--focus-scale'?: number
}

export function Corkboard({
  notes,
  pendingNoteId,
  isPlacing,
  selection,
  onPlace,
  onAddPin,
  onRemovePin,
  onRemoveNote,
  children,
}: CorkboardProps) {
  const boardRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null)
  const activeCount = notes.filter((note) => note.removedAt === null).length

  const focusStyle: FocusStyle = selection ? {
    '--focus-x': `${selection.focusX * 100}%`,
    '--focus-y': `${selection.focusY * 100}%`,
    '--focus-offset-x': `${selection.offsetX}px`,
    '--focus-offset-y': `${selection.offsetY}px`,
    '--focus-scale': selection.scale,
  } : {}

  const updateGhost = (event: React.PointerEvent<HTMLElement>) => {
    if (!isPlacing) return
    const bounds = event.currentTarget.getBoundingClientRect()
    setGhostPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }

  const placeNote = (event: React.MouseEvent<HTMLElement>) => {
    if (!isPlacing || !boardRef.current || !viewportRef.current) return
    const boardBounds = boardRef.current.getBoundingClientRect()
    const viewportBounds = viewportRef.current.getBoundingClientRect()
    const noteSize = Number.parseFloat(
      getComputedStyle(boardRef.current).getPropertyValue('--note-size'),
    ) || 218
    onPlace(calculatePlacement({
      board: boardBounds,
      viewport: viewportBounds,
      clientX: event.clientX,
      clientY: event.clientY,
      noteSize,
    }))
    setGhostPosition(null)
  }

  return (
    <main className={`board-wrap ${isPlacing ? 'board-wrap--placing' : ''} ${selection ? 'board-wrap--editing' : ''}`} id="top">
      <div className="board-viewport" ref={viewportRef}>
        <div className="board-frame" style={focusStyle}>
          <section
            ref={boardRef}
            className="corkboard"
            aria-label={`Shared corkboard with ${activeCount} notes`}
            onPointerMove={updateGhost}
            onPointerEnter={updateGhost}
            onPointerLeave={() => setGhostPosition(null)}
            onClick={placeNote}
          >
            {notes.map((note) => (
              <StickyNote
                key={note.id}
                note={note}
                isPending={pendingNoteId === note.id}
                onAddPin={() => onAddPin(note.id)}
                onRemovePin={() => onRemovePin(note.id)}
                onRemove={() => onRemoveNote(note.id)}
              />
            ))}
            {isPlacing && ghostPosition && (
              <div
                className="ghost-note sticky--butter"
                style={{ left: ghostPosition.x, top: ghostPosition.y }}
                aria-hidden="true"
              >
                <div className="pushpin"><span /></div>
                <span>Place note</span>
              </div>
            )}
            {children}
          </section>
        </div>
      </div>
      {isPlacing && (
        <div className="placement-hint" role="status">
          Move over the board and click to place your note
          <span>Esc to cancel</span>
        </div>
      )}
    </main>
  )
}
