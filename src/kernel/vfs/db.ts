import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { VNode } from './types'

export class VfsDatabase extends Dexie {
  nodes!: Table<VNode, number>

  constructor() {
    super('peluchinOs-vfs')
    this.version(1).stores({
      nodes: '++id, &path, parentPath, type, name, [parentPath+name]',
    })
  }
}

export const db = new VfsDatabase()
