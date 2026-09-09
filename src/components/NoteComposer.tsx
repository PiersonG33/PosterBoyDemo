import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { MAX_TEXT_LENGTH, NOTE_COLORS } from '../constants'
import { getTextDensityClass } from '../textSizing'
import type { DrawingData, NoteColor, NotePlacement } from '../types'
import { DrawingEditor } from './DrawingEditor'

interface NoteComposerProps {
  placement: NotePlacement
  isPosting: boolean
  actionsRemaining: number
  onClose: () => void
  onPostText: (text: string, color: NoteColor) => Promise<boolean>
  onPostDrawing: (drawing: DrawingData, color: NoteColor) => Promise<boolean>
}

type ComposerMode = 'text' | 'drawing'
type DraftStyle = CSSProperties & {
  '--note-x': string
  '--note-y': string
}

const colorLabels: Record<NoteColor, string> = {
  butter: 'Yellow',
  rose: 'Pink',
  mint: 'Green',
  sky: 'Blue',
  lavender: 'Purple',
}

export function NoteComposer({
  placement,
  isPosting,
  actionsRemaining,
  onClose,
  onPostText,
  onPostDrawing,
}: NoteComposerProps) {
  const [mode, setMode] = useState<ComposerMode>('text')
  const [color, setColor] = useState<NoteColor>(placement.color)
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current
    const container = textarea?.parentElement
    if (!textarea || !container) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, container.clientHeight)}px`
  }, [])

  useLayoutEffect(resizeTextarea, [resizeTextarea, text, mode])

  useEffect(() => {
    const container = textareaRef.current?.parentElement
    if (!container || !('ResizeObserver' in window)) return
    const observer = new ResizeObserver(resizeTextarea)
    observer.observe(container)
    return () => observer.disconnect()
  }, [mode, resizeTextarea])

  const style: DraftStyle = {
    '--note-x': `${placement.boardX * 100}%`,
    '--note-y': `${placement.boardY * 100}%`,
  }

  const submitText = (event: FormEvent) => {
    event.preventDefault()
    if (text.trim()) void onPostText(text, color)
  }

  return (
    <article
      className={`draft-note sticky--${color}`}
      style={style}
      role="dialog"
      aria-label="Create note at selected position"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="draft-note__topbar">
        <div className="draft-tabs" role="tablist" aria-label="Note type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'text'}
            className={mode === 'text' ? 'is-active' : ''}
            onClick={() => setMode('text')}
          >
            Aa <span>Text</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'drawing'}
            className={mode === 'drawing' ? 'is-active' : ''}
            onClick={() => setMode('drawing')}
          >
            ⌁ <span>Draw</span>
          </button>
        </div>
        <button
          className="draft-close"
          type="button"
          onClick={onClose}
          disabled={isPosting}
          aria-label="Cancel this note"
        >
          ×
        </button>
      </div>

      {mode === 'text' ? (
        <form className="draft-text" onSubmit={submitText}>
          <div className="draft-text__content">
            <textarea
              ref={textareaRef}
              className={getTextDensityClass(text.length)}
              autoFocus
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Write something…"
              maxLength={MAX_TEXT_LENGTH}
              disabled={isPosting}
              aria-label="Note text"
            />
          </div>
          <span className="draft-character-count">{text.length}/{MAX_TEXT_LENGTH}</span>
          <button
            className="draft-post"
            type="submit"
            disabled={isPosting || !text.trim() || actionsRemaining === 0}
          >
            {isPosting ? 'Posting…' : 'Post'} <span aria-hidden="true">↗</span>
          </button>
        </form>
      ) : (
        <DrawingEditor
          disabled={isPosting || actionsRemaining === 0}
          onPost={(drawing) => void onPostDrawing(drawing, color)}
        />
      )}

      <div className="color-picker" aria-label="Sticky-note color">
        {NOTE_COLORS.map((noteColor) => (
          <button
            key={noteColor}
            className={`color-swatch color-swatch--${noteColor} ${color === noteColor ? 'is-selected' : ''}`}
            type="button"
            onClick={() => setColor(noteColor)}
            aria-label={`${colorLabels[noteColor]} note`}
            aria-pressed={color === noteColor}
          />
        ))}
      </div>
    </article>
  )
}
