// CUSTOM WORD BOMB — shared local/online countdown display.

import { useEffect, useRef, useState, type CSSProperties } from 'react'

interface BombTimerProps {
  durationSeconds: number
  deadlineMs?: number
  skullMode: boolean
  token: number
  onExpire: (token: number) => void
  onTick: (urgent: boolean) => void
}

export function BombTimer({
  durationSeconds,
  deadlineMs,
  skullMode,
  token,
  onExpire,
  onTick,
}: BombTimerProps) {
  const [remainingMs, setRemainingMs] = useState(durationSeconds * 1_000)
  const deadlineRef = useRef(0)
  const expiredRef = useRef(false)
  const lastSecondRef = useRef(Math.ceil(durationSeconds))
  const expireCallbackRef = useRef(onExpire)
  const tickCallbackRef = useRef(onTick)

  useEffect(() => {
    expireCallbackRef.current = onExpire
  }, [onExpire])

  useEffect(() => {
    tickCallbackRef.current = onTick
  }, [onTick])

  useEffect(() => {
    const now = deadlineMs === undefined ? performance.now() : Date.now()
    deadlineRef.current = deadlineMs ?? now + durationSeconds * 1_000
    expiredRef.current = false
    lastSecondRef.current = Math.ceil(durationSeconds)

    const interval = window.setInterval(() => {
      const currentTime = deadlineMs === undefined ? performance.now() : Date.now()
      const nextRemaining = Math.max(0, deadlineRef.current - currentTime)
      setRemainingMs(nextRemaining)

      const nextSecond = Math.ceil(nextRemaining / 1_000)
      if (nextSecond < lastSecondRef.current && nextSecond > 0) {
        lastSecondRef.current = nextSecond
        tickCallbackRef.current(skullMode || nextRemaining < 3_500)
      }

      if (nextRemaining === 0 && !expiredRef.current) {
        expiredRef.current = true
        window.clearInterval(interval)
        expireCallbackRef.current(token)
      }
    }, 50)

    return () => window.clearInterval(interval)
  }, [deadlineMs, durationSeconds, skullMode, token])

  const fraction = Math.max(0, remainingMs / (durationSeconds * 1_000))
  const timerStyle = { '--wb-time-left': `${fraction * 100}%` } as CSSProperties

  return (
    <div className="wb-timer" style={timerStyle} aria-label={`${(remainingMs / 1_000).toFixed(1)} seconds left`}>
      <span>{(remainingMs / 1_000).toFixed(1)}</span>
      <div className="wb-timer__track" aria-hidden="true"><i /></div>
    </div>
  )
}
