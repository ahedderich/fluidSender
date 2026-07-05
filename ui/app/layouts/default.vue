<template>
  <div class="h-screen flex flex-col bg-gray-100 dark:bg-slate-950 overflow-hidden">
    <TopBar />
    <slot />
    <ConfirmDialog />
    <ProgramPauseModal />
    <ToolchangeDialog />
    <ToastHost />
  </div>
</template>
