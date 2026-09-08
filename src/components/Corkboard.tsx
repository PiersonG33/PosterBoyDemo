import type { BoardNote } from '../types'
import { StickyNote } from './StickyNote'

interface CorkboardProps {
  notes: BoardNote[]
  pendingNoteId: string | null
  onAddPin: (noteId: string) => void
  onRemovePin: (noteId: string) => void
  onRemoveNote: (noteId: string) => void
}

export function Corkboard({
  notes,
  pendingNoteId,
  onAddPin,
  onRemovePin,
  onRemoveNote,
}: CorkboardProps) {
  const activeCount = notes.filter((note) => note.removedAt === null).length

  return (
    <main className="board-wrap">
      <div className="board-frame">
        <section className="corkboard" aria-label={`Shared corkboard with ${activeCount} notes`}>
          <div className="board-stamp" aria-hidden="true">PUBLIC BOARD · LIVE</div>
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
        </section>
      </div>
      <p className="board-caption"><span>{activeCount} notes</span> on the board right now</p>
    </main>
  )
}
