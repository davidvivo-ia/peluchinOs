import { createLogger } from '../logger'
import { db, swapToMemoryBackend } from './db'
import { ROOT, basename, dirname, normalize } from './paths'
import type { DirEntry, Stat, VNode, VfsEvent, VfsListener } from './types'
import { VfsError } from './types'

const log = createLogger('vfs')

const OPEN_TIMEOUT_MS = 5000

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timeoutId)) as Promise<T>
}

class Vfs {
  private listeners = new Set<VfsListener>()

  async init(): Promise<void> {
    // WebKitGTK's IndexedDB can hang `open()` indefinitely on some live
    // ISO storage stacks (overlayfs root). Race it against a timeout and
    // fall back to the in-memory backend so the desktop ALWAYS gets a
    // working filesystem — persistence is ephemeral on a live image
    // anyway, so the fallback is behaviourally identical there.
    try {
      await withTimeout(db.open(), OPEN_TIMEOUT_MS, 'IndexedDB open')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.warn(`IndexedDB unusable (${msg}) — switching to in-memory VFS backend`)
      await swapToMemoryBackend()
      await db.open()
    }
    const rootStat = await db.nodes.where('path').equals(ROOT).first()
    if (!rootStat) {
      const now = Date.now()
      await db.nodes.add({
        path: ROOT,
        parentPath: '',
        name: '',
        type: 'directory',
        content: '',
        size: 0,
        mtime: now,
        ctime: now,
      })
      log.debug('initialised root directory')
    }
  }

