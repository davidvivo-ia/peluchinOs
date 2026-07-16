import { createLogger } from '../logger'
import { vfs } from './vfs'

const log = createLogger('vfs:bootstrap')

const MOTD = `peluchinOs 1.0.0-fluffy (Linux 6.18.5-peluchin) ttyS0

  Welcome to peluchinOs!

  * Documentation: see /home/peluchin/Documents/readme.txt
  * Logs:          see /var/log/ or open Event Viewer
  * Source:        github.com/peluchinos/peluchinOs

Last login info: see ~/.bash_history (when implemented).
`

const README = `peluchinOs — a Windows 98/2000 desktop on a Linux-flavoured boot,
running on top of React 19 + Vite 6 + Tailwind v4 + Zustand + Dexie.

QUICK COMMANDS
  dir | ls           list directory
  cd <path>          change directory (cd .. , cd ~ , cd /)
  type <file>        print file contents (cat works too)
  echo "hi" > a.txt  write to a file (redirects: > >> <)
  echo "x" | wc -l   pipes work too
  help               command reference
  dmesg              kernel log
  ver / uname -a     system info
  reboot             restart peluchinOs

ENJOY.
`

const PELUCHINOS_CONF = `# /etc/peluchinos.conf
# peluchinOs system configuration

theme=win2k-hybrid
hostname=peluchinos
user=peluchin
shell=/bin/peluchsh
boot.splash=true
boot.linux_dmesg=true
boot.self_test=true

# Window manager
wm.title_gradient=true
wm.cascade_offset=28

# Audio
audio.enabled=true
audio.volume=80

# Easter eggs
eastereggs.bsod_chord=ctrl+alt+del
`

interface SeedDir {
  path: string
}

interface SeedFile {
  path: string
  content: string
}

const DIRS: SeedDir[] = [
  { path: '/home' },
  { path: '/home/peluchin' },
  { path: '/home/peluchin/Desktop' },
  { path: '/home/peluchin/Documents' },
  { path: '/home/peluchin/Pictures' },
  { path: '/home/peluchin/Downloads' },
  { path: '/etc' },
  { path: '/etc/apt' },
  { path: '/var' },
  { path: '/var/log' },
  { path: '/var/lib' },
  { path: '/var/lib/dpkg' },
  { path: '/tmp' },
  { path: '/usr' },
  { path: '/usr/bin' },
]

const DPKG_STATUS = `Package: base-files
Status: install ok installed
Version: 13.0
Description: peluchinOs base system files

Package: peluchsh
Status: install ok installed
Version: 1.0.0
Description: the peluchinOs shell

Package: coreutils
Status: install ok installed
Version: 9.5-1
Description: GNU core utilities (dir, ls, cat, echo, ...)
`

const APT_SOURCES = `# peluchinOs apt sources (simulated catalog)
deb http://archive.peluchinos/ stable main toys apps
`

const FILES: SeedFile[] = [
  { path: '/etc/motd', content: MOTD },
  { path: '/etc/peluchinos.conf', content: PELUCHINOS_CONF },
  { path: '/etc/hostname', content: 'peluchinos\n' },
  { path: '/home/peluchin/Documents/readme.txt', content: README },
  {
    path: '/home/peluchin/Documents/poem.txt',
    content: 'Roses are #ff0000\nViolets are #0000ff\nThis terminal is Win98\nBut posix to you.\n',
  },
  {
    path: '/var/log/kernel.log',
    content: '[    0.000000] (boot kernel log is captured live by the Event Viewer)\n',
  },
  { path: '/var/lib/dpkg/status', content: DPKG_STATUS },
  { path: '/etc/apt/sources.list', content: APT_SOURCES },
]

export async function bootstrapFilesystem(): Promise<void> {
  await vfs.init()
  let created = 0
  for (const d of DIRS) {
    if (!(await vfs.exists(d.path))) {
      await vfs.mkdir(d.path, { recursive: true })
      created++
    }
  }
  for (const f of FILES) {
    if (!(await vfs.exists(f.path))) {
      await vfs.writeFile(f.path, f.content)
      created++
    }
  }
  if (created > 0) log.info(`filesystem seeded: ${created} new entries`)
}
