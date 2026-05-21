import { sounds } from '@/kernel/audio'
import { useEffect } from 'react'

export interface BsodProps {
  onDismiss: () => void
  reason?: string
}

const FAKE_STACK = `
*** STOP: 0x000000C0 (0xFEEDFACE, 0xC0FFEEEE, 0x00000DAD, 0xBADCAFE0)
*** PLUSHFS_FATAL_PURR_OVERFLOW: too many cuddles in the kernel buffer.

Begin Stuffing Dump…
Physical memory dump complete. Plushie cores remain warm.

If this is the first time you've seen this Stop error screen,
restart your computer. If this screen appears again, follow these steps:

  - Check for new soft-toy drivers.
  - Run \`dmesg -l error\` from a Terminal to inspect the kernel log.
  - Hug a plushie firmly and try again.

Press any key to continue _
`

export function Bsod({ onDismiss, reason }: BsodProps) {
  useEffect(() => {
    sounds.error()
    let armed = false
    const arm = setTimeout(() => {
      armed = true
    }, 350)
    function onKey() {
      if (!armed) return
      onDismiss()
    }
    function onClick() {
      if (!armed) return
      onDismiss()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      clearTimeout(arm)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onDismiss])

  return (
    <div className="absolute inset-0 z-[99999] bg-[#0000aa] text-[#c0c0c0] font-mono text-[14px] p-8 flex flex-col items-center justify-center whitespace-pre">
      <div className="text-center mb-6 text-white bg-[#c0c0c0] text-[#0000aa] px-4 py-0.5 font-bold">
        peluchinOs
      </div>
      <div className="max-w-3xl">
        A fatal exception has occurred at <span className="text-white">0x0000:0xC0FFEEEE</span> in
        the kernel module {reason ?? 'plushfs.sys'}. The current application will be terminated.
      </div>
      <pre className="max-w-3xl mt-4 text-[12px]">{FAKE_STACK}</pre>
      <div className="mt-6 text-white">Press any key to reboot…</div>
    </div>
  )
}
