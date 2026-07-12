import { describe, it, expect } from 'vitest'
import { parseBootInfo } from '../../../server/utils/machine/bootInfoParser'

// Real $SS output captured from a healthy FluidNC boot (STA mode).
const STA_HEALTHY = [
  '[MSG:INFO: FluidNC v3.9.8 https://github.com/bdring/FluidNC]',
  '[MSG:INFO: Compiled with ESP32 SDK:v4.4.7-dirty]',
  '[MSG:INFO: Local filesystem type is spiffs]',
  '[MSG:INFO: Configuration file:config.yaml]',
  '[MSG:INFO: Machine custom XYZ]',
  '[MSG:INFO: Board custom]',
  '[MSG:INFO: Axis count 3]',
  '[MSG:INFO: Connecting to STA SSID:Dushanbe]',
  '[MSG:INFO: Connecting.]',
  '[MSG:INFO: Connecting..]',
  '[MSG:INFO: Connected - IP is 192.168.178.50]',
  '[MSG:INFO: WiFi on]',
  '[MSG:INFO: Start mDNS with hostname:http://fluidnc.local/]',
  '[MSG:INFO: HTTP started on port 80]',
  '[MSG:INFO: Telnet started on port 23]',
]

// Real $SS output after a corrupted config.yaml, falling back to AP mode.
const AP_INVALID_CONFIG = [
  '[MSG:INFO: FluidNC v3.9.8 https://github.com/bdring/FluidNC]',
  '[MSG:INFO: Compiled with ESP32 SDK:v4.4.7-dirty]',
  '[MSG:INFO: Local filesystem type is spiffs]',
  '[MSG:INFO: Configuration file:config.yaml]',
  "[MSG:ERR: Configuration parse error on line 10: Key h must be followed by ':']",
  '[MSG:INFO: Machine custom XYZ]',
  '[MSG:INFO: Board custom]',
  '[MSG:INFO: Connecting to STA SSID:Dushanbe]',
  '[MSG:INFO: Connecting.]',
  '[MSG:INFO: Connecting..]',
  '[MSG:INFO: Connecting...]',
  '[MSG:INFO: AP SSID FluidNC IP 192.168.0.1 mask 255.255.255.0 channel 1]',
  '[MSG:INFO: AP started]',
  '[MSG:INFO: WiFi on]',
  '[MSG:INFO: Captive Portal Started]',
  '[MSG:INFO: HTTP started on port 80]',
  '[MSG:INFO: Telnet started on port 23]',
]

// Real $SS output after a panic during config load — no config file line at all.
const PANIC_FALLBACK_TO_DEFAULTS = [
  '[MSG:INFO: FluidNC v3.9.8 https://github.com/bdring/FluidNC]',
  '[MSG:INFO: Compiled with ESP32 SDK:v4.4.7-dirty]',
  '[MSG:INFO: Local filesystem type is spiffs]',
  '[MSG:ERR: Skipping configuration file due to panic]',
  '[MSG:INFO: Using default configuration]',
  '[MSG:INFO: Axes: using defaults]',
  '[MSG:INFO: Machine Default (Test Drive)]',
]

describe('parseBootInfo', () => {
  it('reports a valid config and STA network details on a healthy boot', () => {
    const info = parseBootInfo(STA_HEALTHY)
    expect(info.configValid).toBe(true)
    expect(info.configError).toBeNull()
    expect(info.networkMode).toBe('sta')
    expect(info.ssid).toBe('Dushanbe')
    expect(info.ip).toBe('192.168.178.50')
    expect(info.httpPort).toBe(80)
  })

  it('reports an invalid config and prefers the AP fallback over the failed STA attempt', () => {
    const info = parseBootInfo(AP_INVALID_CONFIG)
    expect(info.configValid).toBe(false)
    expect(info.configError).toBe("Configuration parse error on line 10: Key h must be followed by ':'")
    expect(info.networkMode).toBe('ap')
    expect(info.ssid).toBe('FluidNC')
    expect(info.ip).toBe('192.168.0.1')
    expect(info.httpPort).toBe(80)
  })

  it('reports an invalid config when the panic-fallback path skips the file entirely', () => {
    const info = parseBootInfo(PANIC_FALLBACK_TO_DEFAULTS)
    expect(info.configValid).toBe(false)
    expect(info.configError).toBe('Skipping configuration file due to panic')
    expect(info.networkMode).toBeNull()
    expect(info.ssid).toBeNull()
    expect(info.ip).toBeNull()
    expect(info.httpPort).toBeNull()
  })

  it('returns null network/http fields and a valid config when nothing matched', () => {
    const info = parseBootInfo(['[MSG:INFO: Local filesystem type is spiffs]'])
    expect(info.configValid).toBe(true)
    expect(info.networkMode).toBeNull()
    expect(info.httpPort).toBeNull()
  })
})
