import { useEffect, useState } from 'react'
import { MAX_TEXT_LENGTH } from '../constants'
import type { DrawingData } from '../types'
import { DrawingEditor } from './DrawingEditor'

interface NoteComposerProps {
  isOpen: boolean
  isPosting: boolean
  actionsRemaining: number
  onClose: () => void
  onPostText: (text: string) => Promise<boolean>
  onPostDrawing: (drawing: DrawingData) => Promise<boolean>
}

type ComposerMode = 'text' | 'drawing'

export function NoteComposer({
  isOpen,
  isPosting,
  actionsRemaining,
  onClose,
  onPostText,
  onPostDrawing,
}: NoteComposerProps) {
  const [mode, setMode] = useState<ComposerMode>('text')
  const [text, setText] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPosting) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [isOpen, isPosting, onClose])

  if (!isOpen) return null

  const submitText = async (event: React.FormEvent) => {
    event.preventDefault()
    const didPost = await onPostText(text)
    if (didPost) {
      setText('')
      onClose()
    }
  }

  const submitDrawing = async (drawing: DrawingData) => {
    const didPost = await onPostDrawing(drawing)
    if (didPost) onClose()
  }

  return (
    <div className="composer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isPosting) onClose()
    }}>
      <section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
        <div className="composer__heading">
          <div>
            <span className="eyebrow">Spend one action</span>
            <h2 id="composer-title">Leave your mark</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} disabled={isPosting} aria-label="Close composer">×</button>
        </div>

        <div className="composer__tabs" role="tablist" aria-label="Note type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={mode === 'text' ? 'is-active' : ''}
            onClick={() => setMode('text')}
          >
            <span aria-hidden="true">Aa</span> Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'drawing'}
            className={mode === 'drawing' ? 'is-active' : ''}
            onClick={() => setMode('drawing')}
          >
            <span aria-hidden="true">⌁</span> Drawing
          </button>
        </div>

        {mode === 'text' ? (
          <form className="text-composer" onSubmit={submitText}>
            <div className="composer-paper">
              <textarea
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="What do you want to put out into the world?"
                maxLength={MAX_TEXT_LENGTH}
                disabled={isPosting}
              />
              <span>{text.length} / {MAX_TEXT_LENGTH}</span>
            </div>
            <button className="post-button" type="submit" disabled={isPosting || !text.trim() || actionsRemaining === 0}>
              {isPosting ? 'Posting…' : 'Post to the board'} <span aria-hidden="true">↗</span>
            </button>
          </form>
        ) : (
          <DrawingEditor disabled={isPosting || actionsRemaining === 0} onPost={submitDrawing} />
        )}

        <p className="composer__balance"><span>{actionsRemaining}</span> actions remaining after this: {Math.max(0, actionsRemaining - 1)}</p>
      </section>
    </div>
  )
}
