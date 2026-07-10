<template>
  <main class="flex-1 overflow-y-auto flex flex-col gap-2 p-2 min-h-0">

    <!-- Row 1: machine view | scenarios -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 1fr 22rem; height: 32rem">
      <MachineViewport />
      <ScenariosPanel />
    </div>

    <!-- Row 2: position | switches+probe | stock -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 2fr 0.8fr 2fr">
      <PositionPanel />
      <LimitSwitchPanel />
      <StockPanel />
    </div>

    <!-- Row 2.5: tool-setter | tool library -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 1fr 2fr; height: 16rem">
      <ToolsetterPanel />
      <ToolLibraryPanel />
    </div>

    <!-- Row 3: protocol console (2/3) | FluidNC config (1/3) -->
    <div class="grid gap-2 shrink-0" style="grid-template-columns: 2fr 1fr; height: 18rem">
      <ConsolePanel />
      <FluidNCConfigPanel />
    </div>

  </main>
</template>
