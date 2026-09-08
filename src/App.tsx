import { useEffect, useState } from 'react'
import { useBoard } from './board/useBoard'
import { ActionMeter } from './components/ActionMeter'
import { Corkboard } from './components/Corkboard'
import { NoteComposer } from './components/NoteComposer'
import type { DrawingData, NoteColor, PlacementSelection } from './types'

export default function App() {
  const {
    snapshot,
    pendingNoteId,
    isPosting,
    message,
    clearMessage,
    createText,
    createDrawing,
    addPin,
    removePin,
    removeNote,
  } = useBoard()
  const [isPlacing, setIsPlacing] = useState(false)
  const [selection, setSelection] = useState<PlacementSelection | null>(null)

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(clearMessage, 4_500)
    return () => window.clearTimeout(timeout)
  }, [clearMessage, message])

  useEffect(() => {
    if (!isPlacing && !selection) return
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPosting) {
        setIsPlacing(false)
        setSelection(null)
      }
    }
    window.addEventListener('keydown', cancelWithEscape)
    return () => window.removeEventListener('keydown', cancelWithEscape)
  }, [isPlacing, isPosting, selection])

  if (!snapshot) {
    return (
      <main className="loading-screen">
        <div className="loading-pin" />
        <p>Unrolling the corkboard…</p>
      </main>
    )
  }

  const remaining = Math.max(0, snapshot.budget.limit - snapshot.budget.used)

  return (
    <div className={`app-shell ${selection ? 'app-shell--editing' : ''}`}>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Poster Boy home">
          <span>POSTER</span>
          <span>BOY</span>
        </a>
        <div className="header-actions">
          <ActionMeter budget={snapshot.budget} />
          <button
            className={`add-button ${isPlacing ? 'add-button--cancel' : ''}`}
            type="button"
            onClick={() => {
              if (isPlacing || selection) {
                setIsPlacing(false)
                setSelection(null)
              } else {
                setIsPlacing(true)
              }
            }}
            disabled={remaining === 0 || isPosting}
            aria-label={isPlacing || selection ? 'Cancel adding a note' : 'Add a note'}
            title={isPlacing || selection ? 'Cancel' : 'Add a note'}
          >
            {isPlacing || selection ? '×' : '+'}
          </button>
        </div>
      </header>

      <Corkboard
        notes={snapshot.notes}
        pendingNoteId={pendingNoteId}
        isPlacing={isPlacing}
        selection={selection}
        onPlace={(nextSelection) => {
          setIsPlacing(false)
          setSelection(nextSelection)
        }}
        onAddPin={(id) => void addPin(id)}
        onRemovePin={(id) => void removePin(id)}
        onRemoveNote={(id) => void removeNote(id)}
      >
        {selection && (
          <NoteComposer
            placement={selection.placement}
            isPosting={isPosting}
            actionsRemaining={remaining}
            onClose={() => setSelection(null)}
            onPostText={async (text: string, color: NoteColor) => {
              const posted = await createText(text, { ...selection.placement, color })
              if (posted) setSelection(null)
              return posted
            }}
            onPostDrawing={async (drawing: DrawingData, color: NoteColor) => {
              const posted = await createDrawing(drawing, { ...selection.placement, color })
              if (posted) setSelection(null)
              return posted
            }}
          />
        )}
      </Corkboard>

      {message && (
        <div className="toast" role="status">
          <span>!</span>{message}
          <button type="button" onClick={clearMessage} aria-label="Dismiss message">×</button>
        </div>
      )}
    </div>
  )
}
