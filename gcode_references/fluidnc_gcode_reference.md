# FluidNC G-Code & Commands Reference

> Sources: [FluidNC GitHub Wiki](https://github.com/bdring/FluidNC/wiki), [DeepWiki/bdring/FluidNC](https://deepwiki.com/bdring/FluidNC), [wiki.fluidnc.com](http://wiki.fluidnc.com) (offline at time of download)
> Downloaded: 2026-06-27

FluidNC is a CNC firmware for the ESP32 built on top of GRBL's protocol. It is **100% compatible** with the GRBL G-code send/response protocol — all GRBL G-codes are supported. This reference documents the supported G-codes and FluidNC-specific commands and settings.

---

## Supported G-Codes

### Modal Groups

| Group | Commands | Default | Purpose |
|-------|----------|---------|---------|
| MG0 | G4, G10, G28, G30, G53, G92 | — | Non-modal actions |
| MG1 | G0, G1, G2, G3, G38.x, G80 | G0 | Motion modes |
| MG2 | G17, G18, G19 | G17 | Plane selection |
| MG3 | G90, G91 | G90 | Distance mode |
| MG5 | G93, G94 | G94 | Feed rate mode |
| MG6 | G20, G21 | G21 | Units |
| MG8 | G43.1, G49 | G49 | Tool length offset |
| MG12 | G54–G59 | G54 | Work coordinate systems |
| MM4 | M0, M1, M2, M30 | M0 | Program flow |
| MM7 | M3, M4, M5 | M5 | Spindle control |
| MM8 | M7, M8, M9 | M9 | Coolant control |

**Default initialization state:** G0, G94, G21, G90, G17, G49, G54, M5, M9

### G-Commands

| Command | Purpose |
|---------|---------|
| G0 | Rapid traverse (positioning) |
| G1 | Linear feed move |
| G2 | Clockwise arc |
| G3 | Counter-clockwise arc |
| G4 Pn | Dwell for `n` seconds |
| G10 L2 Px | Set work coordinate system offset |
| G10 L20 Px | Set WCS offset from current position |
| G17 | Select XY plane |
| G18 | Select ZX plane |
| G19 | Select YZ plane |
| G20 | Inch mode |
| G21 | Millimeter mode (**default**) |
| G28 | Go to pre-defined home position 1 |
| G28.1 | Store current position as G28 |
| G30 | Go to pre-defined home position 2 |
| G30.1 | Store current position as G30 |
| G38.2 | Probe toward workpiece — error if no contact |
| G38.3 | Probe toward workpiece — no error if no contact |
| G38.4 | Probe away from workpiece — error if no loss of contact |
| G38.5 | Probe away from workpiece — no error |
| G40 | Cancel cutter radius compensation (**default**) |
| G43.1 | Dynamic tool length offset (from Z word) |
| G49 | Cancel tool length offset (**default**) |
| G53 | Move in machine coordinates (non-modal) |
| G54–G59 | Select work coordinate system 1–6 |
| G80 | Cancel canned cycle / motion mode |
| G90 | Absolute distance mode (**default**) |
| G91 | Incremental distance mode |
| G91.1 | Arc IJK incremental distance mode (**default**) |
| G92 | Set coordinate system offset |
| G92.1 | Clear G92 offset |
| G93 | Inverse time feed rate mode |
| G94 | Units per minute feed rate mode (**default**) |
| G61 | Exact path control mode — accepted for GRBL compatibility; no effect (only supported path mode) |

### M-Commands

| Command | Group | Purpose |
|---------|-------|---------|
| M0 | MM4 | Program pause (resume with cycle start) |
| M1 | MM4 | Optional program pause |
| M2 | MM4 | Program end |
| M30 | MM4 | Program end and rewind |
| M3 | MM7 | Spindle clockwise (S = speed) |
| M4 | MM7 | Spindle counter-clockwise (S = speed) |
| M5 | MM7 | Spindle stop (**default**) |
| M6 | — | Tool change (routes to ATC, macro, or manual) |
| M61 | — | Set tool number without physical change |
| M7 | MM8 | Mist coolant on |
| M8 | MM8 | Flood coolant on |
| M9 | MM8 | All coolant off (**default**) |
| M62–M65 | MM5 | Digital output control |
| M66 | MM5 | Wait on digital/analog input |
| M67 | MM5 | Analog output control (synchronized) |
| M68 | MM5 | Analog output control (immediate) |

> **Note on execution timing:**
> - `G0`, `G1`, `G2`, `G3`, `G28`, `G30`, `G38.x` — planner-buffered; `ok` sent immediately when queued; reduce `Bf:` free count.
> - `G4` (dwell) — interpreter-blocking; calls `protocol_buffer_synchronize()` to drain planner, then sleeps; `ok` arrives only after dwell completes.
> - `M3`, `M4`, `M5`, `M6`, `M7`, `M8`, `M9` — real FluidNC calls `protocol_buffer_synchronize()` before applying (so `ok` is technically delayed); immediate-execution for most senders.
> - `G10`, `G92`, standalone `F`/`S`/`T`, modal-only lines — immediate; `ok` sent right away.

### Word Parameters

| Word | Description |
|------|-------------|
| X, Y, Z | Axis target positions (linear) |
| A, B, C | Rotary axis target positions |
| I, J, K | Arc center offsets from start point |
| F | Feed rate |
| S | Spindle speed |
| T | Tool number |
| P | Parameter/dwell time |
| Q | Retract increment |
| R | Arc radius (alternative to IJK) |
| L | Loop count or parameter qualifier |
| N | Line number |
| E | Extruder (not standard in CNC use) |
| O | Subroutine number (macro system) |

---

## Coordinate System Management

FluidNC maintains layered coordinate transformations:

| System | Description |
|--------|-------------|
| **G54–G59** | Six persistent work coordinate systems (stored in flash/NVS) |
| **G92 Offset** | Temporary offset, cleared on reset |
| **G28 / G30** | Two predefined home positions (stored persistently) |
| **Tool Length Offset** | Applied with G43.1, canceled with G49 |

---

## FluidNC `$` Commands

FluidNC extends the GRBL `$` command set significantly. Commands are case-insensitive and only usable in idle mode. Both short and long forms are accepted:

```
$H          equivalent to      $Home
$MD         equivalent to      $Motor/Disable
```

Use `$CMD` to list all available commands on the connected machine.

### Information & Diagnostics

| Command | Long Form | Description |
|---------|-----------|-------------|
| `$#` | `$GCode/Offsets` | Show G54–G59, G28, G30, G92 offsets and probe position |
| `$G` | `$GCode/Modes` | Show current G-code parser modal state |
| `$I` | — | Show firmware version and build info |
| `$T` | `$State` | Show current machine state (Idle, Run, Jog, etc.) |
| `$S` | `$Settings/List` | List all setting names and their current values |
| `$CMD` | — | List all available commands |
| `$E` | `$Errors/List` | List all error code descriptions |
| `$A` | `$Alarms/List` | List all alarm code descriptions |
| `$Limits` | — | Enter limit switch testing mode |
| `$CD` | `$Config/Dump` | Display the full active configuration (YAML) |
| `$$` | — | Print all numeric settings (GRBL-compatible format) |

### Motion & Homing

| Command | Long Form | Description |
|---------|-----------|-------------|
| `$H` | `$Home` | Home all configured axes |
| `$H=XY` | — | Home specific axes (e.g. X and Y only) |
| `$HX` | — | Home X axis only |
| `$HY` | — | Home Y axis only |
| `$HZ` | — | Home Z axis only |
| `$HA` | — | Home A axis only |
| `$HB` | — | Home B axis only |
| `$HC` | — | Home C axis only |
| `$J=line` | — | Execute a jogging motion (GRBL-compatible format) |
| `$X` | — | Kill alarm lock (override alarm state) |
| `$C` | — | Toggle G-code check mode (parse without execute) |

### Motor Control

| Command | Long Form | Description |
|---------|-----------|-------------|
| `$MD` | `$Motor/Disable` | Disable all motors (allow manual movement) |
| `$ME` | `$Motor/Enable` | Re-enable all motors |
| `$MI` | `$Motors/Init` | Re-initialize motor drivers |

### System Control

| Command | Long Form | Description |
|---------|-----------|-------------|
| `$RST=$` | — | Reset all numeric settings to firmware defaults |
| `$RST=#` | — | Clear all G-code offsets (G54–G59, G28, G30) |
| `$RST=*` | — | Clear all persistent data (settings, offsets, startup lines) |
| `$SLP` | — | Enter sleep mode (de-powers spindle, coolant, steppers) |
| `$Bye` | `$System/Control=RESTART` | Reboot the ESP32 |
| `$N0=line` | — | Store startup G-code block 0 |
| `$N1=line` | — | Store startup G-code block 1 |
| `$N` | — | View stored startup blocks |

### SD Card & Filesystem

| Command | Description |
|---------|-------------|
| `$SD/Status` | Show SD card status |
| `$SD/List` | List files on SD card |
| `$SD/Run=filename` | Run a G-code file from SD card |
| `$SD/Show=filename` | Print contents of a file from SD card |
| `$LocalFS/List` | List files in local (LittleFS) filesystem |
| `$LocalFS/Run=filename` | Run a G-code file from local filesystem |
| `$LocalFS/Show=filename` | Print contents of a local file |
| `$XS` | Initiate XModem send (upload to controller) |
| `$XR` | Initiate XModem receive (download from controller) |

### Network

| Command | Description |
|---------|-------------|
| `$WiFi/ListAPs` | List visible WiFi access points with signal strength |
| `$Radio/State=on\|off` | Enable or disable WiFi/BT radio |

### Settings (Persistent Values)

Settings use a hierarchical path format. View a setting by sending its name; set it with `=value`:

```
$Config/Filename           ; view current config filename
$Config/Filename=test.yaml ; set config filename
```

Settings outside the YAML config file that persist in NVS:

| Setting | Description |
|---------|-------------|
| `$Config/Filename` | Name of the YAML config file to load |
| `$Wifi/SSID` | WiFi network name |
| `$Wifi/Password` | WiFi password |
| `$Wifi/Mode` | WiFi mode: STA (client) or AP (access point) |
| `$Bluetooth/Name` | Bluetooth device name |

---

## Real-Time Commands

Identical to GRBL v1.1 real-time commands (see GRBL reference). FluidNC accepts all GRBL realtime characters:

| Char / Code | Action |
|-------------|--------|
| `Ctrl-X` (0x18) | Soft-Reset |
| `?` | Status report query |
| `~` | Cycle Start / Resume |
| `!` | Feed Hold |
| 0x84 | Safety Door |
| 0x85 | Jog Cancel |
| 0x90–0x94 | Feed rate override (100%, +10%, −10%, +1%, −1%) |
| 0x95–0x97 | Rapid override (100%, 50%, 25%) |
| 0x99–0x9D | Spindle speed override (100%, +10%, −10%, +1%, −1%) |
| 0x9E | Toggle Spindle Stop (HOLD state only) |
| 0xA0 | Toggle Flood Coolant |
| 0xA1 | Toggle Mist Coolant |

---

## Status Report Format

FluidNC emits the same status report format as GRBL, triggered by `?`:

```
<Idle|MPos:0.000,0.000,0.000|Bf:15,128|FS:0,0|WCO:0.000,0.000,0.000>
```

| Field | Description |
|-------|-------------|
| Machine state | Idle, Run, Hold:0/1, Jog, Alarm, Door:0/1/2/3, Check, Home, Sleep, ConfigAlarm |
| `MPos` | Machine position |
| `WPos` | Work position (alternative to MPos) |
| `Bf` | `plannerFree,rxFree` — planner buffer free slots and RX buffer free bytes |
| `FS` | Current feed rate and spindle speed |
| `WCO` | Work coordinate offset |
| `Ov` | Override percentages: feed, rapids, spindle |
| `A` | Accessory state: S=CW spindle, C=CCW spindle, F=flood, M=mist |
| `Pn` | Active input pins |

> **Field name:** FluidNC emits `Bf:` (not `Buf:`). Both are accepted for compatibility.

---

## FluidNC Machine Configuration (YAML)

FluidNC machines are configured via a YAML file (default: `/localfs/config.yaml`). Configuration is loaded on boot; use `$Bye` or `$System/Control=RESTART` to apply changes.

### Key YAML Sections

```yaml
name: My CNC Machine
board: "ESP32 Dev Module"

axes:
  shared_stepper_disable_pin: gpio.12
  x:
    steps_per_mm: 100
    max_rate_mm_per_min: 3000
    acceleration_mm_per_sec2: 200
    max_travel_mm: 300
    homing:
      cycle: 2
      positive_direction: false
      mpos_mm: 0
      feed_mm_per_min: 200
      seek_mm_per_min: 1000
      settle_ms: 250
      seek_scaler: 1.1
      feed_scaler: 1.1

spindle:
  type: PWM
  output_pin: gpio.2
  enable_pin: gpio.4
  direction_pin: gpio.5
  pwm_freq: 5000
  speed_map: 0=0.000% 1000=100.000%

coolant:
  flood_pin: gpio.25
  mist_pin: gpio.26

probe:
  pin: gpio.32:low:pu
```

### Axis Parameters

| Parameter | Description |
|-----------|-------------|
| `steps_per_mm` | Motor steps per millimeter of travel |
| `max_rate_mm_per_min` | Maximum axis feed rate |
| `acceleration_mm_per_sec2` | Axis acceleration |
| `max_travel_mm` | Soft limit travel distance |
| `homing.cycle` | Homing cycle order (1 = first, 2 = second, etc.) |
| `homing.positive_direction` | Home toward positive limit if true |
| `homing.feed_mm_per_min` | Feed rate for precision contact |
| `homing.seek_mm_per_min` | Rapid rate for initial limit search |

### Kinematics Options

| Kinematics Type | Description |
|-----------------|-------------|
| `Cartesian` | Standard 3-axis (default) |
| `CoreXY` | CoreXY belt configuration |
| `Delta` | Delta-style machine |
| `WallPlotter` | Wall plotter / vertical plotter |

---

## FluidNC-Specific Features vs. GRBL

| Feature | GRBL v1.1 | FluidNC |
|---------|-----------|---------|
| Configuration | Recompile firmware | Edit YAML file at runtime |
| Max axes | 3 (X/Y/Z) | Up to 6 (X/Y/Z/A/B/C) |
| Motor drivers | Step/Dir only | Step/Dir + Trinamic TMC (SPI/UART) |
| Connectivity | Serial (USB) only | Serial + WiFi (STA/AP) + Bluetooth |
| WebUI | No | Built-in ESP32 WebUI |
| Spindle types | PWM | PWM, BESC, RS485 VFD, Laser, etc. |
| Tool change | No ATC support | ATC, M6 macro, manual change |
| Digital I/O | Limited | M62–M65, M66, M67, M68 |
| Macros | Startup blocks only | O-code macros + `$LocalFS/Run` |
| Homing | Single cycle | Per-axis cycle ordering |
| Kinematics | Cartesian only | Cartesian, CoreXY, Delta, WallPlotter |
| Status field | `Buf:` | `Bf:` (both accepted for compatibility) |

---

## G-Code Parameters and Expressions (FluidNC Extension)

FluidNC supports G-code parameters (named variables) and expressions, extending beyond GRBL:

### Parameter Types

| Syntax | Description |
|--------|-------------|
| `#n` | Numbered parameter (GRBL-style; e.g. `#5221` = G54 X offset) |
| `#<name>` | Named parameter |
| `#[expression]` | Computed parameter index |

### Expressions

Expressions can be used in G-code word values:
```gcode
G0 X[#<x_start> + 10.0]
#<depth> = -5.0
G1 Z#<depth> F300
```

### Predefined Parameters (selected)

| Parameter | Description |
|-----------|-------------|
| `#5221–#5223` | G54 X, Y, Z offsets |
| `#5241–#5243` | G55 X, Y, Z offsets |
| `#5391–#5393` | G59 X, Y, Z offsets |
| `#5420–#5425` | Current work position X, Y, Z, A, B, C |
| `#5070` | Last probe successful (1 = yes, 0 = no) |
| `#5061–#5066` | Last probe position X, Y, Z, A, B, C |

---

## Alarm Codes

| Code | Description |
|------|-------------|
| 1 | Hard limit triggered |
| 2 | Soft limit exceeded |
| 3 | Reset while in motion |
| 4 | Probe fail (initial state) |
| 5 | Probe fail (no contact) |
| 6 | Homing fail (reset during cycle) |
| 7 | Homing fail (door open) |
| 8 | Homing fail (cycle failed to clear limit) |
| 9 | Homing fail (limit not found in search distance) |
| 10 | Homing fail (pulloff failed to clear limit) |
| 11 | Configuration error on startup (`ConfigAlarm`) |

## Error Codes

| Code | Description |
|------|-------------|
| 1 | G-code word format error |
| 2 | Numeric value format error |
| 3 | Unrecognized `$` command |
| 4 | Negative value where positive required |
| 5 | Homing not enabled |
| 6 | Minimum step pulse time too small |
| 7 | EEPROM/NVS read failed |
| 8 | Command requires idle state |
| 9 | G-code lock (alarm or jog state) |
| 20 | Unsupported G-code command |
| 21 | Multiple G-codes from same modal group in one block |
| 22 | Feed rate not set |
| 23 | Integer value required |
| 24 | Two G-codes both requiring axis words in same block |
| 25 | Repeated G-code word in block |
| 26 | Axis words required but not found |
| 27 | Line number out of valid range |
| 28 | No axis words found |
| 29 | G2/G3 arc with zero radius |
| 32 | Probe cycle did not complete |
| 33 | G43.1 tool offset not assigned to valid axis |
