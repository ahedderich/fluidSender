%wait

%global.state.SAFE_HEIGHT = 0.
%global.state.TOOL_PARK_X_LOCATION = -250   ;-54  ;machine coordinates
%global.state.TOOL_PARK_Y_LOCATION = -909   ;-2 ;machine coordinates
%global.state.TOOL_PARK_Z_LOCATION = 0 ;machine coordinates

%global.state.PROBE_X_LOCATION = -0.   ;-54  ;machine coordinates
%global.state.PROBE_Y_LOCATION = -949.1   ;-2 ;machine coordinates
%global.state.PROBE_Z_LOCATION = -90 ;machine coordinates
%global.state.PROBE_Z_MAX = -180

%global.state.PROBE_DISTANCE = 110
%global.state.PROBE_RAPID_FEEDRATE = 600 ;mm/min

%wait

; Save modal state
%WCS = modal.wcs
%PLANE = modal.plane
%UNITS = modal.units
%DISTANCE = modal.distance
%FEEDRATE = modal.feedrate
%SPINDLE = modal.spindle
%COOLANT = modal.coolant

G21 ;metric
M5  ;Stop spindle
G90 ;Absolute positioning
G49 ;Reset Tool Offset

G53 G0 Z[global.state.SAFE_HEIGHT]
G53 X[global.state.TOOL_PARK_X_LOCATION] Y[global.state.TOOL_PARK_Y_LOCATION]
%wait
G53 Z[global.state.TOOL_PARK_Z_LOCATION]
%wait

M0 Change Tool and continue

G53 X[global.state.PROBE_X_LOCATION] Y[global.state.PROBE_Y_LOCATION]
%wait
G53 Z[global.state.PROBE_Z_LOCATION]
%wait
%global.state.PROBE_Z_BEGIN = posz

G91
G38.2 Z-[global.state.PROBE_DISTANCE] F[global.state.PROBE_RAPID_FEEDRATE]
G38.4 z1 F40	;"dial-it-in" probes
G4 P.25
G38.2 z-2 F20
G4 P.25
G38.4 z2 F10
G4 P.25
G38.2 z-2 F5
G4 P.25
G90

%global.state.PROBE_Z_END = posz
%global.state.TOOL_HEIGHT = Math.round((global.state.PROBE_Z_END - global.state.PROBE_Z_MAX + global.state.PROBE_Z_LOCATION - global.state.PROBE_Z_BEGIN) * 10000) / 10000
(PROBE_Z_LOCATION = [global.state.PROBE_Z_LOCATION])
(PROBE_Z_MAX = [global.state.PROBE_Z_MAX])
(PROBE_Z_BEGIN = [global.state.PROBE_Z_BEGIN])
(PROBE_Z_END = [global.state.PROBE_Z_END])
(TOOL_HEIGHT = [global.state.TOOL_HEIGHT])

%wait

G43.1 Z[global.state.TOOL_HEIGHT]

G91
G0 Z5
G90
G53 Z[global.state.SAFE_HEIGHT]
%wait

; Restore modal state
[WCS] [PLANE] [UNITS] [DISTANCE] [FEEDRATE] [SPINDLE] [COOLANT]
