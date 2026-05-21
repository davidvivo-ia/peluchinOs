import { sounds } from '@/kernel/audio'
import { useEffect } from 'react'

export function ShutdownScreen() {
  useEffect(() => {
    sounds.shutdown()
  }, [])
  return (
    <div className="absolute inset-0 z-[99999] bg-black text-[#ffaf00] font-mono text-[14px] p-12 flex flex-col items-center justify-center">
      <div className="max-w-md text-center">
        <div className="text-[20px] font-bold mb-6">It's now safe to turn off your computer.</div>
        <div className="text-[12px] text-[#c0c0c0]">
          peluchinOs has shut down. You may close this tab.
        </div>
      </div>
    </div>
  )
}
