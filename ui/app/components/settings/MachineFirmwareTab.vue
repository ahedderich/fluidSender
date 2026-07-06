<template>
  <div v-if="!machine.fluidncConfig" class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-8 text-center space-y-3">
    <p class="text-sm text-gray-400 dark:text-slate-500">Connect to load firmware configuration</p>
    <button
      v-if="isConnected"
      type="button"
      @click="machineStore.reloadFirmwareConfig()"
      class="px-4 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 transition-colors"
    >
      Load from FluidNC
    </button>
  </div>

  <template v-else>
    <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500">Motion &amp; Kinematics</p>

    <SettingsCard title="Machine Identity" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Board">
        <input v-model="machine.fluidncConfig.board" type="text" class="settings-input w-48 font-mono" />
      </SettingsRow>
      <SettingsRow label="Report Units">
        <div class="flex rounded-md overflow-hidden border border-gray-200 dark:border-slate-600 text-xs font-medium">
          <button
            type="button"
            @click="machine.fluidncConfig.reportInches = false"
            :class="!machine.fluidncConfig.reportInches ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
            class="px-3 py-1.5 transition-colors"
          >mm</button>
          <button
            type="button"
            @click="machine.fluidncConfig.reportInches = true"
            :class="machine.fluidncConfig.reportInches ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300'"
            class="px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-slate-600"
          >inch</button>
        </div>
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Stepping Engine" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Engine">
        <select v-model="machine.fluidncConfig.stepping.engine" class="settings-input w-40">
          <option value="RMT">RMT</option>
          <option value="I2S_STREAM">I2S Stream</option>
          <option value="I2S_STATIC">I2S Static</option>
          <option value="STEPSTICK">StepStick</option>
          <option value="NONE">None</option>
        </select>
      </SettingsRow>
      <SettingsRow label="Motor Idle">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.stepping.idleMs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Step Pulse">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.stepping.pulseUs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Dir Delay">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.stepping.dirDelayUs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Disable Delay">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.stepping.disableDelayUs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">μs</span>
        </div>
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Axes" :fluidnc-config="true" :disabled="!isConnected">
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
          v-for="(axis, key) in machine.fluidncConfig.axes"
          :key="key"
          class="grid items-center gap-2 py-1.5 border-t border-gray-100 dark:border-slate-700/60"
          style="grid-template-columns: 2rem 1fr 1fr 1fr 1fr auto auto"
        >
          <span class="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">{{ String(key).toUpperCase() }}</span>
          <input v-model.number="axis.stepsPerMm" type="number" min="0.001" step="0.001" class="settings-input-sm font-mono" />
          <input v-model.number="axis.maxTravelMm" type="number" min="0.1" class="settings-input-sm font-mono" />
          <input v-model.number="axis.maxRateMmPerMin" type="number" min="1" class="settings-input-sm font-mono" />
          <input v-model.number="axis.accelerationMmPerSec2" type="number" min="0.001" class="settings-input-sm font-mono" />
          <UiToggleSwitch v-model="axis.softLimits" />
          <UiToggleSwitch v-model="axis.idleDisable" />
        </div>
      </div>
    </SettingsCard>

    <SettingsCard title="Homing" :fluidnc-config="true" :disabled="!isConnected">
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
          v-for="(axis, key) in machine.fluidncConfig.axes"
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

    <SettingsCard title="Limit Switches" :fluidnc-config="true" :disabled="!isConnected">
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
          v-for="(axis, key) in machine.fluidncConfig.axes"
          :key="key"
          class="grid items-center gap-2 py-1.5 border-t border-gray-100 dark:border-slate-700/60"
          style="grid-template-columns: 2rem 1fr 1fr auto 1fr"
        >
          <span class="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">{{ String(key).toUpperCase() }}</span>
          <input v-model="axis.motor0.limitNegPin" type="text" class="settings-input-sm font-mono" placeholder="NO_PIN" />
          <input v-model="axis.motor0.limitPosPin" type="text" class="settings-input-sm font-mono" placeholder="NO_PIN" />
          <UiToggleSwitch v-model="axis.motor0.hardLimits" />
          <input v-model.number="axis.motor0.pulloffMm" type="number" min="0" step="0.1" class="settings-input-sm font-mono" />
        </div>
      </div>
    </SettingsCard>

    <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 pt-1">I/O &amp; Peripherals</p>

    <SettingsCard title="Spindle" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Type">
        <select v-model="machine.fluidncConfig.spindle.type" class="settings-input w-48">
          <option value="PWMSpindle">PWM Spindle</option>
          <option value="Laser">Laser</option>
          <option value="NoSpindle">No Spindle</option>
          <option value="BESC">BESC</option>
          <option value="10V">0–10V</option>
          <option value="DAC">DAC</option>
        </select>
      </SettingsRow>
      <SettingsRow label="Output Pin">
        <input v-model="machine.fluidncConfig.spindle.outputPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Enable Pin">
        <input v-model="machine.fluidncConfig.spindle.enablePin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Direction Pin">
        <input v-model="machine.fluidncConfig.spindle.directionPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="PWM Frequency">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.spindle.pwmFreq" type="number" min="1" class="settings-input w-28 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">Hz</span>
        </div>
      </SettingsRow>
      <SettingsRow :label="machine.fluidncConfig.spindle.type === 'Laser' ? 'Min Power (%)' : 'Min RPM'">
        <input v-model.number="machine.fluidncConfig.spindle.minRpm" type="number" min="0" class="settings-input w-28 font-mono" />
      </SettingsRow>
      <SettingsRow :label="machine.fluidncConfig.spindle.type === 'Laser' ? 'Max Power (%)' : 'Max RPM'">
        <input v-model.number="machine.fluidncConfig.spindle.maxRpm" type="number" min="0" class="settings-input w-28 font-mono" />
      </SettingsRow>
      <SettingsRow label="Spinup Delay">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.spindle.spinupMs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Spindown Delay">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.spindle.spindownMs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Disable with zero speed">
        <UiToggleSwitch v-model="machine.fluidncConfig.spindle.disableWithZeroSpeed" />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Probe" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Probe Pin">
        <input v-model="machine.fluidncConfig.probe.pin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Toolsetter Pin">
        <input v-model="machine.fluidncConfig.probe.toolsetterPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Check Mode Start">
        <UiToggleSwitch v-model="machine.fluidncConfig.probe.checkModeStart" />
      </SettingsRow>
      <SettingsRow label="Hard Stop">
        <UiToggleSwitch v-model="machine.fluidncConfig.probe.hardStop" />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Coolant" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Flood Pin">
        <input v-model="machine.fluidncConfig.coolant.floodPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Mist Pin">
        <input v-model="machine.fluidncConfig.coolant.mistPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Delay">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.coolant.delayMs" type="number" min="0" class="settings-input w-24 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">ms</span>
        </div>
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Control Pins" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Safety Door">
        <input v-model="machine.fluidncConfig.control.safetyDoorPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Reset">
        <input v-model="machine.fluidncConfig.control.resetPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Feed Hold">
        <input v-model="machine.fluidncConfig.control.feedHoldPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
      <SettingsRow label="Cycle Start">
        <input v-model="machine.fluidncConfig.control.cycleStartPin" type="text" class="settings-input w-40 font-mono" placeholder="NO_PIN" />
      </SettingsRow>
    </SettingsCard>

    <p class="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 pt-1">Behavior</p>

    <SettingsCard title="Start Behavior" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Must Home on Start">
        <UiToggleSwitch v-model="machine.fluidncConfig.start.mustHome" />
      </SettingsRow>
      <SettingsRow label="Check Limits on Start">
        <UiToggleSwitch v-model="machine.fluidncConfig.start.checkLimits" />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Macros" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Startup Line 1">
        <input v-model="machine.fluidncConfig.macros.startupLine0" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
      </SettingsRow>
      <SettingsRow label="Startup Line 2">
        <input v-model="machine.fluidncConfig.macros.startupLine1" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
      </SettingsRow>
      <SettingsRow label="After Homing">
        <input v-model="machine.fluidncConfig.macros.afterHoming" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
      </SettingsRow>
      <SettingsRow label="After Reset">
        <input v-model="machine.fluidncConfig.macros.afterReset" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
      </SettingsRow>
      <SettingsRow label="After Unlock">
        <input v-model="machine.fluidncConfig.macros.afterUnlock" type="text" class="settings-input w-56 font-mono" placeholder="G-code…" />
      </SettingsRow>
    </SettingsCard>

    <SettingsCard title="Performance" :fluidnc-config="true" :disabled="!isConnected">
      <SettingsRow label="Arc Tolerance">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.arcToleranceMm" type="number" min="0" step="0.001" class="settings-input w-28 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Junction Deviation">
        <div class="flex items-center gap-1.5">
          <input v-model.number="machine.fluidncConfig.junctionDeviationMm" type="number" min="0" step="0.001" class="settings-input w-28 font-mono" />
          <span class="text-xs text-gray-400 dark:text-slate-500">mm</span>
        </div>
      </SettingsRow>
      <SettingsRow label="Planner Blocks">
        <input v-model.number="machine.fluidncConfig.plannerBlocks" type="number" min="1" max="128" class="settings-input w-24 font-mono" />
      </SettingsRow>
    </SettingsCard>

    <!-- FluidNC actions -->
    <div class="flex gap-2 pb-2">
      <button
        type="button"
        :disabled="!isConnected"
        @click="writeToFluidNC"
        class="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
        :class="isConnected ? 'hover:bg-blue-500' : 'opacity-40 cursor-not-allowed'"
      >
        Write to FluidNC
      </button>
      <button
        type="button"
        :disabled="!isConnected"
        @click="machineStore.reloadFirmwareConfig()"
        class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="isConnected
          ? 'bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 opacity-40 cursor-not-allowed'"
      >
        Read from FluidNC
      </button>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useConfirm } from '~/composables/useConfirm'
import { useMachineStore } from '~/stores/machine'
import type { MachineProfile } from '~/stores/settings'

defineProps<{
  machine: MachineProfile
  isConnected: boolean
}>()

const { confirm } = useConfirm()
const machineStore = useMachineStore()

async function writeToFluidNC() {
  const ok = await confirm({
    title: 'Write configuration to FluidNC?',
    message: 'This will overwrite the firmware settings on the connected controller. The machine will apply changes immediately.',
    confirmLabel: 'Write',
  })
  if (!ok) return
  // TODO: send config to firmware
}
</script>
