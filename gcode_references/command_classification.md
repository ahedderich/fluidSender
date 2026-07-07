# FluidNC Command Classification for Send Loop Processing

> Derived from FluidNC source code analysis:
> `FluidNC/src/GCode.cpp`, `Protocol.cpp`, `MotionControl.cpp`, `Channel.cpp`, `ProcessSettings.cpp`
> Date: 2026-06-27

---

## How FluidNC Sends `ok`

The protocol main loop (`Protocol.cpp: protocol_main_loop`) calls `execute_line()` and then calls
`channel->ack(status_code)` **after** the function returns. Therefore:

- `ok` arrives **only when the firmware completes processing of the command line**
- For planner-buffered commands, "complete processing" means "queued into the planner buffer"
- For blocking commands, "complete processing" means the physical operation is done
- `error:N` is sent instead of `ok` when a command fails

**Empty and comment-only lines** (stripped to `""` by `collapseGCode`) hit the fast path in
`execute_line()` and return `Error::Ok` immediately — they always generate an `ok` without
touching the planner.

**Real-time commands** (`?`, `!`, `~`, `Ctrl-X`, `0x84`–`0xA1`) are intercepted at the byte
level in the channel's receive handler. They never form a complete line and never generate `ok`.

---

## Classification Categories

### A — Planner-Buffered (ok immediate, reduces `Bf:` planner free count)

Motion is queued into the planner buffer via `plan_buffer_line()`. The `ok` is returned as
soon as the block is queued (or as soon as room exists in the buffer — the firmware spins in
`mc_move_motors()` until there is a free slot, then queues and returns). The actual machine
movement happens asynchronously after `ok`.

**Bf: planner free count decreases by 1 for each block queued.**

G2 and G3 arcs are decomposed into many short linear segments — each segment consumes one
planner slot. A long arc can queue dozens of blocks before returning `ok`.

G28 and G30 each queue up to two motions (optional intermediate move + final move to home).

**Send loop implication:** These commands can be streamed ahead using the `Bf:` planner free
count from `?` status reports. Stop sending when `Bf:plannerFree` reaches 0.

| Command | Description | Position Change |
|---------|-------------|----------------|
| `G0` | Rapid traverse | YES |
| `G1` | Linear feed move | YES |
| `G2` | Clockwise arc (many planner blocks) | YES |
| `G3` | Counter-clockwise arc (many planner blocks) | YES |
| `G28` | Go to pre-defined home 1 (queues 1–2 rapid moves) | YES |
| `G30` | Go to pre-defined home 2 (queues 1–2 rapid moves) | YES |
| `$J=` | Jog motion | YES |

---

### B — Interpreter-Blocking / Drains Planner (ok delayed until operation completes)

These commands cause the GCode interpreter task to stall in `protocol_buffer_synchronize()`,
which loops until the planner buffer is empty and the machine returns to Idle. After draining,
additional blocking may occur (e.g. dwell sleep, probe wait, homing). `ok` is sent only after
all of that is done.

**Send loop implication:** The send loop must wait for `ok` before sending the next command.
Do not use `Bf:` streaming for these — they drain the planner themselves.

#### B1 — Drain-only (ok arrives after planner is empty + operation applied instantly)

The planner drains, the state change is applied, then `ok` is sent.

| Command | Description | Modal / State Change |
|---------|-------------|---------------------|
| `M3` | Spindle CW | `modal.spindle = Cw`; activates spindle hardware |
| `M4` | Spindle CCW | `modal.spindle = Ccw`; activates spindle hardware |
| `M5` | Spindle stop | `modal.spindle = Disable`; stops spindle hardware |
| `M6` | Tool change | `current_tool` updated; ATC/macro/manual change executed |
| `M61` | Set tool number | `current_tool` set; spindle may switch |
| `M7` | Mist coolant on | `modal.coolant.Mist = 1`; activates coolant hardware |
| `M8` | Flood coolant on | `modal.coolant.Flood = 1`; activates coolant hardware |
| `M9` | All coolant off | `modal.coolant = {}`; deactivates coolant hardware |
| `M62 Pp` | Digital output on (sync) | Pin `p` set HIGH after planner drains |
| `M63 Pp` | Digital output off (sync) | Pin `p` set LOW after planner drains |
| `M67 Ee Qq` | Analog output (sync) | Analog output `e` set to `q`% after planner drains |
| `G10 L2/L20 Px` | Set WCS offset | Saves to NVS; triggers `gc_wco_changed()` |
| `G54`–`G59` | Select work coordinate system | `modal.coord_select` updated; triggers `gc_wco_changed()` |
| `G92` | Set G92 offset | `coord_offset[]` updated; triggers `gc_wco_changed()` |
| `G92.1` | Clear G92 offset | `coord_offset[]` zeroed; triggers `gc_wco_changed()` |
| `G28.1` | Store current pos as G28 | Saves to NVS; may trigger buffer sync via NVS write path |
| `G30.1` | Store current pos as G30 | Saves to NVS; may trigger buffer sync via NVS write path |
| `M2` | Program end | Planner drains; spindle/coolant stopped; modals reset |
| `M30` | Program end + rewind | Same as M2 |

