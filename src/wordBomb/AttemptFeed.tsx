// CUSTOM WORD BOMB — persistent success, failure, and timeout feed.

import { useEffect, useRef } from 'react'

export interface AttemptFeedEvent {
  id: string | number
  type: 'success' | 'invalid' | 'timeout'
  playerName: string
  word: string | null
  prompt: string
  reason: string | null
  examples: string[]
}

export function AttemptFeed({ events }: { events: AttemptFeedEvent[] }) {
  const feedRef = useRef<HTMLDivElement>(null)
  const latestEventId = events[events.length - 1]?.id

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [latestEventId])

  return (
    <div className="wb-feed" ref={feedRef} aria-live="polite" aria-label="Recent attempts">
      {events.length === 0 && <p className="wb-feed__empty">Attempts will appear here.</p>}
      {events.map((event) => (
        <article className={`wb-feed__event wb-feed__event--${event.type}`} key={event.id}>
          <span className="wb-feed__icon" aria-hidden="true">
            {event.type === 'success' ? '✓' : event.type === 'invalid' ? '×' : '⌛'}
          </span>
          <div>
            <p>
              <strong>{event.playerName}</strong>{' '}
              {event.type === 'success' && <>played <b>{event.word?.toUpperCase()}</b></>}
              {event.type === 'invalid' && <>tried <b>{event.word?.toUpperCase() || '…'}</b></>}
              {event.type === 'timeout' && <>ran out of time on <b>{event.prompt.toUpperCase()}</b></>}
            </p>
            {event.reason && <small>{event.reason}</small>}
            {event.examples.length > 0 && (
              <small className="wb-feed__examples">
                Could have used {event.examples.map((word) => word.toUpperCase()).join(' · ')}
              </small>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
