export interface FluidNCBootInfo {
  /** False if `$SS` shows a config parse error or the panic-fallback-to-defaults path. */
  configValid: boolean
  /** Raw `[MSG:ERR: ...]` text (bracket/prefix stripped) that indicated the config problem. */
  configError: string | null
  networkMode: 'sta' | 'ap' | null
  ssid: string | null
  /** Confirmed IP — the STA-assigned address, or the AP's own address in AP mode. */
  ip: string | null
  httpPort: number | null
  /** Epoch ms this snapshot was captured — always "as of the last successful boot fetch". */
  checkedAt: number
}

/**
 * Parses FluidNC's `$SS` (show startup log) reply lines for config-load and
 * network/HTTP status. AP mode wins over a failed/retrying STA attempt in the same
 * buffer (FluidNC falls back to AP after STA connect attempts time out), so an AP
 * line is checked first regardless of line order.
 */
export function parseBootInfo(lines: string[]): FluidNCBootInfo {
  const errLine = lines.find((l) =>
    /\[MSG:ERR:\s*(Configuration (parse error|is invalid)|Skipping configuration file)/i.test(l),
  )
  const configValid = !errLine
  const configError = errLine
    ? errLine.replace(/^\[MSG:ERR:\s*/i, '').replace(/\]\s*$/, '').trim()
    : null

  const apLine = lines.find((l) => /AP SSID\s+\S+\s+IP\s+[\d.]+/i.test(l))
  const apMatch = apLine?.match(/AP SSID\s+(\S+)\s+IP\s+([\d.]+)/i)

  const staLine = lines.find((l) => /Connecting to STA SSID:/i.test(l))
  const staMatch = staLine?.match(/Connecting to STA SSID:([^\]]+)\]/i)

  const ipLine = lines.find((l) => /Connected - IP is/i.test(l))
  const ipMatch = ipLine?.match(/Connected - IP is\s*([\d.]+)/i)

  let networkMode: 'sta' | 'ap' | null = null
  let ssid: string | null = null
  let ip: string | null = null
  if (apMatch) {
    networkMode = 'ap'
    ssid = apMatch[1]!
    ip = apMatch[2]!
  } else if (staMatch) {
    networkMode = 'sta'
    ssid = staMatch[1]!.trim()
    ip = ipMatch?.[1] ?? null
  }

  const httpLine = lines.find((l) => /HTTP started on port/i.test(l))
  const httpMatch = httpLine?.match(/HTTP started on port\s+(\d+)/i)
  const httpPort = httpMatch ? Number(httpMatch[1]) : null

  return { configValid, configError, networkMode, ssid, ip, httpPort, checkedAt: Date.now() }
}