> **`FORCE_BUFFER_SYNC_DURING_WCO_CHANGE = true`** (hardcoded in `Config.h`) means all
> coordinate changes (G10, G54–G59, G92, G92.1) always drain the planner before applying.
> `FORCE_BUFFER_SYNC_DURING_NVS_WRITE = true` means NVS writes (G10, G28.1, G30.1)
> also drain the planner.

> **Spindle state change on standalone `S` word:** If the spindle is ON and the programmed
> speed changes, FluidNC calls `protocol_buffer_synchronize()` before updating the speed.
> If the spindle is OFF, the `S` word updates `gc_state.spindle_speed` immediately with no
> planner drain. This makes `S` words context-dependent.

#### B2 — Drain + Extended Block (ok arrives long after the command is sent)

The planner drains first, then the firmware continues blocking for an arbitrarily long time.

| Command | Description | Blocking Behavior |
|---------|-------------|-------------------|
| `G4 Pn` | Dwell `n` seconds | Drains planner; then `dwell_ms(n*1000)` blocks the interpreter for the full dwell |
| `G38.2` | Probe toward, error on miss | Drains planner; queues probe motion; **blocks until machine is Idle** (probe touched or end of travel) |
| `G38.3` | Probe toward, no error | Same; does not alarm on miss |
| `G38.4` | Probe away, error on contact | Same; blocks until machine is Idle |
| `G38.5` | Probe away, no error | Same |
| `M0` | Program pause | Drains planner; sends feed-hold event; **blocks waiting for cycle-start** to be issued |
| `$H` | Home all axes | Blocks until all homing cycles complete (or alarm) |
| `$HX`–`$HC` | Home individual axis | Blocks until that axis homes |

> **G38.x correction vs CLAUDE.md:** The CLAUDE.md currently classifies G38.x as
> "planner-buffered". This is incorrect. `mc_probe_cycle()` calls
> `protocol_buffer_synchronize()` and then blocks in a `do { protocol_execute_realtime(); }
> while (!state_is(State::Idle))` loop until the probe finishes. `ok` arrives after
> probe completion.

---

### C — Immediate (ok sent without touching the planner)

These commands parse, validate, and update parser state (or perform a quick I/O operation)
entirely within `execute_line()`. They return `Error::Ok` immediately; `ok` follows without
any planner interaction.

**Send loop implication:** No special handling needed; these are cheap and fast. If needed,
they can be inserted freely into a streaming job without disturbing `Bf:` accounting.

#### C1 — Modal state changes only (no hardware effect)

| Command | Description | Modal Change |
|---------|-------------|-------------|
| `G17` | Select XY plane | `modal.plane_select = XY` |
| `G18` | Select ZX plane | `modal.plane_select = ZX` |
| `G19` | Select YZ plane | `modal.plane_select = YZ` |
| `G20` | Inch mode | `modal.units = Inches` |
| `G21` | Millimeter mode | `modal.units = Mm` |
| `G40` | Cancel cutter radius comp | No-op (cutter comp never enabled) |
| `G80` | Cancel motion mode | `modal.motion = None` |
| `G90` | Absolute distance mode | `modal.distance = Absolute` |
| `G91` | Incremental distance mode | `modal.distance = Incremental` |
| `G91.1` | Arc IJK incremental mode | No-op (already default) |
| `G93` | Inverse time feed rate | `modal.feed_rate = InverseTime` |
| `G94` | Units-per-minute feed rate | `modal.feed_rate = UnitsPerMin` |
| `G61` | Exact path mode | No-op (accepted for GRBL compatibility) |
| `M1` | Optional stop | No-op (not implemented) |

#### C2 — Immediate hardware effects (no planner drain)

| Command | Description | Effect |
|---------|-------------|--------|
| `G43.1 Zn` | Tool length offset | Updates `tool_length_offset[]`; immediate |
| `G49` | Cancel tool length offset | Zeros `tool_length_offset[]`; immediate |
| `M64 Pp` | Digital output on (immediate) | Pin `p` set HIGH immediately |
| `M65 Pp` | Digital output off (immediate) | Pin `p` set LOW immediately |
| `M66 Pp L0` | Read digital input (immediate) | Reads pin value into `#5399`; immediate mode only |
| `M68 Ee Qq` | Analog output (immediate) | Analog output `e` set to `q`% immediately |

