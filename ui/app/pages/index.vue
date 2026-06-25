<template>
  <main class="flex-1 overflow-y-auto flex flex-col min-h-0">
    <!-- Upper section: fills available viewport height -->
    <div
      class="grid gap-2 p-2 flex-none min-h-full"
      style="grid-template-columns: 1fr 22rem"
    >
      <!-- Left column: 3D viewport + control row + console -->
      <div class="flex flex-col gap-2">
        <GCodeViewport class="flex-1 min-h-64" />
        <!-- Position / Navigation / Macros side by side -->
        <div class="grid gap-2" style="grid-template-columns: 18rem auto 1fr">
          <DROPanel />
          <NavigationPanel />
          <MacrosPanel />
        </div>
      </div>

      <!-- Right column: job (top 50%) + probing (bottom 50%) -->
      <div class="flex flex-col gap-2 min-h-0">
        <JobInfo class="flex-1 min-h-0" />
        <ProbingPanel class="shrink-0" />
      </div>
    </div>

    <!-- Below-fold section: file browser | spindle+coolant above heightmap -->
    <div
      class="grid gap-2 px-2 pb-2 flex-none"
      style="grid-template-columns: 1fr 1fr; min-height: 28rem"
    >
      <div class="flex flex-col gap-2 min-h-0">
        <div class="grid grid-cols-2 gap-2 shrink-0">
          <SpindlePanel />
          <CoolantPanel />
        </div>
        <FileBrowserPanel class="flex-1 min-h-0" />
      </div>
      <div class="flex flex-col gap-2 min-h-0">
        <ConsolePanel class="h-72 shrink-0" />
        <ToolManagementPanel class="flex-1 min-h-0" />
      </div>
    </div>
  </main>
</template>
