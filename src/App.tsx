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
  const [isPinning, setIsPinning] = useState(false)
  const [selection, setSelection] = useState<PlacementSelection | null>(null)

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(clearMessage, 4_500)
    return () => window.clearTimeout(timeout)
  }, [clearMessage, message])

  useEffect(() => {
    if (!isPlacing && !isPinning && !selection) return
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPosting) {
        setIsPlacing(false)
        setIsPinning(false)
        setSelection(null)
      }
    }
    window.addEventListener('keydown', cancelWithEscape)
    return () => window.removeEventListener('keydown', cancelWithEscape)
  }, [isPinning, isPlacing, isPosting, selection])

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
            className={`tool-button pin-tool ${isPinning ? 'is-active' : ''}`}
            type="button"
            onClick={() => {
              setIsPlacing(false)
              setIsPinning((active) => !active)
            }}
            disabled={remaining === 0 || isPosting || Boolean(selection)}
            aria-label={isPinning ? 'Cancel placing a pin' : 'Place a pin'}
            title={isPinning ? 'Cancel placing a pin' : 'Place a pin'}
          >
            <span className="tool-pin-visual" aria-hidden="true" />
          </button>
          <button
            className={`tool-button add-button ${isPlacing || selection ? 'is-active' : ''}`}
            type="button"
            onClick={() => {
              if (isPlacing || selection) {
                setIsPlacing(false)
                setSelection(null)
              } else {
                setIsPinning(false)
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
        pins={snapshot.pins}
        pendingNoteId={pendingNoteId}
        isPlacing={isPlacing}
        isPinning={isPinning}
        selection={selection}
        onPlace={(nextSelection) => {
          setIsPlacing(false)
          setSelection(nextSelection)
        }}
        onPlacePin={(position) => {
          void addPin(position).then((didAdd) => {
            if (didAdd) setIsPinning(false)
          })
        }}
        onRemovePin={(pinId) => void removePin(pinId)}
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
