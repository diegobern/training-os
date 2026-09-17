import { useEffect, useState } from 'react'
import { subscribeSync, syncStatus, type SyncStatus } from '../lib/sync/engine'

export function useSyncStatus(): SyncStatus {
  const [state, setState] = useState<SyncStatus>(syncStatus())
  useEffect(() => subscribeSync(setState), [])
  return state
}
