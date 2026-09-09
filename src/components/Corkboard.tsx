import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { calculatePlacement } from '../board/calculatePlacement'
import { isPinPositionAvailable, noteHasPins, pinTouchesNote } from '../board/pinPlacement'
import { BOARD_WIDTH, REFERENCE_NOTE_SIZE } from '../constants'
import type { BoardNote, BoardPin, PinPosition, PlacementSelection } from '../types'
import { PositionedPin } from './PositionedPin'
import { StickyNote } from './StickyNote'

interface CorkboardProps {
  notes: BoardNote[]
  pins: BoardPin[]
  pendingNoteId: string | null
  isPlacing: boolean
  isPinning: boolean
  noteSize: number
  noteRotation: number
  useCurvedPeel: boolean
  selection: PlacementSelection | null
  onPlace: (selection: PlacementSelection) => void
  onPlacePin: (position: PinPosition) => void
  onRemovePin: (pinId: string) => void
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

type BoardStyle = CSSProperties & {
  '--note-size': string
  '--ghost-rotation': string
  '--pin-button-size': string
  '--pin-button-height': string
  '--pin-button-offset': string
  '--pin-visual-size': string
  '--pin-visual-offset': string
  '--pin-tail-width': string
  '--pin-tail-height': string
  '--pin-hover-lift': string
}

export function Corkboard({
  notes,
  pins,
  pendingNoteId,
  isPlacing,
  isPinning,
  noteSize,
  noteRotation,
  useCurvedPeel,
  selection,
  onPlace,
  onPlacePin,
  onRemovePin,
  onRemoveNote,
  children,
}: CorkboardProps) {
  const boardRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [ghostPosition, setGhostPosition] = useState<{ x: number; y: number } | null>(null)
  const [ghostPin, setGhostPin] = useState<(PinPosition & { available: boolean }) | null>(null)
  const activeCount = notes.filter((note) => note.removedAt === null).length
  const orderedNotes = notes
    .map((note, originalIndex) => ({ note, originalIndex }))
    .sort((a, b) => {
      const dateDifference = Date.parse(a.note.createdAt) - Date.parse(b.note.createdAt)
      return dateDifference || a.originalIndex - b.originalIndex
    })

  const focusStyle: FocusStyle = selection ? {
    '--focus-x': `${selection.focusX * 100}%`,
    '--focus-y': `${selection.focusY * 100}%`,
    '--focus-offset-x': `${selection.offsetX}px`,
    '--focus-offset-y': `${selection.offsetY}px`,
    '--focus-scale': selection.scale,
  } : {}
  const pinScale = noteSize / REFERENCE_NOTE_SIZE
  const pinLength = (referencePixels: number) => (
    `${referencePixels * pinScale / BOARD_WIDTH * 100}cqw`
  )
  const boardStyle: BoardStyle = {
    '--note-size': `${noteSize / BOARD_WIDTH * 100}%`,
    '--ghost-rotation': `${noteRotation}deg`,
    '--pin-button-size': pinLength(36),
    '--pin-button-height': pinLength(38),
    '--pin-button-offset': pinLength(-18),
    '--pin-visual-size': pinLength(20),
    '--pin-visual-offset': pinLength(8),
    '--pin-tail-width': pinLength(4),
    '--pin-tail-height': pinLength(10),
    '--pin-hover-lift': pinLength(-2),
  }

  const updateGhost = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (isPlacing) {
      setGhostPosition({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
    }
    if (isPinning) {
      const target = event.target as Element
      const overNote = Boolean(target.closest('.sticky-shell'))
      const position = {
        x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
        y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
      }
      const touchesNote = notes.some((note) => pinTouchesNote(position, note, noteSize))
      setGhostPin({
        ...position,
        available: overNote && touchesNote && isPinPositionAvailable(pins, position),
      })
    }
  }

  const handleBoardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isPinning) {
      if (ghostPin?.available) onPlacePin(ghostPin)
      return
    }
    if (!isPlacing || !boardRef.current || !viewportRef.current) return
    const boardBounds = boardRef.current.getBoundingClientRect()
    const viewportBounds = viewportRef.current.getBoundingClientRect()
    const renderedNoteSize = boardBounds.width * noteSize / BOARD_WIDTH
    onPlace(calculatePlacement({
      board: boardBounds,
      viewport: viewportBounds,
      clientX: event.clientX,
      clientY: event.clientY,
      noteSize: renderedNoteSize,
      rotation: noteRotation,
    }))
    setGhostPosition(null)
  }

  return (
    <main className={`board-wrap ${isPlacing ? 'board-wrap--placing' : ''} ${isPinning ? 'board-wrap--pinning' : ''} ${selection ? 'board-wrap--editing' : ''}`} id="top">
      <div className="board-viewport" ref={viewportRef}>
        <div className="board-frame" style={focusStyle}>
          <section
            ref={boardRef}
            className="corkboard"
            style={boardStyle}
            aria-label={`Shared corkboard with ${activeCount} notes`}
            onPointerMove={updateGhost}
            onPointerEnter={updateGhost}
            onPointerLeave={() => {
              setGhostPosition(null)
              setGhostPin(null)
            }}
            onClick={handleBoardClick}
          >
            {orderedNotes.map(({ note }, stackIndex) => (
              <StickyNote
                key={note.id}
                note={note}
                stackIndex={stackIndex}
                isPending={pendingNoteId === note.id}
                removalLocked={isPinning || isPlacing || Boolean(selection)}
                isPinned={noteHasPins(note, pins, noteSize)}
                useCurvedPeel={useCurvedPeel}
                onRemove={() => onRemoveNote(note.id)}
              />
            ))}
            {isPlacing && ghostPosition && (
              <div
                className="ghost-note sticky--butter"
                style={{ left: ghostPosition.x, top: ghostPosition.y }}
                aria-hidden="true"
              >
                <span>Place note</span>
              </div>
            )}
            {children}
            {pins.map((pin) => (
              <PositionedPin
                key={pin.id}
                pin={pin}
                disabled={isPinning || isPlacing || Boolean(selection)}
                onRemove={() => onRemovePin(pin.id)}
              />
            ))}
            {isPinning && ghostPin && (
              <span
                className={`ghost-pin ghost-pin--board ${ghostPin.available ? '' : 'ghost-pin--blocked'}`}
                style={{ left: `${ghostPin.x * 100}%`, top: `${ghostPin.y * 100}%` }}
                aria-hidden="true"
              />
            )}
          </section>
        </div>
      </div>
      {(isPlacing || isPinning) && (
        <div className="placement-hint" role="status">
          {isPlacing ? 'Move over the board and click to place your note' : 'Move over a note and click to place the pin'}
          <span>Esc to cancel</span>
        </div>
      )}
    </main>
  )
}
