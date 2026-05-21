import type { AppManifest } from '../types'
import { EventViewer } from './EventViewer'

export const eventViewerManifest: AppManifest = {
  id: 'event-viewer',
  name: 'Event Viewer',
  icon: '📋',
  component: EventViewer,
  defaultSize: { width: 720, height: 460 },
  minSize: { width: 480, height: 280 },
  resizable: true,
  showInStartMenu: true,
}
