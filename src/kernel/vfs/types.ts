export type NodeType = 'file' | 'directory'

export interface VNode {
  id?: number
  path: string
  parentPath: string
  name: string
  type: NodeType
  content: string
  size: number
  mtime: number
  ctime: number
}

export interface Stat {
  path: string
  name: string
  type: NodeType
  size: number
  mtime: number
  ctime: number
}

export interface DirEntry {
  name: string
  type: NodeType
  size: number
  mtime: number
}

export class VfsError extends Error {
  constructor(
    public code: 'ENOENT' | 'EEXIST' | 'EISDIR' | 'ENOTDIR' | 'ENOTEMPTY' | 'EINVAL' | 'EIO',
    public path: string,
    message?: string,
  ) {
    super(message ?? `${code}: ${path}`)
    this.name = 'VfsError'
  }
}

export type VfsEventKind = 'create' | 'update' | 'remove' | 'rename'

export interface VfsEvent {
  kind: VfsEventKind
  path: string
  oldPath?: string
  type: NodeType
}

export type VfsListener = (e: VfsEvent) => void
