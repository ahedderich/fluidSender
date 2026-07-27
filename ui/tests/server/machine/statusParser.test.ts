import { describe, it, expect, beforeEach } from 'vitest'
import { parseStatusLine, resetOverrides, resetWco } from '../../../server/utils/machine/statusParser'

describe('parseStatusLine overrides caching', () => {
  beforeEach(() => {
    resetWco()
    resetOverrides()
  })

  it('defaults to 100/100/100 before any Ov: has been seen', () => {
    const s = parseStatusLine('<Idle|MPos:0.000,0.000,0.000|FS:0,0>')
    expect(s?.overrides).toEqual({ feed: 100, rapid: 100, spindle: 100 })
  })

  it('parses Ov: when present', () => {
    const s = parseStatusLine('<Run|MPos:0,0,0|FS:500,0|Ov:110,100,100>')
    expect(s?.overrides).toEqual({ feed: 110, rapid: 100, spindle: 100 })
  })

  // FluidNC only includes Ov: on ~1 of every 20 status reports while running
  // (report_ovr_counter) — most lines during a job omit it entirely. The parser
  // must retain the last known percentage on those lines, not reset to 100.
  it('retains the last reported override across subsequent lines without Ov:', () => {
    parseStatusLine('<Run|MPos:0,0,0|FS:500,0|Ov:110,100,90>')
    for (let i = 0; i < 19; i++) {
      const s = parseStatusLine('<Run|MPos:1,1,0|FS:500,0>')
      expect(s?.overrides, `poll ${i}`).toEqual({ feed: 110, rapid: 100, spindle: 90 })
    }
  })

  it('updates again once a later line reports a new Ov:', () => {
    parseStatusLine('<Run|MPos:0,0,0|FS:500,0|Ov:110,100,100>')
    parseStatusLine('<Run|MPos:1,1,0|FS:500,0>')
    const s = parseStatusLine('<Run|MPos:2,2,0|FS:500,0|Ov:120,100,100>')
    expect(s?.overrides).toEqual({ feed: 120, rapid: 100, spindle: 100 })
  })

  it('resetOverrides() clears the cache back to 100/100/100', () => {
    parseStatusLine('<Run|MPos:0,0,0|FS:500,0|Ov:110,100,90>')
    resetOverrides()
    const s = parseStatusLine('<Idle|MPos:0,0,0|FS:0,0>')
    expect(s?.overrides).toEqual({ feed: 100, rapid: 100, spindle: 100 })
  })
})
