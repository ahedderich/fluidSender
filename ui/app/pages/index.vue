<template>
  <main class="flex-1 overflow-y-auto flex flex-col min-h-0">
    <!-- Upper section: fills available viewport height -->
    <div
      class="grid gap-2 p-2 flex-none min-h-full"
      style="grid-template-columns: 1fr 22rem"
    >
      <!-- Left column: 3D viewport + control row -->
      <div class="flex flex-col gap-2">
        <GCodeViewport class="flex-1 min-h-64" />
        <!-- Position / Navigation / Macros — disabled when disconnected -->
        <div
          v-if="machine.connected || true"
          class="grid gap-2"
          style="grid-template-columns: 18rem auto 1fr"
          :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
        >
          <DROPanel />
          <NavigationPanel />
          <MacrosPanel />
        </div>
      </div>

      <!-- Right column: job + probing -->
      <div class="flex flex-col gap-2 min-h-0">
        <JobInfo class="flex-1 min-h-0" />
        <ProbingPanel
          class="shrink-0"
          :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
        />
      </div>
    </div>

    <!-- Below-fold section: file browser | spindle+coolant + console + tools -->
    <div
      class="grid gap-2 px-2 pb-2 flex-none"
      style="grid-template-columns: 1fr 1fr; min-height: 28rem"
    >
      <div class="flex flex-col gap-2 min-h-0">
        <!-- Spindle / Coolant — disabled when disconnected -->
        <div
          class="grid grid-cols-2 gap-2 shrink-0"
          v-if="machine.connected || true"
          :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
        >
          <SpindlePanel />
          <CoolantPanel />
        </div>
        <FileBrowserPanel class="flex-1 min-h-0" />
      </div>
      <!-- Console + Tool Management — disabled when disconnected -->
      <div
        class="flex flex-col gap-2 min-h-0"
        v-if="machine.connected || true"
        :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
      >
        <ConsolePanel class="h-72 shrink-0" />
        <ToolManagementPanel class="flex-1 min-h-0" />
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'

const machine = useMachineStore()
</script>
