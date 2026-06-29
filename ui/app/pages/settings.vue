<template>
  <main class="flex-1 flex min-h-0 overflow-hidden">

    <!-- Sidebar: machine list + app settings nav -->
    <aside class="w-64 flex-none flex flex-col border-r border-gray-200 dark:border-slate-700">
      <div class="px-4 py-3.5 border-b border-gray-200 dark:border-slate-700">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-slate-100">Settings</h2>
      </div>

      <div class="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 px-2 pb-1.5">
          Machines
        </p>

        <button
          v-for="m in s.machines"
          :key="m.id"
          type="button"
          @click="openMachine(m.id)"
          class="w-full text-left px-2.5 py-2.5 rounded-lg transition-colors"
          :class="panel === m.id
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50'"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="isMachineConnected(m.id) ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-slate-600'"
            />
            <span class="text-sm font-medium truncate">{{ m.name }}</span>
          </div>
          <div class="text-xs text-gray-400 dark:text-slate-500 mt-0.5 ml-4 truncate">
            <template v-if="m.connection.type === 'usb'">
              USB · {{ m.connection.serialPort || 'no port' }}
            </template>
            <template v-else>
              TCP · {{ m.connection.tcpHost || 'no host' }}
            </template>
          </div>
        </button>

        <button
          type="button"
          @click="addMachine"
          class="w-full text-left flex items-center gap-2 px-2.5 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors mt-1"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Machine
        </button>
      </div>

      <div class="border-t border-gray-200 dark:border-slate-700 p-2">
        <button
          type="button"
          @click="panel = 'app'"
          class="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors"
          :class="panel === 'app'
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50'"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          App Settings
        </button>
      </div>
    </aside>

    <!-- Right panel -->
    <section class="flex-1 overflow-y-auto">

      <!-- ── No machines yet ── -->
      <div v-if="!editingMachine && panel !== 'app'" class="flex-1 flex items-center justify-center p-8">
        <div class="text-center max-w-xs">
          <div class="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-5">
            <svg class="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100 mb-2">Add your first machine</h2>
          <p class="text-sm text-gray-500 dark:text-slate-400 mb-6 leading-relaxed">
            Configure a connection to your FluidNC controller to get started.
          </p>
          <button
            type="button"
            @click="addMachine"
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Add Machine
          </button>
        </div>
      </div>

      <!-- ── Machine Settings ── -->
      <div v-else-if="editingMachine" class="p-5 space-y-4 max-w-3xl">

        <!-- Machine header -->
        <div class="flex items-start justify-between">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100">{{ editingMachine.name }}</h2>
            <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Machine configuration</p>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-xs px-2 py-1 rounded-full font-medium"
              :class="isEditingConnected
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'"
            >{{ isEditingConnected ? 'Connected' : 'Offline' }}</span>
            <button
              type="button"
              @click="removeMachine(editingMachine.id)"
              class="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Remove machine"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Machine tabs -->
        <div class="flex gap-0 border-b border-gray-200 dark:border-slate-700">
          <button
            v-for="tab in machineTabs"
            :key="tab.key"
            type="button"
            @click="machineTab = tab.key"
            class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            :class="machineTab === tab.key
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab: FluidSender Settings -->
        <template v-if="machineTab === 'fluidSender'">
          <SettingsCard title="Profile">
            <SettingsRow label="Machine Name">
              <input v-model="editingMachine.name" type="text" class="settings-input w-48" />
            </SettingsRow>
            <SettingsRow label="Machine Type">
              <select v-model="editingMachine.type" class="settings-input w-48">
                <option value="router">CNC Router</option>
                <option value="laser">Laser Engraver</option>
                <option value="plasma">Plasma Cutter</option>
              </select>
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="Tool Magazine">
            <SettingsRow label="Enable Magazine">
              <ToggleSwitch v-model="editingMachine.magazine.enabled" />
            </SettingsRow>
            <template v-if="editingMachine.magazine.enabled">
              <SettingsRow label="Slots">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.magazine.size" type="number" min="1" max="32" class="settings-input w-20 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">pockets</span>
                </div>
              </SettingsRow>
            </template>
          </SettingsCard>

          <SettingsCard title="Connection">
            <SettingsRow label="Type">
              <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
                <button
                  type="button"
                  @click="editingMachine.connection.type = 'usb'"
                  :class="editingMachine.connection.type === 'usb' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="px-3 py-1.5 transition-colors"
                >USB Serial</button>
                <button
                  type="button"
                  @click="editingMachine.connection.type = 'tcp'"
                  :class="editingMachine.connection.type === 'tcp' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600"
                >TCP / WiFi</button>
              </div>
            </SettingsRow>
            <template v-if="editingMachine.connection.type === 'usb'">
              <SettingsRow label="Serial Port">
                <input v-model="editingMachine.connection.serialPort" type="text" class="settings-input w-48 font-mono" placeholder="/dev/ttyUSB0" />
              </SettingsRow>
              <SettingsRow label="Baud Rate">
                <select v-model.number="editingMachine.connection.baudRate" class="settings-input w-32">
                  <option :value="115200">115 200</option>
                  <option :value="921600">921 600</option>
                </select>
              </SettingsRow>
            </template>
            <template v-else>
              <div class="mx-3 mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-md">
                <p class="text-xs text-amber-700 dark:text-amber-400 font-medium">TCP/WiFi is less stable than USB. Use USB when possible.</p>
              </div>
              <SettingsRow label="Host">
                <input v-model="editingMachine.connection.tcpHost" type="text" class="settings-input w-48 font-mono" placeholder="192.168.1.100" />
              </SettingsRow>
              <SettingsRow label="Port">
                <input v-model.number="editingMachine.connection.tcpPort" type="number" class="settings-input w-24 font-mono" />
              </SettingsRow>
            </template>
          </SettingsCard>

          <SettingsCard title="Quick Macros">
            <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
              <div
                v-for="macro in editingMachine.macros"
                :key="macro.id"
                class="flex items-center gap-3 px-3 py-2.5"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{{ macro.label }}</p>
                  <p class="text-xs font-mono text-gray-400 dark:text-slate-500 truncate">{{ macro.command }}</p>
                </div>
                <button
                  type="button"
                  @click="s.removeMachineMacro(editingMachine.id, macro.id)"
                  class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors shrink-0"
                  title="Remove macro"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div v-if="editingMachine.macros.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
                No machine macros configured
              </div>
            </div>
            <div class="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-slate-700/60 space-y-2">
              <div class="flex gap-2">
                <input
                  v-model="newMachineMacro.label"
                  type="text"
                  class="settings-input flex-1 min-w-0"
                  placeholder="Label"
                />
                <input
                  v-model="newMachineMacro.command"
                  type="text"
                  class="settings-input flex-1 min-w-0 font-mono"
                  placeholder="G-code command"
                />
                <button
                  type="button"
                  @click="submitNewMachineMacro"
                  class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors shrink-0"
                >
                  Add
                </button>
              </div>
              <p v-if="newMachineMacroError" class="text-xs text-red-500 dark:text-red-400">{{ newMachineMacroError }}</p>
            </div>
          </SettingsCard>

          <SettingsCard title="Tool Change Macro">
            <div class="px-3 py-2 text-xs text-gray-500 dark:text-slate-400 leading-relaxed">
              Runs automatically before each tool change (T M6 or standalone T). Leave empty to pause and wait for manual confirmation only.
            </div>
            <div class="px-3 pb-3">
              <textarea
                v-model="editingMachine.toolChangeMacro"
                rows="5"
                placeholder="G0 Z20&#10;G28 G91 Z0&#10;G90"
                class="w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              />
            </div>
          </SettingsCard>

          <SettingsCard title="Probing">
            <SettingsRow label="Probe Plate Thickness">
              <div class="flex items-center gap-1.5">
                <input v-model.number="editingMachine.probe.plateThickness" type="number" min="0" step="0.1" class="settings-input w-24 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Tool Setter Height">
              <div class="flex items-center gap-1.5">
                <input v-model.number="editingMachine.probe.toolSetterHeight" type="number" min="0" step="0.1" class="settings-input w-24 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Probe Tip Diameter">
              <div class="flex items-center gap-1.5">
                <input v-model.number="editingMachine.probe.tipDiameter" type="number" min="0" step="0.1" class="settings-input w-24 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
              </div>
            </SettingsRow>
            <SettingsRow label="XY Probe Feed">
              <div class="flex items-center gap-1.5">
                <input v-model.number="editingMachine.probe.xyFeed" type="number" min="1" class="settings-input w-24 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Z Probe Feed">
              <div class="flex items-center gap-1.5">
                <input v-model.number="editingMachine.probe.zFeed" type="number" min="1" class="settings-input w-24 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
              </div>
            </SettingsRow>
          </SettingsCard>
        </template>

        <!-- Tab: Firmware Config -->
        <template v-else-if="machineTab === 'firmware'">
          <div v-if="!editingMachine.fluidncConfig" class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-8 text-center">
            <p class="text-sm text-gray-400 dark:text-slate-500">Connect to load firmware configuration</p>
          </div>

          <template v-else>
            <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Motion &amp; Kinematics</p>

            <SettingsCard title="Machine Identity" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Board">
                <input v-model="editingMachine.fluidncConfig.board" type="text" class="settings-input w-48 font-mono" />
              </SettingsRow>
              <SettingsRow label="Report Units">
                <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
                  <button
                    type="button"
                    @click="editingMachine.fluidncConfig.reportInches = false"
                    :class="!editingMachine.fluidncConfig.reportInches ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                    class="px-3 py-1.5 transition-colors"
                  >mm</button>
                  <button
                    type="button"
                    @click="editingMachine.fluidncConfig.reportInches = true"
                    :class="editingMachine.fluidncConfig.reportInches ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                    class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600"
                  >inch</button>
                </div>
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Stepping Engine" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Engine">
                <select v-model="editingMachine.fluidncConfig.stepping.engine" class="settings-input w-40">
                  <option value="RMT">RMT</option>
                  <option value="I2S_STREAM">I2S Stream</option>
                  <option value="I2S_STATIC">I2S Static</option>
                  <option value="STEPSTICK">StepStick</option>
                  <option value="NONE">None</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Motor Idle">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.stepping.idleMs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Step Pulse">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.stepping.pulseUs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Dir Delay">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.stepping.dirDelayUs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Disable Delay">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.stepping.disableDelayUs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
                </div>
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Axes" :fluidnc-config="true" :disabled="!isEditingConnected">
              <div class="px-3 pb-2">
                <div class="grid text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1 gap-2 items-center"
                  style="grid-template-columns: 2rem 1fr 1fr 1fr 1fr auto auto">
                  <span />
                  <span>Steps/mm</span>
                  <span>Travel mm</span>
                  <span>Rate mm/min</span>
                  <span>Accel mm/s²</span>
                  <span class="text-center">Soft Lim</span>
                  <span class="text-center">Idle Off</span>
                </div>
                <div
                  v-for="(axis, key) in editingMachine.fluidncConfig.axes"
                  :key="key"
                  class="grid items-center gap-2 py-1.5 border-t border-gray-100 dark:border-slate-700/60"
                  style="grid-template-columns: 2rem 1fr 1fr 1fr 1fr auto auto"
                >
                  <span class="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">{{ String(key).toUpperCase() }}</span>
                  <input v-model.number="axis.stepsPerMm" type="number" min="0.001" step="0.001" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.maxTravelMm" type="number" min="0.1" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.maxRateMmPerMin" type="number" min="1" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.accelerationMmPerSec2" type="number" min="0.001" class="settings-input-sm font-mono" />
                  <ToggleSwitch v-model="axis.softLimits" />
                  <ToggleSwitch v-model="axis.idleDisable" />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Homing" :fluidnc-config="true" :disabled="!isEditingConnected">
              <div class="px-3 pb-2">
                <p class="text-[10px] text-gray-400 dark:text-slate-500 mb-1.5">Cycle 0 = axis skipped during $H</p>
                <div class="grid text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1 gap-2 items-center"
                  style="grid-template-columns: 2rem 3rem auto 1fr 1fr 1fr 3rem">
                  <span />
                  <span>Cycle</span>
                  <span>Direction</span>
                  <span>Seek mm/min</span>
                  <span>Feed mm/min</span>
                  <span>Pulloff mm</span>
                  <span>Settle ms</span>
                </div>
                <div
                  v-for="(axis, key) in editingMachine.fluidncConfig.axes"
                  :key="key"
                  class="grid items-center gap-2 py-1.5 border-t border-gray-100 dark:border-slate-700/60"
                  style="grid-template-columns: 2rem 3rem auto 1fr 1fr 1fr 3rem"
                >
                  <span class="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">{{ String(key).toUpperCase() }}</span>
                  <input v-model.number="axis.homing.cycle" type="number" min="0" max="6" class="settings-input-sm font-mono" />
                  <select v-model="axis.homing.positiveDirection" class="settings-input-sm">
                    <option :value="false">← neg</option>
                    <option :value="true">+ pos</option>
                  </select>
                  <input v-model.number="axis.homing.seekRate" type="number" min="1" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.homing.feedRate" type="number" min="1" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.motor0.pulloffMm" type="number" min="0" step="0.1" class="settings-input-sm font-mono" />
                  <input v-model.number="axis.homing.settleMs" type="number" min="0" class="settings-input-sm font-mono" />
                </div>
              </div>
            </SettingsCard>

            <SettingsCard title="Limit Switches" :fluidnc-config="true" :disabled="!isEditingConnected">
              <div class="px-3 pb-2">
                <div class="grid text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500 mb-1 gap-2 items-center"
                  style="grid-template-columns: 2rem 1fr 1fr auto 1fr">
                  <span />
                  <span>Neg Pin</span>
                  <span>Pos Pin</span>
                  <span class="text-center">Hard Lim</span>
                  <span>Pulloff mm</span>
                </div>
                <div
                  v-for="(axis, key) in editingMachine.fluidncConfig.axes"
                  :key="key"
                  class="grid items-center gap-2 py-1.5 border-t border-gray-100 dark:border-slate-700/60"
                  style="grid-template-columns: 2rem 1fr 1fr auto 1fr"
                >
                  <span class="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">{{ String(key).toUpperCase() }}</span>
                  <input v-model="axis.motor0.limitNegPin" type="text" class="settings-input-sm font-mono" placeholder="NO_PIN" />
                  <input v-model="axis.motor0.limitPosPin" type="text" class="settings-input-sm font-mono" placeholder="NO_PIN" />
                  <ToggleSwitch v-model="axis.motor0.hardLimits" />
                  <input v-model.number="axis.motor0.pulloffMm" type="number" min="0" step="0.1" class="settings-input-sm font-mono" />
                </div>
              </div>
            </SettingsCard>

            <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 pt-1">I/O &amp; Peripherals</p>

            <SettingsCard title="Spindle" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Type">
                <select v-model="editingMachine.fluidncConfig.spindle.type" class="settings-input w-48">
                  <option value="PWMSpindle">PWM Spindle</option>
                  <option value="Laser">Laser</option>
                  <option value="NoSpindle">No Spindle</option>
                  <option value="BESC">BESC</option>
                  <option value="10V">0–10V</option>
                  <option value="DAC">DAC</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Output Pin">
                <input v-model="editingMachine.fluidncConfig.spindle.outputPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Enable Pin">
                <input v-model="editingMachine.fluidncConfig.spindle.enablePin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Direction Pin">
                <input v-model="editingMachine.fluidncConfig.spindle.directionPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="PWM Frequency">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.spindle.pwmFreq" type="number" min="1" class="settings-input w-28 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">Hz</span>
                </div>
              </SettingsRow>
              <SettingsRow :label="editingMachine.fluidncConfig.spindle.type === 'Laser' ? 'Min Power (%)' : 'Min RPM'">
                <input v-model.number="editingMachine.fluidncConfig.spindle.minRpm" type="number" min="0" class="settings-input w-28 font-mono" />
              </SettingsRow>
              <SettingsRow :label="editingMachine.fluidncConfig.spindle.type === 'Laser' ? 'Max Power (%)' : 'Max RPM'">
                <input v-model.number="editingMachine.fluidncConfig.spindle.maxRpm" type="number" min="0" class="settings-input w-28 font-mono" />
              </SettingsRow>
              <SettingsRow label="Spinup Delay">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.spindle.spinupMs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Spindown Delay">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.spindle.spindownMs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Disable with zero speed">
                <ToggleSwitch v-model="editingMachine.fluidncConfig.spindle.disableWithZeroSpeed" />
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Probe" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Probe Pin">
                <input v-model="editingMachine.fluidncConfig.probe.pin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Toolsetter Pin">
                <input v-model="editingMachine.fluidncConfig.probe.toolsetterPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Check Mode Start">
                <ToggleSwitch v-model="editingMachine.fluidncConfig.probe.checkModeStart" />
              </SettingsRow>
              <SettingsRow label="Hard Stop">
                <ToggleSwitch v-model="editingMachine.fluidncConfig.probe.hardStop" />
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Coolant" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Flood Pin">
                <input v-model="editingMachine.fluidncConfig.coolant.floodPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Mist Pin">
                <input v-model="editingMachine.fluidncConfig.coolant.mistPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Delay">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.coolant.delayMs" type="number" min="0" class="settings-input w-24 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
                </div>
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Control Pins" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Safety Door">
                <input v-model="editingMachine.fluidncConfig.control.safetyDoorPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Reset">
                <input v-model="editingMachine.fluidncConfig.control.resetPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Feed Hold">
                <input v-model="editingMachine.fluidncConfig.control.feedHoldPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
              <SettingsRow label="Cycle Start">
                <input v-model="editingMachine.fluidncConfig.control.cycleStartPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
              </SettingsRow>
            </SettingsCard>

            <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 pt-1">Behavior</p>

            <SettingsCard title="Start Behavior" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Must Home on Start">
                <ToggleSwitch v-model="editingMachine.fluidncConfig.start.mustHome" />
              </SettingsRow>
              <SettingsRow label="Check Limits on Start">
                <ToggleSwitch v-model="editingMachine.fluidncConfig.start.checkLimits" />
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Macros" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Startup Line 1">
                <input v-model="editingMachine.fluidncConfig.macros.startupLine0" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
              </SettingsRow>
              <SettingsRow label="Startup Line 2">
                <input v-model="editingMachine.fluidncConfig.macros.startupLine1" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
              </SettingsRow>
              <SettingsRow label="After Homing">
                <input v-model="editingMachine.fluidncConfig.macros.afterHoming" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
              </SettingsRow>
              <SettingsRow label="After Reset">
                <input v-model="editingMachine.fluidncConfig.macros.afterReset" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
              </SettingsRow>
              <SettingsRow label="After Unlock">
                <input v-model="editingMachine.fluidncConfig.macros.afterUnlock" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
              </SettingsRow>
            </SettingsCard>

            <SettingsCard title="Performance" :fluidnc-config="true" :disabled="!isEditingConnected">
              <SettingsRow label="Arc Tolerance">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.arcToleranceMm" type="number" min="0" step="0.001" class="settings-input w-28 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Junction Deviation">
                <div class="flex items-center gap-1.5">
                  <input v-model.number="editingMachine.fluidncConfig.junctionDeviationMm" type="number" min="0" step="0.001" class="settings-input w-28 font-mono" />
                  <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
                </div>
              </SettingsRow>
              <SettingsRow label="Planner Blocks">
                <input v-model.number="editingMachine.fluidncConfig.plannerBlocks" type="number" min="1" max="128" class="settings-input w-24 font-mono" />
              </SettingsRow>
            </SettingsCard>

            <!-- FluidNC actions -->
            <div class="flex gap-2 pb-2">
              <button
                type="button"
                :disabled="!isEditingConnected"
                @click="writeToFluidNC"
                class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                :class="isEditingConnected ? 'hover:bg-blue-500' : 'opacity-40 cursor-not-allowed'"
              >
                Write to FluidNC
              </button>
              <button
                type="button"
                :disabled="!isEditingConnected"
                class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="isEditingConnected
                  ? 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40 cursor-not-allowed'"
              >
                Read from FluidNC
              </button>
            </div>
          </template>
        </template>

        <!-- Save Machine Settings -->
        <div class="pb-2 pt-1">
          <button
            type="button"
            @click="saveMachineSettings"
            :disabled="s.saving"
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ s.saving ? 'Saving…' : 'Save Machine Settings' }}
          </button>
          <p v-if="saveError" class="mt-2 text-xs text-red-500 dark:text-red-400 text-center">{{ saveError }}</p>
          <p v-if="saveSuccess" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400 text-center">Settings saved.</p>
        </div>
      </div>

      <!-- ── App Settings ── -->
      <div v-else-if="panel === 'app'" class="p-5 space-y-4 max-w-2xl">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-slate-100">App Settings</h2>
          <p class="text-xs text-gray-500 dark:text-slate-400 mt-0.5">Synced to all connected clients via Bun server</p>
        </div>

        <!-- App tabs -->
        <div class="flex gap-0 border-b border-gray-200 dark:border-slate-700">
          <button
            v-for="tab in appTabs"
            :key="tab.key"
            type="button"
            @click="appTab = tab.key"
            class="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors"
            :class="appTab === tab.key
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab: Interface -->
        <template v-if="appTab === 'interface'">
          <SettingsCard title="Interface">
            <SettingsRow label="Theme">
              <button
                type="button"
                @click="ui.toggleDarkMode()"
                class="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-md text-sm font-medium transition-colors"
              >
                <svg v-if="ui.darkMode" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                {{ ui.darkMode ? 'Switch to Light' : 'Switch to Dark' }}
              </button>
            </SettingsRow>
            <SettingsRow label="Units">
              <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
                <button type="button" @click="s.app.units = 'mm'"
                  :class="s.app.units === 'mm' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="px-3 py-1.5 transition-colors">mm</button>
                <button type="button" @click="s.app.units = 'inch'"
                  :class="s.app.units === 'inch' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
                  class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600">inch</button>
              </div>
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="Viewport Defaults">
            <SettingsRow label="Default View">
              <select v-model="s.app.viewport.defaultView" class="settings-input w-36">
                <option value="iso">Isometric</option>
                <option value="top">Top</option>
                <option value="front">Front</option>
                <option value="right">Right</option>
              </select>
            </SettingsRow>
            <SettingsRow label="Show Grid">
              <ToggleSwitch v-model="s.app.viewport.showGrid" />
            </SettingsRow>
            <SettingsRow label="Show Axes">
              <ToggleSwitch v-model="s.app.viewport.showAxes" />
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="About">
            <SettingsRow label="FluidSender">
              <span class="text-sm text-gray-600 dark:text-slate-400 font-mono">v0.1.0-dev</span>
            </SettingsRow>
            <SettingsRow label="FluidNC Protocol">
              <span class="text-sm text-gray-600 dark:text-slate-400 font-mono">v3.7+</span>
            </SettingsRow>
          </SettingsCard>
        </template>

        <!-- Tab: Jog & Motion -->
        <template v-else-if="appTab === 'jog'">
          <SettingsCard title="Speed Presets">
            <SettingsRow label="Slow">
              <div class="flex items-center gap-1.5">
                <input v-model.number="s.app.jog.slowSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Medium">
              <div class="flex items-center gap-1.5">
                <input v-model.number="s.app.jog.mediumSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Fast">
              <div class="flex items-center gap-1.5">
                <input v-model.number="s.app.jog.fastSpeed" type="number" min="1" class="settings-input w-28 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm/min</span>
              </div>
            </SettingsRow>
          </SettingsCard>

          <SettingsCard title="Step Size">
            <SettingsRow label="XY Step">
              <div class="flex items-center gap-1.5">
                <input v-model.number="s.app.jog.xyStep" type="number" min="0.001" step="0.1" class="settings-input w-28 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm / press</span>
              </div>
            </SettingsRow>
            <SettingsRow label="Z Step">
              <div class="flex items-center gap-1.5">
                <input v-model.number="s.app.jog.zStep" type="number" min="0.001" step="0.1" class="settings-input w-28 font-mono" />
                <span class="text-xs text-gray-400 dark:text-slate-500">mm / press</span>
              </div>
            </SettingsRow>
          </SettingsCard>
        </template>

        <!-- Tab: Macros -->
        <template v-else-if="appTab === 'macros'">
          <SettingsCard title="App Macros">
            <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
              <div
                v-for="macro in s.app.macros"
                :key="macro.id"
                class="flex items-center gap-3 px-3 py-2.5"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{{ macro.label }}</p>
                  <p class="text-xs font-mono text-gray-400 dark:text-slate-500 truncate">{{ macro.command }}</p>
                </div>
                <button
                  type="button"
                  @click="s.removeAppMacro(macro.id)"
                  class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors shrink-0"
                  title="Remove macro"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div v-if="s.app.macros.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
                No app macros configured
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Add App Macro">
            <SettingsRow label="Label">
              <input v-model="newAppMacro.label" type="text" class="settings-input w-48" placeholder="Spindle On" />
            </SettingsRow>
            <SettingsRow label="Command">
              <input v-model="newAppMacro.command" type="text" class="settings-input w-56 font-mono" placeholder="M3 S8000" />
            </SettingsRow>
            <div class="px-3 pb-3 pt-1">
              <p v-if="newAppMacroError" class="text-xs text-red-500 dark:text-red-400 mb-2">{{ newAppMacroError }}</p>
              <button
                type="button"
                @click="submitNewAppMacro"
                class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
              >
                Add Macro
              </button>
            </div>
          </SettingsCard>

          <p class="text-xs text-gray-400 dark:text-slate-500 pb-2">
            App macros are shared across all machines and available to all connected clients.
          </p>
        </template>

        <!-- Tab: Authentication -->
        <template v-else-if="appTab === 'auth'">
          <SettingsCard title="Authentication">
            <SettingsRow label="Require Login">
              <ToggleSwitch v-model="s.app.auth.enabled" />
            </SettingsRow>
          </SettingsCard>

          <template v-if="s.app.auth.enabled">
            <SettingsCard title="Users">
              <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
                <div
                  v-for="user in s.app.auth.users"
                  :key="user.id"
                  class="flex items-center gap-3 px-3 py-2.5"
                >
                  <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-gray-900 dark:text-slate-100">{{ user.username }}</span>
                  </div>
                  <span
                    class="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize shrink-0"
                    :class="{
                      'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400': user.role === 'viewer',
                      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300': user.role === 'operator',
                      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400': user.role === 'admin',
                    }"
                  >{{ user.role }}</span>
                  <button
                    type="button"
                    @click="removeUser(user)"
                    :disabled="user.role === 'admin' && s.app.auth.users.filter(u => u.role === 'admin').length <= 1"
                    class="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove user"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div v-if="s.app.auth.users.length === 0" class="px-3 py-4 text-center text-xs text-gray-400 dark:text-slate-500">
                  No users configured
                </div>
              </div>
            </SettingsCard>

            <!-- Add new user -->
            <SettingsCard title="Add User">
              <SettingsRow label="Username">
                <input v-model="newUser.username" type="text" class="settings-input w-48" placeholder="username" autocomplete="off" />
              </SettingsRow>
              <SettingsRow label="Role">
                <select v-model="newUser.role" class="settings-input w-36">
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
              </SettingsRow>
              <SettingsRow label="Password">
                <input v-model="newUser.password" type="password" class="settings-input w-48" placeholder="Password" autocomplete="new-password" />
              </SettingsRow>
              <SettingsRow label="Confirm">
                <input v-model="newUser.confirm" type="password" class="settings-input w-48" placeholder="Confirm password" autocomplete="new-password" />
              </SettingsRow>
              <div class="px-3 pb-3 pt-1">
                <p v-if="newUserError" class="text-xs text-red-500 dark:text-red-400 mb-2">{{ newUserError }}</p>
                <button
                  type="button"
                  @click="submitNewUser"
                  class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
                >
                  Add User
                </button>
              </div>
            </SettingsCard>

            <!-- Role descriptions -->
            <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div class="px-3 py-2 border-b border-gray-100 dark:border-slate-700/60">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Role Permissions</h3>
              </div>
              <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
                <div v-for="role in roleDescriptions" :key="role.name" class="flex items-start gap-3 px-3 py-2.5">
                  <span
                    class="text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize mt-0.5 shrink-0"
                    :class="{
                      'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400': role.name === 'viewer',
                      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300': role.name === 'operator',
                      'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400': role.name === 'admin',
                    }"
                  >{{ role.name }}</span>
                  <p class="text-xs text-gray-500 dark:text-slate-400 leading-relaxed">{{ role.description }}</p>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- Tab: Shortcuts -->
        <template v-else-if="appTab === 'shortcuts'">
          <div
            v-for="group in shortcutGroups"
            :key="group.label"
          >
            <SettingsCard :title="group.label">
              <div class="divide-y divide-gray-100 dark:divide-slate-700/60">
                <div
                  v-for="action in group.actions"
                  :key="action.key"
                  class="flex items-center gap-3 px-3 py-2"
                >
                  <span class="flex-1 text-sm text-gray-700 dark:text-slate-300">{{ action.label }}</span>
                  <button
                    type="button"
                    @click="startRecording(action.key)"
                    class="min-w-[7rem] text-center px-3 py-1.5 rounded-md text-xs font-mono transition-colors border"
                    :class="recordingKey === action.key
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 animate-pulse'
                      : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500'"
                  >
                    {{ recordingKey === action.key ? 'Press a key…' : formatShortcut(s.app.shortcuts[action.key as keyof typeof s.app.shortcuts]) }}
                  </button>
                  <button
                    type="button"
                    @click="clearShortcut(action.key)"
                    class="p-1 text-gray-300 dark:text-slate-600 hover:text-gray-500 dark:hover:text-slate-400 rounded transition-colors"
                    title="Clear shortcut"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </SettingsCard>
          </div>

          <p class="text-xs text-gray-400 dark:text-slate-500 pb-2">
            Click a shortcut to record a new key binding. Modifier keys (Ctrl, Alt, Shift) can be combined.
          </p>
        </template>

        <div class="pb-2">
          <button
            type="button"
            @click="saveAppSettings"
            :disabled="s.saving"
            class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {{ s.saving ? 'Saving…' : 'Save App Settings' }}
          </button>
          <p v-if="saveSuccess" class="mt-2 text-xs text-emerald-600 dark:text-emerald-400 text-center">Settings saved.</p>
        </div>
      </div>

    </section>
  </main>
