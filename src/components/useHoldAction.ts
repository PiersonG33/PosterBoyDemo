import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'

interface HoldActionOptions {
  disabled: boolean
  duration: number
  onComplete: () => void
}

export function useHoldAction({ disabled, duration, onComplete }: HoldActionOptions) {
  const [isHolding, setIsHolding] = useState(false)
  const timerRef = useRef<number | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const disabledRef = useRef(disabled)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const cancel = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    pointerIdRef.current = null
    targetRef.current = null
    setIsHolding(false)
  }, [])

  const begin = useCallback(() => {
    if (disabledRef.current || timerRef.current !== null) return
    setIsHolding(true)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      pointerIdRef.current = null
      targetRef.current = null
      setIsHolding(false)
      if (!disabledRef.current) onCompleteRef.current()
    }, duration)
  }, [duration])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  useEffect(() => {
    if (!isHolding) return

    const cancelPointer = (event: globalThis.PointerEvent) => {
      if (pointerIdRef.current === event.pointerId) cancel()
    }
    const cancelOutsideTarget = (event: globalThis.PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId || !targetRef.current) return
      const bounds = targetRef.current.getBoundingClientRect()
      if (
        event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom
      ) {
        cancel()
      }
    }

    window.addEventListener('pointerup', cancelPointer)
    window.addEventListener('pointercancel', cancelPointer)
    window.addEventListener('pointermove', cancelOutsideTarget)
    return () => {
      window.removeEventListener('pointerup', cancelPointer)
      window.removeEventListener('pointercancel', cancelPointer)
      window.removeEventListener('pointermove', cancelOutsideTarget)
    }
  }, [cancel, isHolding])

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    pointerIdRef.current = event.pointerId
    targetRef.current = event.currentTarget
    begin()
  }

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (pointerIdRef.current === event.pointerId) cancel()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled || event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return
    event.preventDefault()
    begin()
  }

  const onKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === ' ' || event.key === 'Enter') cancel()
  }

  return {
    isHolding,
    onPointerDown,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onKeyDown,
    onKeyUp,
  }
}
