import type { vfs as Vfs } from '@/kernel/vfs'
import type { Command, CommandContext } from '../types'

const STATUS_PATH = '/var/lib/dpkg/status'

interface CatalogEntry {
  name: string
  version: string
  description: string
  section: string
  depends?: string[]
}

// A small simulated catalog. `apt install` marks packages installed in the
// dpkg status db on the VFS — it's a toy over the same VFS the rest of the
// terminal uses, not a code loader. The real Debian userspace underneath
// the ISO has actual apt/dpkg (see the motd on a tty).
const CATALOG: CatalogEntry[] = [
  {
    name: 'cowsay',
    version: '3.03+dfsg2-8',
    section: 'toys',
    description: 'configurable talking cow',
  },
  {
    name: 'fortune-mod',
    version: '9708-6',
    section: 'toys',
    description: 'provides fortune cookies on demand',
  },
  {
    name: 'sl',
    version: '5.02-1',
    section: 'toys',
    description: 'correct you when you type sl instead of ls',
  },
  {
    name: 'cmatrix',
    version: '2.0-5',
    section: 'toys',
    description: 'simulates the display from The Matrix',
  },
  {
    name: 'neofetch',
    version: '7.1.0-4',
    section: 'toys',
    description: 'shows system info with an ASCII logo',
  },
  {
    name: 'hollywood',
    version: '1.22-1',
    section: 'toys',
    description: 'fill your screen with hacker-movie technobabble',
  },
  {
    name: 'nano',
    version: '8.1-1',
    section: 'editors',
    description: 'small, friendly text editor',
  },
  {
    name: 'vim',
    version: '9.1',
    section: 'editors',
    description: "Vi IMproved - it's a text editor",
  },
  { name: 'htop', version: '3.3.0-1', section: 'admin', description: 'interactive process viewer' },
  {
    name: 'git',
    version: '2.47.1-1',
    section: 'vcs',
    description: 'fast, distributed version control',
  },
  {
    name: 'peluchinos-extras',
    version: '1.0.0',
    section: 'apps',
    description: 'metapackage pulling in all the peluchinOs toys',
    depends: ['cowsay', 'fortune-mod', 'sl', 'cmatrix', 'neofetch'],
  },
]

const catalogByName = new Map(CATALOG.map((e) => [e.name, e]))

interface InstalledPkg {
  name: string
  version: string
  description: string
}

async function readStatus(vfs: typeof Vfs): Promise<InstalledPkg[]> {
  let raw = ''
  try {
    raw = await vfs.readFile(STATUS_PATH)
  } catch {
    return []
  }
  const pkgs: InstalledPkg[] = []
  for (const block of raw.split(/\n\n+/)) {
    if (!block.trim()) continue
    const fields: Record<string, string> = {}
    for (const line of block.split('\n')) {
      const idx = line.indexOf(':')
      if (idx < 0) continue
      fields[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
    }
    if (fields.package && (fields.status ?? '').includes('installed')) {
      pkgs.push({
        name: fields.package,
        version: fields.version ?? '0',
        description: fields.description ?? '',
      })
    }
  }
  return pkgs
}

async function writeStatus(vfs: typeof Vfs, pkgs: InstalledPkg[]): Promise<void> {
  const blocks = pkgs.map(
    (p) =>
      `Package: ${p.name}\nStatus: install ok installed\nVersion: ${p.version}\nDescription: ${p.description}`,
  )
  await vfs.writeFile(STATUS_PATH, `${blocks.join('\n\n')}\n`)
}

function resolveDeps(names: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const entry = catalogByName.get(name)
    if (!entry) return
    for (const dep of entry.depends ?? []) visit(dep)
    out.push(name)
  }
  for (const n of names) visit(n)
  return out
}

