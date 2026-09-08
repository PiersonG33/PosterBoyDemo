import { useCallback, useEffect, useRef, useState } from 'react'
import { MAX_DRAWING_POINTS, MAX_POINTS_PER_STROKE } from '../constants'
import type { DrawingData, DrawingPoint, DrawingStroke } from '../types'

interface DrawingEditorProps {
  disabled?: boolean
  onPost: (drawing: DrawingData) => void
}

const CANVAS_SIZE = 320
const PEN_WIDTH = 4

export function DrawingEditor({ disabled = false, onPost }: DrawingEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeStroke = useRef<DrawingStroke | null>(null)
  const [strokes, setStrokes] = useState<DrawingStroke[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [previewVersion, setPreviewVersion] = useState(0)

  const totalPoints = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const scale = window.devicePixelRatio || 1
    canvas.width = CANVAS_SIZE * scale
    canvas.height = CANVAS_SIZE * scale
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    context.strokeStyle = '#29241f'
    context.fillStyle = '#29241f'
    context.lineCap = 'round'
    context.lineJoin = 'round'

    const drawStroke = (stroke: DrawingStroke) => {
      if (stroke.points.length === 1) {
        const [x, y] = stroke.points[0]
        context.beginPath()
        context.arc(x * CANVAS_SIZE, y * CANVAS_SIZE, stroke.width / 2, 0, Math.PI * 2)
        context.fill()
        return
      }
      context.lineWidth = stroke.width
      context.beginPath()
      stroke.points.forEach(([x, y], index) => {
        const pixelX = x * CANVAS_SIZE
        const pixelY = y * CANVAS_SIZE
        if (index === 0) context.moveTo(pixelX, pixelY)
        else context.lineTo(pixelX, pixelY)
      })
      context.stroke()
    }

    strokes.forEach(drawStroke)
    if (activeStroke.current) drawStroke(activeStroke.current)
  }, [strokes])

  useEffect(() => {
    redraw()
  }, [redraw, previewVersion])

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return [
      Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    ]
  }

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || totalPoints >= MAX_DRAWING_POINTS) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activeStroke.current = { width: PEN_WIDTH, points: [getPoint(event)] }
    setIsDrawing(true)
    setPreviewVersion((version) => version + 1)
  }

  const extendStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStroke.current
    if (!stroke || stroke.points.length >= MAX_POINTS_PER_STROKE) return
    const point = getPoint(event)
    const previous = stroke.points.at(-1)
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.004) {
      stroke.points.push(point)
      setPreviewVersion((version) => version + 1)
    }
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const completedStroke = activeStroke.current
    if (!completedStroke) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setStrokes((existing) => [...existing, completedStroke])
    activeStroke.current = null
    setIsDrawing(false)
  }

  const clear = () => {
    activeStroke.current = null
    setStrokes([])
    setIsDrawing(false)
  }

  return (
    <div className="drawing-editor">
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onPointerDown={beginStroke}
          onPointerMove={extendStroke}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          aria-label="Drawing canvas"
        />
        {strokes.length === 0 && !isDrawing && (
          <span className="canvas-hint" aria-hidden="true">Draw here</span>
        )}
      </div>
      <div className="drawing-toolbar">
        <span className="pen-label"><i aria-hidden="true" /> Black pen</span>
        <div>
          <button type="button" onClick={() => setStrokes((existing) => existing.slice(0, -1))} disabled={strokes.length === 0 || disabled}>Undo</button>
          <button type="button" onClick={clear} disabled={strokes.length === 0 || disabled}>Clear</button>
        </div>
      </div>
      <button
        className="post-button"
        type="button"
        disabled={strokes.length === 0 || disabled}
        onClick={() => onPost({ version: 1, width: CANVAS_SIZE, height: CANVAS_SIZE, strokes })}
      >
        {disabled ? 'Posting…' : 'Stick it up'}
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  )
}
