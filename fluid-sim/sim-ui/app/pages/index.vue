<template>
  <main class="flex-1 overflow-y-auto flex flex-col min-h-0">
    <!-- Above-fold: viewport + right sidebar fill available height -->
    <div
      class="grid gap-2 p-2 flex-none min-h-full"
      style="grid-template-columns: 1fr 22rem"
    >
      <!-- Left: machine viewport -->
      <MachineViewport class="min-h-64" />

      <!-- Right sidebar: position, switches, probe, stock -->
      <div class="flex flex-col gap-2 min-h-0 overflow-y-auto">
        <PositionPanel />
        <LimitSwitchPanel />
        <ProbePanel />
        <StockPanel />
      </div>
    </div>

    <!-- Below-fold: machine dimensions + fluidnc config -->
    <div
      class="grid grid-cols-2 gap-2 px-2 pb-2 flex-none"
      style="min-height: 12rem"
    >
      <MachineConfigPanel />
      <FluidNCConfigPanel />
    </div>
  </main>
</template>
