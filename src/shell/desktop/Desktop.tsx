import { getApp } from '@/apps/registry'
import { vfs } from '@/kernel/vfs'
import { useWMStore } from '@/kernel/window-manager'
import { useState } from 'react'
import { ContextMenu, type MenuEntry } from '../context-menu/ContextMenu'
import { Taskbar } from '../taskbar/Taskbar'
import { Window } from '../window/Window'

export function Desktop() {
  const windows = useWMStore((s) => s.windows)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const openApp = (id: string, initData?: unknown) => {
    const app = getApp(id)
    if (!app) return
    useWMStore.getState().open({
      appId: app.id,
      title: app.name,
      icon: app.icon,
      defaultSize: app.defaultSize,
      minSize: app.minSize,
      resizable: app.resizable,
      initData,
    })
  }

  const items: MenuEntry[] = [
    {
      label: 'Refresh',
      onSelect: () => {
        /* no-op, desktop is reactive */
      },
    },
    { separator: true },
    {
      label: 'New folder…',
      onSelect: async () => {
        const name = prompt('Folder name:', 'New Folder')
        if (!name) return
        try {
          await vfs.mkdir(`/home/peluchin/Desktop/${name}`)
        } catch {}
      },
    },
    {
      label: 'New text file…',
      onSelect: async () => {
        const name = prompt('File name:', 'New Document.txt')
        if (!name) return
        const path = `/home/peluchin/Desktop/${name}`
        try {
          if (!(await vfs.exists(path))) await vfs.writeFile(path, '')
          openApp('notepad', { path })
        } catch {}
      },
    },
    { separator: true },
    { label: 'Open Terminal', shortcut: 'Win+T', onSelect: () => openApp('terminal') },
    { label: 'Open File Explorer', shortcut: 'Win+E', onSelect: () => openApp('file-explorer') },
    { separator: true },
    {
      label: 'Properties',
      onSelect: () => {
        alert('peluchinOs 1.0.0-fluffy\nLinux 6.18.5-peluchin\nBuilt with React 19 + Vite 6.')
      },
    },
  ]

  return (
    <div
      className="h-full w-full flex flex-col bg-[var(--color-win-teal)]"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      <div className="flex-1 relative overflow-hidden">
        <DesktopHint visible={windows.length === 0} />
        {windows.map((w) => {
          const app = getApp(w.appId)
          if (!app) return null
          const AppComponent = app.component
          return (
            <Window key={w.id} window={w}>
              <AppComponent window={w} />
            </Window>
          )
        })}
      </div>
      <Taskbar />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function DesktopHint({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div className="absolute top-6 left-6 max-w-xs bevel-out bg-[var(--color-win-gray)] p-3 text-[11px]">
      <div className="font-bold mb-1">Welcome to peluchinOs</div>
      <p className="leading-snug mb-2">
        Open the <span className="font-bold">Event Viewer</span> from the Start menu, or right-click
        anywhere on the desktop for a context menu.
      </p>
      <p className="leading-snug text-gray-700">
        Press <kbd className="bevel-out px-1 bg-[var(--color-win-gray)]">F2</kbd> for a demo log
        entry · <kbd className="bevel-out px-1 bg-[var(--color-win-gray)]">Ctrl+Alt+Del</kbd> for a
        BSOD easter egg.
      </p>
    </div>
  )
}