const apt: Command = {
  name: 'apt',
  aliases: ['apt-get'],
  description: 'peluchinOs package manager (simulated catalog over the VFS)',
  usage: 'apt <update|list|search|show|install|remove> [args]',
  run: async (ctx: CommandContext) => {
    const sub = ctx.args[0]
    const rest = ctx.args.slice(1).filter((a) => !a.startsWith('-'))
    const installed = await readStatus(ctx.vfs)
    const installedNames = new Set(installed.map((p) => p.name))

    switch (sub) {
      case undefined:
      case 'help':
        return {
          stdout:
            'apt <command>\n\n' +
            '  update            refresh the package index\n' +
            '  list [--installed] list packages\n' +
            '  search <term>     search the catalog\n' +
            '  show <pkg>        show package detail\n' +
            '  install <pkg>...  install packages\n' +
            '  remove <pkg>...   remove packages\n',
          exitCode: 0,
        }

      case 'update':
        return {
          stdout: `Hit:1 http://archive.peluchinos stable InRelease\nReading package lists... Done\n${CATALOG.length} packages available.\n`,
          exitCode: 0,
        }

      case 'list': {
        const onlyInstalled = ctx.args.includes('--installed')
        const rows = CATALOG.filter((e) => !onlyInstalled || installedNames.has(e.name)).map(
          (e) => {
            const tag = installedNames.has(e.name) ? ' [installed]' : ''
            return `${e.name}/${e.section} ${e.version} amd64${tag}`
          },
        )
        return { stdout: `Listing...\n${rows.join('\n')}\n`, exitCode: 0 }
      }

      case 'search': {
        const term = (rest[0] ?? '').toLowerCase()
        const hits = CATALOG.filter(
          (e) => e.name.includes(term) || e.description.toLowerCase().includes(term),
        )
        if (hits.length === 0) return { stdout: '', exitCode: 0 }
        return {
          stdout: `${hits.map((e) => `${e.name}/${e.section} ${e.version}\n  ${e.description}`).join('\n\n')}\n`,
          exitCode: 0,
        }
      }

      case 'show': {
        const entry = catalogByName.get(rest[0] ?? '')
        if (!entry) return { stderr: `E: Unable to locate package ${rest[0] ?? ''}`, exitCode: 1 }
        return {
          stdout:
            `Package: ${entry.name}\nVersion: ${entry.version}\n` +
            `Section: ${entry.section}\nInstalled: ${installedNames.has(entry.name) ? 'yes' : 'no'}\n` +
            `${entry.depends?.length ? `Depends: ${entry.depends.join(', ')}\n` : ''}` +
            `Description: ${entry.description}\n`,
          exitCode: 0,
        }
      }

      case 'install': {
        if (rest.length === 0) return { stderr: 'E: no packages specified', exitCode: 1 }
        const unknown = rest.filter((n) => !catalogByName.has(n))
        if (unknown.length > 0) {
          return { stderr: `E: Unable to locate package ${unknown[0]}`, exitCode: 100 }
        }
        const plan = resolveDeps(rest).filter((n) => !installedNames.has(n))
        if (plan.length === 0) {
          return { stdout: `${rest.join(', ')} is already the newest version.\n`, exitCode: 0 }
        }
        const next = [...installed]
        for (const name of plan) {
          const e = catalogByName.get(name)!
          next.push({ name: e.name, version: e.version, description: e.description })
        }
        await writeStatus(ctx.vfs, next)
        return {
          stdout: `Reading package lists... Done\nBuilding dependency tree... Done\nThe following NEW packages will be installed:\n  ${plan.join(' ')}\n${plan.map((n) => `Unpacking ${n}...`).join('\n')}\n${plan.map((n) => `Setting up ${n}...`).join('\n')}\n${plan.length} newly installed.\n`,
          exitCode: 0,
        }
      }

      case 'remove':
      case 'purge': {
        if (rest.length === 0) return { stderr: 'E: no packages specified', exitCode: 1 }
        const toRemove = new Set(rest.filter((n) => installedNames.has(n)))
        if (toRemove.size === 0) {
          return { stdout: 'Package(s) not installed, nothing to remove.\n', exitCode: 0 }
        }
        await writeStatus(
          ctx.vfs,
          installed.filter((p) => !toRemove.has(p.name)),
        )
        return {
          stdout:
            `The following packages will be REMOVED:\n  ${[...toRemove].join(' ')}\n` +
            `${[...toRemove].map((n) => `Removing ${n}...`).join('\n')}\n`,
          exitCode: 0,
        }
      }

      default:
        return { stderr: `E: invalid operation ${sub}`, exitCode: 100 }
    }
  },
}

