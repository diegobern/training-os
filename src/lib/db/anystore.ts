import { getDB, notify, type StoreName } from './database'

/**
 * `idb` types every object store separately, which is exactly what you want at
 * a call site that knows which store it means. The sync engine does not: it
 * loops over a list of store names. These four helpers hold the single
 * narrowing cast that makes that legal, so no other file needs one.
 */
type Narrow = 'exercises'

export async function countStore(store: StoreName): Promise<number> {
  const db = await getDB()
  return db.count(store as Narrow)
}

export async function getAllStore<T>(store: StoreName): Promise<T[]> {
  const db = await getDB()
  return (await db.getAll(store as Narrow)) as unknown as T[]
}

export async function getFromStore<T>(store: StoreName, id: string): Promise<T | undefined> {
  const db = await getDB()
  return (await db.get(store as Narrow, id)) as unknown as T | undefined
}

export async function clearStores(stores: StoreName[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(stores as Narrow[], 'readwrite')
  for (const store of stores) await tx.objectStore(store as Narrow).clear()
  await tx.done
  notify(...stores)
}
