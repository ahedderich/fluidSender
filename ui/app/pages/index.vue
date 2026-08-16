<template>
  <main class="flex-1 overflow-y-auto flex flex-col min-h-0">
    <!-- Desktop layout — unchanged, only reachable when isMobile is false so
         GCodeViewport (WebGL canvas + render loop) never mounts on a mobile-width
         viewport, per issue #53 ("without 3D Viewport"). A CSS-only hidden class
         here would leave it mounted-but-hidden, wasting GPU/battery on the phone. -->
    <template v-if="!isMobile">
    <!-- Upper section: capped to available viewport height so long panel content
         (e.g. a big tool list) scrolls internally instead of growing this section
         and pushing the position/navigation/macros row out of view -->
    <div
      class="grid gap-2 p-2 flex-none h-full"
      style="grid-template-columns: 1fr 22rem"
    >
      <!-- Left column: 3D viewport + control row -->
      <div class="flex flex-col gap-2 min-h-0">
        <WorkspaceGCodeViewport class="flex-1 min-h-64" />
        <!-- Position / Navigation / Macros — disabled when disconnected -->
        <div
          v-if="machine.connected || true"
          class="grid gap-2"
          style="grid-template-columns: 18rem auto 1fr"
          :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
        >
          <WorkspaceDROPanel />
          <WorkspaceNavigationPanel />
          <WorkspaceMacrosPanel />
        </div>
      </div>

      <!-- Right column: job + probing -->
      <div class="flex flex-col gap-2 min-h-0">
        <WorkspaceJobInfo class="flex-1 min-h-0" />
        <WorkspaceProbingPanel
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
          <WorkspaceSpindlePanel />
          <WorkspaceCoolantPanel />
        </div>
        <WorkspaceFileBrowserPanel class="flex-1 min-h-0" />
      </div>
      <!-- Console + Tool Management — disabled when disconnected -->
      <div
        class="flex flex-col gap-2 min-h-0"
        v-if="machine.connected || true"
        :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
      >
        <WorkspaceConsolePanel class="h-72 shrink-0" />
        <WorkspaceToolManagementPanel id="tool-management-panel" class="flex-1 min-h-0" />
      </div>
    </div>
    </template>

    <!-- Mobile layout — Monitor/Control, switched via the bottom nav. No 3D
         viewport (issue #53) and no console panel (kept out of the mobile
         "light control" scope), reusing the same panel components as desktop. -->
    <template v-else>
      <div v-if="mobileTab === 'monitor'" class="flex flex-col gap-2 p-2">
        <WorkspaceJobProgressBar :overlay="false" />
        <WorkspaceJobInfo />
        <WorkspaceDROPanel />
      </div>
      <div
        v-else
        class="flex flex-col gap-2 p-2"
        :class="!machine.connected ? 'opacity-40 pointer-events-none select-none' : ''"
      >
        <WorkspaceDROPanel />
        <WorkspaceNavigationPanel />
        <WorkspaceMacrosPanel />
        <WorkspaceSpindlePanel />
        <WorkspaceCoolantPanel />
      </div>
    </template>
  </main>
</template>

<script setup lang="ts">
import { useMachineStore } from '~/stores/machine'
import { useIsMobile } from '~/composables/useIsMobile'
import { useMobileTab } from '~/composables/useMobileTab'

const machine = useMachineStore()
const isMobile = useIsMobile()
const mobileTab = useMobileTab()
</script>
