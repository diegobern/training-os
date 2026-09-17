import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeStore, type StoreName } from '../lib/db/database'

export interface LiveQueryResult<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Runs an IndexedDB query and re-runs it whenever one of `stores` changes.
 * Out-of-order responses are dropped, so fast successive writes cannot leave
 * the UI showing a stale result.
 */
export function useLiveQuery<T>(
  query: () => Promise<T>,
  stores: StoreName[] | '*',
  deps: unknown[] = [],
): LiveQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const runId = useRef(0)
  const queryRef = useRef(query)
  queryRef.current = query

  const run = useCallback(() => {
    const id = ++runId.current
    setLoading(true)
    queryRef
      .current()
      .then((result) => {
        if (id !== runId.current) return
        setData(result)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (id !== runId.current) return
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    return subscribeStore(stores, run)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, JSON.stringify(stores)])

  return { data, loading, error, refresh: run }
}
