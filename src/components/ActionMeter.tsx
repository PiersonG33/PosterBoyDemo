import { useEffect, useState } from 'react'
import type { ActionBudget } from '../types'

interface ActionMeterProps {
  budget: ActionBudget
}

const getSecondsRemaining = (date: string) =>
  Math.max(0, Math.ceil((Date.parse(date) - Date.now()) / 1_000))

const formatTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function ActionMeter({ budget }: ActionMeterProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((tick) => tick + 1)
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [budget.windowEndsAt])

  const remaining = Math.max(0, budget.limit - budget.used)
  const percentage = (remaining / budget.limit) * 100
  const secondsRemaining = getSecondsRemaining(budget.windowEndsAt)

  return (
    <div className="action-meter" aria-label={`${remaining} of ${budget.limit} actions remaining`}>
      <div className="action-meter__topline">
        <span>Actions</span>
        <strong>{remaining} / {budget.limit}</strong>
      </div>
      <div className="action-meter__track" aria-hidden="true">
        <span style={{ width: `${percentage}%` }} />
      </div>
      <span className="action-meter__refill">Refill in {formatTime(secondsRemaining)}</span>
    </div>
  )
}