#### C3 — Value word updates (no hardware, no planner)

| Word | Description | Effect |
|------|-------------|--------|
| `Fn` | Feed rate | Updates `gc_state.feed_rate` (used for next motion) |
| `Sn` | Spindle speed (spindle OFF) | Updates `gc_state.spindle_speed` only; if spindle ON → triggers buffer sync (becomes B1) |
| `Tn` | Tool select | Updates `gc_state.selected_tool`; no spindle change until `M6` |
| `Nn` | Line number | Label only; no effect |

#### C4 — $ commands with immediate response

| Command | Description | Response |
|---------|-------------|----------|
| `$X` | Kill alarm lock | Machine enters Idle; `ok` |
| `$C` | Toggle check mode | Mode changed; `ok` |
| `$SLP` | Enter sleep mode | Sleep event queued async; `ok` immediate |
| `$G` / `$GCode/Modes` | Report current G-code state | GCode state text + `ok` |
| `$I` | Build/firmware info | Build info text + `ok` |
| `$#` / `$GCode/Offsets` | Show offsets | Offsets text + `ok` |
| `$S` / `$Settings/List` | List all settings | Settings text + `ok` |
| `$$` | GRBL-compat settings dump | Settings + `ok` |
| `$E` / `$Errors/List` | List error codes | Error list + `ok` |
| `$A` / `$Alarms/List` | List alarm codes | Alarm list + `ok` |
| `$CMD` | List available commands | Commands + `ok` |
| `$T` / `$State` | Show machine state | State text + `ok` |
| `$CD` / `$Config/Dump` | Dump YAML config | YAML text + `ok` |
| `$N` | Show startup blocks | Startup lines + `ok` |
| `$MD` / `$Motor/Disable` | Disable all motors | Motors disabled; `ok` |
| `$ME` / `$Motor/Enable` | Enable all motors | Motors enabled; `ok` |
| `$MI` / `$Motors/Init` | Re-init motor drivers | Motors re-initialized; `ok` |
| `$RST=$` | Reset numeric settings | NVS reset; `ok` |
| `$RST=#` | Reset GCode offsets | Offsets reset; `ok` |
| `$RST=*` | Reset all persistent data | Full NVS reset; `ok` |

#### C5 — $ commands that block (no ok or delayed)

| Command | Description | Behavior |
|---------|-------------|----------|
| `$Bye` / `$System/Control=RESTART` | Reboot ESP32 | No `ok`; machine reboots |
| `$Limits` | Limit switch test mode | Loops printing limit state; exits on `!` (feedhold) |

---

## Real-Time Commands (no `ok`, no planner interaction)

These bytes are processed immediately at the byte/character level, outside the line-oriented
`execute_line()` path. They never generate `ok` or `error:` responses.

| Byte | Action |
|------|--------|
| `Ctrl-X` (0x18) | Soft-reset |
| `?` | Status report query → `<State\|MPos:...\|Bf:...>` |
| `~` | Cycle start / resume |
| `!` | Feed hold |
| `0x84` | Safety door |
| `0x85` | Jog cancel |
| `0x90`–`0x94` | Feed rate overrides |
| `0x95`–`0x97` | Rapid overrides |
| `0x99`–`0x9D` | Spindle speed overrides |
| `0x9E` | Toggle spindle stop (Hold state only) |
| `0xA0` | Toggle flood coolant |
| `0xA1` | Toggle mist coolant |

---

## Modal State Summary

The parser maintains `gc_state.modal` (persistent across lines) and `gc_block.modal` (per-block
parse). On successful execution, block modal state is copied to parser state.

| Modal Group | Commands | What Is Tracked |
|-------------|----------|-----------------|
| MG0 (non-modal) | G4, G10, G28, G30, G53, G92 | Non-modal action (one-shot, not persisted) |
| MG1 (motion) | G0, G1, G2, G3, G38.x, G80 | `modal.motion` |
| MG2 (plane) | G17, G18, G19 | `modal.plane_select` |
| MG3 (distance) | G90, G91 | `modal.distance` |
| MG4 (arc distance) | G91.1 | (arc mode, always incremental) |
| MG5 (feed rate) | G93, G94 | `modal.feed_rate` |
| MG6 (units) | G20, G21 | `modal.units` |
| MG8 (TLO) | G43.1, G49 | `modal.tool_length` + `tool_length_offset[]` |
| MG12 (WCS) | G54–G59 | `modal.coord_select` + `coord_system[]` |
| MM4 (program flow) | M0, M1, M2, M30 | `modal.program_flow` |
| MM7 (spindle) | M3, M4, M5 | `modal.spindle` + hardware state |
| MM8 (coolant) | M7, M8, M9 | `modal.coolant` + hardware state |
| MM5 (I/O) | M62–M68 | No persistent modal; pin/output state only |
| MM6 (tool) | M6, M61 | `current_tool` |

