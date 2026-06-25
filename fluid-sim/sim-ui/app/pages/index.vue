<template>
  <main class="flex-1 overflow-y-auto flex flex-col gap-2 p-2 min-h-0">

    <!-- Row 1: viewport + position | scenarios -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 1fr 22rem">

      <!-- Left: compact viewport + position below -->
      <div class="flex flex-col gap-2">
        <MachineViewport style="height: 16rem" />
        <PositionPanel />
      </div>

      <!-- Right: scenarios (fills full height of this row) -->
      <ScenariosPanel style="min-height: 28rem" />
    </div>

    <!-- Row 2: limit switches + probe | stock | machine dimensions -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 18rem 1fr 1fr">
      <div class="flex flex-col gap-2">
        <LimitSwitchPanel />
        <ProbePanel />
      </div>
      <StockPanel />
      <MachineConfigPanel />
    </div>

    <!-- Row 3: FluidNC config (full width, scrollable) -->
    <FluidNCConfigPanel style="min-height: 14rem" class="shrink-0" />

  </main>
</template>
