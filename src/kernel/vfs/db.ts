import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { VNode } from './types'

interface BackendOptions {
  indexedDB?: IDBFactory
  IDBKeyRange?: typeof IDBKeyRange
}

export class VfsDatabase extends Dexie {
  nodes!: Table<VNode, number>

  constructor(backend?: BackendOptions) {
    // Dexie accepts an explicit indexedDB implementation — used by the
    // in-memory fallback when the platform's IndexedDB is broken.
    super('peluchinOs-vfs', backend as ConstructorParameters<typeof Dexie>[1])
    this.version(1).stores({
      nodes: '++id, &path, parentPath, type, name, [parentPath+name]',
    })
  }
}

// Live binding: vfs.ts re-reads this on every operation, so swapping the
// instance here transparently retargets the whole VFS.
export let db = new VfsDatabase()

// Replace the Dexie backend with fake-indexeddb (pure JS, in-memory).
// On the live ISO persistence is ephemeral anyway (overlayfs in RAM), so
// the user-visible behaviour is identical — but the app keeps working
// even when WebKitGTK's IndexedDB is broken or hangs.
// Lazy import so the fallback bundle is only fetched when needed.
export async function swapToMemoryBackend(): Promise<void> {
  const fake = await import('fake-indexeddb')
  db = new VfsDatabase({
    indexedDB: fake.indexedDB,
    IDBKeyRange: fake.IDBKeyRange,
  })
}