**Default state on reset/startup:** `G0 G21 G90 G94 G17 G49 G54 M5 M9`

**State reset by M2/M30:** `G1 G17 G90 G94 G54 M5 M9` (feed/spindle/tool not reset)

---

## Send Loop Decision Table

| Category | `ok` Timing | `Bf:` Effect | Send Loop Action |
|----------|-------------|--------------|-----------------|
| **A — Planner-buffered** | Immediately when queued | Reduces by 1 per block (G2/G3: many blocks) | Can stream multiple lines ahead; use `Bf:plannerFree` to gate sending |
| **B1 — Drain-only** | After planner drains (~seconds) | Drains to 0, then rises back | Wait for `ok`; do not rely on `Bf:` |
| **B2 — Extended block** | After operation completes (seconds to minutes) | Drains to 0 + operation time | Wait for `ok`; set long timeout |
| **C — Immediate** | Immediately | None | No special handling; `Bf:` unaffected |
| **Real-time** | Never (no `ok`) | None | Send as raw bytes; do not count in line tracking |

### Critical Send Loop Rules

1. **Never send a new command until `ok` (or `error:`) is received for the previous one**, unless
   you are actively streaming Category A commands using the `Bf:` counter.

2. **When streaming Category A commands with `Bf:`:** Stop sending when `Bf:plannerFree == 0`.
   Resume when `?` reports `Bf:plannerFree > 0`. Always account for in-flight lines that have
   been sent but not yet acknowledged.

3. **Before a Category B1/B2 command:** If you were streaming, wait for all in-flight `ok`s
   to arrive before sending the Category B command. The firmware itself drains the planner, but
   the send loop's `execPtr` tracking must be synchronized first.

4. **G38.x (probe)** is Category B2, not planner-buffered. The `ok` arrives only after the probe
   motion completes. The `Bf:` count will drop to 0 before the `ok` arrives.

5. **M0 (pause)** is Category B2. The `ok` arrives only after the user issues a cycle-start
   (`~`). This can be indefinitely long. The send loop must wait.

6. **`$J=` (jog)** is Category A. Multiple jog commands can be queued in the planner. Cancel
   with `0x85` (jog-cancel real-time byte).

7. **Spindle-ON speed changes (`S` word):** If the spindle is currently ON, a standalone `Sn`
   word causes `protocol_buffer_synchronize()` before applying the new speed — it behaves as B1.
   If the spindle is OFF, `S` is Category C (immediate, no drain).

---

## Appendix: FluidNC Source Code Call Paths

| Scenario | Source Path |
|----------|-------------|
| Line received → `ok` sent | `Protocol.cpp:protocol_main_loop` → `execute_line()` → `channel->ack(status)` |
| Planner queue | `GCode.cpp:gc_execute_line` → `mc_linear()` → `mc_move_motors()` → `plan_buffer_line()` |
| Buffer drain | `Protocol.cpp:protocol_buffer_synchronize` — spins until `plan_get_current_block()==NULL && !Cycle` |
| G4 dwell | `GCode.cpp` → `mc_dwell()` → `protocol_buffer_synchronize()` + `dwell_ms()` |
| G38.x probe | `GCode.cpp` → `mc_probe_cycle()` → `protocol_buffer_synchronize()` + blocking do/while idle |
| M3/M4/M5 | `GCode.cpp:[7. Spindle control]` → `protocol_buffer_synchronize()` → `spindle->setState()` |
| M7/M8/M9 | `GCode.cpp:[8. Coolant control]` → `protocol_buffer_synchronize()` → `coolant->set_state()` |
| G54–G59, G92 | `GCode.cpp` → `gc_wco_changed()` → `protocol_buffer_synchronize()` (FORCE flag = true) |
| M0 pause | `GCode.cpp:[21. Program flow]` → `protocol_buffer_synchronize()` → `feedHoldEvent` → blocks in suspend |
| $H homing | `ProcessSettings.cpp:home()` → `Homing::run_cycles()` + blocks in `do/while(State::Homing)` |
| `ok` text | `Channel.cpp:ack()` — sends `"ok"` if Error::Ok, else `"error:N"` |
