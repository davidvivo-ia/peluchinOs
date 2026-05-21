import { eventViewerManifest } from './event-viewer/manifest'
import { terminalManifest } from './terminal/manifest'
import type { AppManifest } from './types'

export const apps: readonly AppManifest[] = [terminalManifest, eventViewerManifest] as const

const byId = new Map(apps.map((a) => [a.id, a]))

export function getApp(id: string): AppManifest | undefined {
  return byId.get(id)
}

export function listStartMenuApps(): AppManifest[] {
  return apps.filter((a) => a.showInStartMenu !== false)
}