  subscribe(fn: VfsListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: VfsEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch (err) {
        log.error(`vfs listener threw: ${(err as Error).message}`)
      }
    }
  }

  async stat(path: string): Promise<Stat> {
    const n = normalize(path)
    const node = await db.nodes.where('path').equals(n).first()
    if (!node) throw new VfsError('ENOENT', n)
    return {
      path: node.path,
      name: node.name,
      type: node.type,
      size: node.size,
      mtime: node.mtime,
      ctime: node.ctime,
    }
  }

  async exists(path: string): Promise<boolean> {
    const n = normalize(path)
    const node = await db.nodes.where('path').equals(n).first()
    return node !== undefined
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const n = normalize(path)
    const parent = await db.nodes.where('path').equals(n).first()
    if (!parent) throw new VfsError('ENOENT', n)
    if (parent.type !== 'directory') throw new VfsError('ENOTDIR', n)
    const children = await db.nodes.where('parentPath').equals(n).toArray()
    return children
      .map((c) => ({ name: c.name, type: c.type, size: c.size, mtime: c.mtime }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  async mkdir(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const n = normalize(path)
    if (n === ROOT) {
      if (opts.recursive) return
      throw new VfsError('EEXIST', n)
    }
    const existing = await db.nodes.where('path').equals(n).first()
    if (existing) {
      if (opts.recursive) return
      throw new VfsError('EEXIST', n)
    }
    const parentPath = dirname(n)
    let parent = await db.nodes.where('path').equals(parentPath).first()
    if (!parent) {
      if (!opts.recursive) throw new VfsError('ENOENT', parentPath)
      await this.mkdir(parentPath, { recursive: true })
      parent = await db.nodes.where('path').equals(parentPath).first()
    }
    if (parent && parent.type !== 'directory') throw new VfsError('ENOTDIR', parentPath)
    const now = Date.now()
    const name = basename(n)
    await db.nodes.add({
      path: n,
      parentPath,
      name,
      type: 'directory',
      content: '',
      size: 0,
      mtime: now,
      ctime: now,
    })
    this.emit({ kind: 'create', path: n, type: 'directory' })
    log.trace(`mkdir ${n}`)
  }

  async rmdir(path: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const n = normalize(path)
    if (n === ROOT) throw new VfsError('EINVAL', n, 'cannot remove root')
    const node = await db.nodes.where('path').equals(n).first()
    if (!node) throw new VfsError('ENOENT', n)
    if (node.type !== 'directory') throw new VfsError('ENOTDIR', n)
    const children = await db.nodes.where('parentPath').equals(n).count()
    if (children > 0 && !opts.recursive) throw new VfsError('ENOTEMPTY', n)
    if (children > 0) {
      const entries = await db.nodes.where('parentPath').equals(n).toArray()
      for (const c of entries) {
        if (c.type === 'directory') await this.rmdir(c.path, { recursive: true })
        else await this.unlink(c.path)
      }
    }
    await db.nodes.where('path').equals(n).delete()
    this.emit({ kind: 'remove', path: n, type: 'directory' })
    log.trace(`rmdir ${n}`)
  }

  async readFile(path: string): Promise<string> {
    const n = normalize(path)
    const node = await db.nodes.where('path').equals(n).first()
    if (!node) throw new VfsError('ENOENT', n)
    if (node.type !== 'file') throw new VfsError('EISDIR', n)
    return node.content
  }

  async writeFile(path: string, content: string): Promise<void> {
    const n = normalize(path)
    if (n === ROOT) throw new VfsError('EISDIR', n)
    const parentPath = dirname(n)
    const parent = await db.nodes.where('path').equals(parentPath).first()
    if (!parent) throw new VfsError('ENOENT', parentPath)
    if (parent.type !== 'directory') throw new VfsError('ENOTDIR', parentPath)
    const existing = await db.nodes.where('path').equals(n).first()
    const now = Date.now()
    const size = content.length
    if (existing) {
      if (existing.type !== 'file') throw new VfsError('EISDIR', n)
      await db.nodes.update(existing.id!, { content, size, mtime: now })
      this.emit({ kind: 'update', path: n, type: 'file' })
    } else {
      const name = basename(n)
      await db.nodes.add({
        path: n,
        parentPath,
        name,
        type: 'file',
        content,
        size,
        mtime: now,
        ctime: now,
      })
      this.emit({ kind: 'create', path: n, type: 'file' })
    }
    log.trace(`write ${n} (${size}B)`)
  }

  async appendFile(path: string, content: string): Promise<void> {
    const n = normalize(path)
    if (await this.exists(n)) {
      const prev = await this.readFile(n)
      await this.writeFile(n, prev + content)
    } else {
      await this.writeFile(n, content)
    }
  }

  async unlink(path: string): Promise<void> {
    const n = normalize(path)
    const node = await db.nodes.where('path').equals(n).first()
    if (!node) throw new VfsError('ENOENT', n)
    if (node.type === 'directory') throw new VfsError('EISDIR', n)
    await db.nodes.where('path').equals(n).delete()
    this.emit({ kind: 'remove', path: n, type: 'file' })
    log.trace(`unlink ${n}`)
  }

  async rename(from: string, to: string): Promise<void> {
    const src = normalize(from)
    const dst = normalize(to)
    if (src === dst) return
    if (src === ROOT) throw new VfsError('EINVAL', src)
    const srcNode = await db.nodes.where('path').equals(src).first()
    if (!srcNode) throw new VfsError('ENOENT', src)
    const dstExists = await db.nodes.where('path').equals(dst).first()
    if (dstExists) throw new VfsError('EEXIST', dst)
    const dstParentPath = dirname(dst)
    const dstParent = await db.nodes.where('path').equals(dstParentPath).first()
    if (!dstParent) throw new VfsError('ENOENT', dstParentPath)
    if (dstParent.type !== 'directory') throw new VfsError('ENOTDIR', dstParentPath)

    await db.nodes.update(srcNode.id!, {
      path: dst,
      parentPath: dstParentPath,
      name: basename(dst),
      mtime: Date.now(),
    })

    if (srcNode.type === 'directory') {
      const descendants = await db.nodes.where('parentPath').startsWith(src).toArray()
      for (const d of descendants) {
        const newPath = dst + d.path.slice(src.length)
        const newParentPath = dirname(newPath)
        await db.nodes.update(d.id!, { path: newPath, parentPath: newParentPath })
      }
    }

    this.emit({ kind: 'rename', path: dst, oldPath: src, type: srcNode.type })
    log.trace(`rename ${src} -> ${dst}`)
  }

  async copy(from: string, to: string, opts: { recursive?: boolean } = {}): Promise<void> {
    const src = normalize(from)
    const dst = normalize(to)
    const srcNode = await db.nodes.where('path').equals(src).first()
    if (!srcNode) throw new VfsError('ENOENT', src)
    if (srcNode.type === 'directory') {
      if (!opts.recursive) throw new VfsError('EISDIR', src, 'use -r to copy directories')
      await this.mkdir(dst, { recursive: true })
      const children = await db.nodes.where('parentPath').equals(src).toArray()
      for (const c of children) {
        await this.copy(c.path, `${dst}/${c.name}`, { recursive: true })
      }
    } else {
      await this.writeFile(dst, srcNode.content)
    }
  }

  async listAll(): Promise<VNode[]> {
    return db.nodes.orderBy('path').toArray()
  }

  async clear(): Promise<void> {
    await db.nodes.clear()
    await this.init()
  }
}

export const vfs = new Vfs()
