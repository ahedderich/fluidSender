<template>
  <main class="flex-1 overflow-y-auto flex flex-col gap-2 p-2 min-h-0">

    <!-- Row 1: machine view | scenarios -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 1fr 22rem; height: 32rem">
      <MachineViewport />
      <ScenariosPanel />
    </div>

    <!-- Row 2: position | switches+probe | stock -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 1.8fr 1fr 1.2fr">
      <PositionPanel />
      <LimitSwitchPanel />
      <StockPanel />
    </div>

    <!-- Row 3: FluidNC config -->
    <FluidNCConfigPanel style="min-height: 14rem" class="shrink-0" />

  </main>
</template>
