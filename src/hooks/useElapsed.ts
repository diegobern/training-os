import { useEffect, useState } from 'react'

/**
 * Seconds of training so far.
 *
 * The arithmetic is the one that lived inside WorkoutActive, unchanged, and it
 * is the reason the clock survives Android freezing the WebView: `startedAt`
 * and `pausedMs` are absolute, stored with the session, so the answer never
 * depended on the interval below having fired. The interval only decides when
 * to ask again.
 */
export function elapsedSeconds(now: number, startedAt: number | undefined, pausedMs: number): number {
  if (!startedAt) return 0
  return Math.max(0, Math.round((now - startedAt - pausedMs) / 1000))
}

/**
 * The live elapsed time of a session, re-read once a second.
 *
 * Shared by the session header and the bar that follows the workout around
 * the rest of the app, so the two can never disagree about how long you have
 * been training.
 *
 * With no session it does not tick at all. And it re-reads the moment the
 * page becomes visible again: coming back from the lock screen, the first
 * thing on screen should be the right time, not the one from before the phone
 * went to sleep followed by a jump a second later.
 */
export function useElapsed(startedAt: number | undefined, pausedMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  const running = startedAt !== undefined

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])

  return elapsedSeconds(now, startedAt, pausedMs)
}
