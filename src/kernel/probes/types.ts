export type ProbeStatus = 'ok' | 'warn' | 'failed'

export interface ProbeResult {
  status: ProbeStatus
  detail?: string
}

export interface Probe {
  service: string
  run: () => Promise<ProbeResult> | ProbeResult
}