const dpkg: Command = {
  name: 'dpkg',
  description: 'low-level package tool (simulated over the VFS)',
  usage: 'dpkg <-l|-s|-i|-r|-L> [args]',
  run: async (ctx: CommandContext) => {
    const flag = ctx.args[0]
    const installed = await readStatus(ctx.vfs)
    const byName = new Map(installed.map((p) => [p.name, p]))

    switch (flag) {
      case '-l':
      case '--list': {
        const header =
          'Desired=Unknown/Install/Remove/Purge/Hold\n' +
          '| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend\n' +
          '|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)\n' +
          '||/ Name                 Version        Description\n' +
          '+++-====================-==============-===========================================\n'
        const rows = installed
          .map((p) => `ii  ${p.name.padEnd(20)} ${p.version.padEnd(14)} ${p.description}`)
          .join('\n')
        return { stdout: `${header + rows}\n`, exitCode: 0 }
      }

      case '-s':
      case '--status': {
        const p = byName.get(ctx.args[1] ?? '')
        if (!p)
          return {
            stderr: `dpkg-query: package '${ctx.args[1] ?? ''}' is not installed`,
            exitCode: 1,
          }
        return {
          stdout: `Package: ${p.name}\nStatus: install ok installed\nVersion: ${p.version}\nDescription: ${p.description}\n`,
          exitCode: 0,
        }
      }

      case '-L': {
        const name = ctx.args[1] ?? ''
        if (!byName.has(name))
          return { stderr: `dpkg-query: package '${name}' is not installed`, exitCode: 1 }
        return {
          stdout: `/usr/bin/${name}\n/usr/share/doc/${name}\n/usr/share/doc/${name}/copyright\n`,
          exitCode: 0,
        }
      }

      case '-i':
      case '--install': {
        const file = ctx.args[1]
        if (!file) return { stderr: 'dpkg: error: need a .deb filename', exitCode: 2 }
        // Derive a package name from the filename: name_version_arch.deb
        const base = file.split('/').pop() ?? file
        const name = base.replace(/\.deb$/, '').split('_')[0]
        if (byName.has(name)) {
          return { stdout: `Preparing to replace ${name}...\nSetting up ${name}...\n`, exitCode: 0 }
        }
        const cat = catalogByName.get(name)
        const next = [
          ...installed,
          {
            name,
            version: cat?.version ?? '1.0.0',
            description: cat?.description ?? 'locally installed package',
          },
        ]
        await writeStatus(ctx.vfs, next)
        return {
          stdout: `Selecting previously unselected package ${name}.\nUnpacking ${name}...\nSetting up ${name}...\n`,
          exitCode: 0,
        }
      }

      case '-r':
      case '--remove': {
        const name = ctx.args[1] ?? ''
        if (!byName.has(name))
          return {
            stderr: `dpkg: warning: ignoring request to remove ${name}, not installed`,
            exitCode: 0,
          }
        await writeStatus(
          ctx.vfs,
          installed.filter((p) => p.name !== name),
        )
        return { stdout: `Removing ${name}...\n`, exitCode: 0 }
      }

      default:
        return { stderr: `dpkg: error: unknown option ${flag ?? '(none)'}`, exitCode: 2 }
    }
  },
}

export const PKG_COMMANDS: Command[] = [apt, dpkg]