</template>

<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'
import { useUiStore } from '~/stores/ui'
import { useMachineStore } from '~/stores/machine'
import { useConfirm } from '~/composables/useConfirm'
import type { UserRole } from '~/stores/settings'

const s = useSettingsStore()
const ui = useUiStore()
const machine = useMachineStore()
const { confirm } = useConfirm()

// Which sidebar panel is shown: a machine id or 'app'
const panel = ref<string>(s.activeMachineId || (s.machines[0]?.id ?? ''))

const editingMachine = computed(() => {
  if (panel.value === 'app') return null
  return s.machines.find((m) => m.id === panel.value) ?? null
})

const isEditingConnected = computed(
  () => machine.connected && editingMachine.value?.id === s.activeMachineId,
)

function isMachineConnected(id: string): boolean {
  return machine.connected && machine.connectedMachineId === id
}

function openMachine(id: string) {
  panel.value = id
}

function addMachine() {
  s.addMachine()
  panel.value = s.activeMachineId
}

async function removeMachine(id: string) {
  const m = s.machines.find((mc) => mc.id === id)
  const ok = await confirm({
    title: `Remove "${m?.name ?? 'machine'}"?`,
    message: 'This will permanently delete the machine profile and all its settings.',
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  s.removeMachine(id)
  await s.save()
  panel.value = s.activeMachineId || ''
}

const saveError = ref('')
const saveSuccess = ref(false)
let saveSuccessTimer: ReturnType<typeof setTimeout> | null = null

async function saveMachineSettings() {
  saveError.value = ''
  saveSuccess.value = false
  try {
    await s.save()
    saveSuccess.value = true
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch {
    saveError.value = 'Failed to save settings. Check server connection.'
  }
}

async function saveAppSettings() {
  saveError.value = ''
  saveSuccess.value = false
  try {
    await s.save()
    saveSuccess.value = true
    if (saveSuccessTimer) clearTimeout(saveSuccessTimer)
    saveSuccessTimer = setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch {
    saveError.value = 'Failed to save settings.'
  }
}

async function writeToFluidNC() {
  const ok = await confirm({
    title: 'Write configuration to FluidNC?',
    message: 'This will overwrite the firmware settings on the connected controller. The machine will apply changes immediately.',
    confirmLabel: 'Write',
  })
  if (!ok) return
  // TODO: send config to firmware
}

async function removeUser(user: { id: string; username: string }) {
  const ok = await confirm({
    title: `Remove user "${user.username}"?`,
    message: 'The user will immediately lose access to this application.',
    confirmLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  s.removeUser(user.id)
}

// ─── Machine tabs ─────────────────────────────────────────────────────────────

const machineTabs = [
  { key: 'fluidSender', label: 'FluidSender' },
  { key: 'firmware', label: 'Firmware Config' },
]
const machineTab = ref<'fluidSender' | 'firmware'>('fluidSender')

// ─── App tabs ─────────────────────────────────────────────────────────────────

const appTabs = [
  { key: 'interface', label: 'Interface' },
  { key: 'jog', label: 'Jog & Motion' },
  { key: 'macros', label: 'Macros' },
  { key: 'auth', label: 'Authentication' },
  { key: 'shortcuts', label: 'Shortcuts' },
]
const appTab = ref<'interface' | 'jog' | 'macros' | 'auth' | 'shortcuts'>('interface')

// ─── User management ──────────────────────────────────────────────────────────

// ─── Macro management ─────────────────────────────────────────────────────────

const newAppMacro = reactive({ label: '', command: '' })
const newAppMacroError = ref('')

function submitNewAppMacro() {
  newAppMacroError.value = ''
  if (!newAppMacro.label.trim()) { newAppMacroError.value = 'Label is required.'; return }
  if (!newAppMacro.command.trim()) { newAppMacroError.value = 'Command is required.'; return }
  s.addAppMacro(newAppMacro.label.trim(), newAppMacro.command.trim())
  newAppMacro.label = ''
  newAppMacro.command = ''
}

const newMachineMacro = reactive({ label: '', command: '' })
const newMachineMacroError = ref('')

function submitNewMachineMacro() {
  if (!editingMachine.value) return
  newMachineMacroError.value = ''
  if (!newMachineMacro.label.trim()) { newMachineMacroError.value = 'Label is required.'; return }
  if (!newMachineMacro.command.trim()) { newMachineMacroError.value = 'Command is required.'; return }
  s.addMachineMacro(editingMachine.value.id, newMachineMacro.label.trim(), newMachineMacro.command.trim())
  newMachineMacro.label = ''
  newMachineMacro.command = ''
}

// ─── User management ──────────────────────────────────────────────────────────

const newUser = reactive({ username: '', role: 'operator' as UserRole, password: '', confirm: '' })
const newUserError = ref('')

function submitNewUser() {
  newUserError.value = ''
  if (!newUser.username.trim()) {
    newUserError.value = 'Username is required.'
    return
  }
  if (s.app.auth.users.some((u) => u.username === newUser.username.trim())) {
    newUserError.value = 'Username already exists.'
    return
  }
  if (!newUser.password) {
    newUserError.value = 'Password is required.'
    return
  }
  if (newUser.password !== newUser.confirm) {
    newUserError.value = 'Passwords do not match.'
    return
  }
  s.addUser(newUser.username.trim(), newUser.role)
  newUser.username = ''
  newUser.password = ''
  newUser.confirm = ''
  newUser.role = 'operator'
}

const roleDescriptions = [
  { name: 'viewer', description: 'Can view machine state, position, and job progress. Cannot send commands or navigate.' },
  { name: 'operator', description: 'Can jog, run jobs, use probing, and adjust overrides. Cannot manage users or authentication settings.' },
  { name: 'admin', description: 'Full access including user management, authentication settings, and firmware configuration.' },
]

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

const shortcutGroups = [
  {
    label: 'Jogging',
    actions: [
      { key: 'jogXPos', label: 'Jog X+' },
      { key: 'jogXNeg', label: 'Jog X-' },
      { key: 'jogYPos', label: 'Jog Y+' },
      { key: 'jogYNeg', label: 'Jog Y-' },
      { key: 'jogZPos', label: 'Jog Z+' },
      { key: 'jogZNeg', label: 'Jog Z-' },
    ],
  },
  {
    label: 'Machine Control',
    actions: [
      { key: 'feedHold', label: 'Feed Hold' },
      { key: 'cycleStart', label: 'Cycle Start / Resume' },
      { key: 'softReset', label: 'Soft Reset' },
      { key: 'home', label: 'Run Home Cycle' },
    ],
  },
  {
    label: 'Speed',
    actions: [
      { key: 'speedSlow', label: 'Speed: Slow' },
      { key: 'speedMedium', label: 'Speed: Medium' },
      { key: 'speedFast', label: 'Speed: Fast' },
    ],
  },
]

const recordingKey = ref<string | null>(null)

function startRecording(key: string) {
  recordingKey.value = key
}

function formatShortcut(binding: string): string {
  if (!binding) return '—'
  return binding
    .replace('ctrl+', 'Ctrl+')
    .replace('alt+', 'Alt+')
    .replace('shift+', 'Shift+')
}

function clearShortcut(key: string) {
  ;(s.app.shortcuts as Record<string, string>)[key] = ''
}

function onKeyDown(e: KeyboardEvent) {
  if (!recordingKey.value) return

  // Ignore lone modifier presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

  e.preventDefault()
  e.stopPropagation()

  const parts: string[] = []
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(e.key)

  ;(s.app.shortcuts as Record<string, string>)[recordingKey.value] = parts.join('+')
  recordingKey.value = null
}

function onClickOutside() {
  recordingKey.value = null
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('click', onClickOutside)
})
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.settings-input {
  @apply bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100 text-sm px-2 py-1.5 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500;
}
.settings-input-sm {
  @apply bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100 text-xs px-1.5 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-full;
}
</style>
