<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="c.visible.value"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @keydown.esc="c.dismiss()"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/50 backdrop-blur-sm"
          @click="c.dismiss()"
        />

        <!-- Modal -->
        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 scale-95"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-100"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95"
        >
          <div
            v-if="c.visible.value"
            class="relative bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-2xl p-5 w-80 max-w-full"
            @click.stop
          >
            <h3 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
              {{ c.opts.title }}
            </h3>
            <p v-if="c.opts.message" class="mt-1.5 text-sm text-gray-500 dark:text-slate-400 leading-relaxed">
              {{ c.opts.message }}
            </p>

            <div class="flex gap-2 mt-4">
              <button
                type="button"
                @click="c.accept()"
                class="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                :class="c.opts.danger
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'"
              >
                {{ c.opts.confirmLabel }}
              </button>
              <button
                type="button"
                @click="c.dismiss()"
                class="flex-1 py-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
              >
                {{ c.opts.cancelLabel }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useConfirm } from '~/composables/useConfirm'
const c = useConfirm()
</script>
