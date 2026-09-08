import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPlacement } from './board/createPlacement'
import { useBoard } from './board/useBoard'
import { ActionMeter } from './components/ActionMeter'
import { Corkboard } from './components/Corkboard'
import { NoteComposer } from './components/NoteComposer'
import type { DrawingData } from './types'

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
  const [composerOpen, setComposerOpen] = useState(false)

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(clearMessage, 4_500)
    return () => window.clearTimeout(timeout)
  }, [clearMessage, message])

  const activeNotes = useMemo(
    () => snapshot?.notes.filter((note) => note.removedAt === null) ?? [],
    [snapshot?.notes],
  )
  const placement = useCallback(
    () => createPlacement(activeNotes.length),
    [activeNotes.length],
  )

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
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Poster Boy home">
          <span>POSTER</span>
          <span>BOY</span>
        </a>
        <div className="site-header__thought">
          <span className="live-dot" />
          One board. Everyone’s hands.
        </div>
        <ActionMeter budget={snapshot.budget} />
      </header>

      <section className="intro" id="top">
        <div>
          <span className="eyebrow">The internet’s corkboard</span>
          <h1>Put something<br /><em>out there.</em></h1>
        </div>
        <div className="intro__copy">
          <p>Leave a thought. Draw a thing. Pin what deserves to stay—or pull down what doesn’t.</p>
          <button className="primary-button" type="button" onClick={() => setComposerOpen(true)} disabled={remaining === 0}>
            <span className="primary-button__plus">＋</span>
            Add a note
            <span className="primary-button__cost">1 action</span>
          </button>
        </div>
      </section>

      <Corkboard
        notes={snapshot.notes}
        pendingNoteId={pendingNoteId}
        onAddPin={(id) => void addPin(id)}
        onRemovePin={(id) => void removePin(id)}
        onRemoveNote={(id) => void removeNote(id)}
      />

      <section className="how-it-works" aria-labelledby="how-heading">
        <div>
          <span className="eyebrow">The rules are simple</span>
          <h2 id="how-heading">A shared space only works if everyone can change it.</h2>
        </div>
        <ol>
          <li><span>01</span><strong>Make something</strong><p>Write a note or sketch a drawing.</p></li>
          <li><span>02</span><strong>Protect what matters</strong><p>Every pin makes a note harder to remove.</p></li>
          <li><span>03</span><strong>Shape the board</strong><p>Unpinned notes can be taken down by anyone.</p></li>
        </ol>
      </section>

      <footer>
        <div className="wordmark wordmark--footer"><span>POSTER</span><span>BOY</span></div>
        <p>An experiment in shared space.</p>
        <span>LOCAL PROTOTYPE · 2026</span>
      </footer>

      <button
        className="floating-add"
        type="button"
        onClick={() => setComposerOpen(true)}
        disabled={remaining === 0}
        aria-label="Add a note"
      >
        ＋
      </button>

      <NoteComposer
        isOpen={composerOpen}
        isPosting={isPosting}
        actionsRemaining={remaining}
        onClose={() => setComposerOpen(false)}
        onPostText={(text) => createText(text, placement())}
        onPostDrawing={(drawing: DrawingData) => createDrawing(drawing, placement())}
      />

      {message && (
        <div className="toast" role="status">
          <span>!</span>{message}
          <button type="button" onClick={clearMessage} aria-label="Dismiss message">×</button>
        </div>
      )}
    </div>
  )
}
