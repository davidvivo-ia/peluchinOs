export { vfs } from './vfs'
export { bootstrapFilesystem } from './bootstrap'
export {
  ROOT,
  normalize,
  resolve,
  dirname,
  basename,
  join,
  isAbsolute,
  toDosPath,
  fromDosPath,
} from './paths'
export type { DirEntry, NodeType, Stat, VNode, VfsEvent, VfsListener } from './types'
export { VfsError } from './types'
