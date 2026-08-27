<script setup lang="ts">
import { CircleCheck, CircleX, Info, TriangleAlert } from '@lucide/vue'
import { computed, type Component } from 'vue'
import { dismissToast, useToast, type ToastType } from '@/composables/useToast'

const { toast } = useToast()

/** 各语义类型对应的图标与配色，沿用项目既有的语义色约定。 */
const VISUALS: Record<ToastType, { icon: Component; class: string }> = {
  success: { icon: CircleCheck, class: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: TriangleAlert, class: 'text-amber-600 dark:text-amber-400' },
  error: { icon: CircleX, class: 'text-destructive' },
  info: { icon: Info, class: 'text-sky-600 dark:text-sky-400' },
}

const visual = computed(() => (toast.value?.type ? VISUALS[toast.value.type] : null))

async function runAction(): Promise<void> {
  const action = toast.value?.onAction
  dismissToast()
  await action?.()
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="-translate-y-2 opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="-translate-y-2 opacity-0"
  >
    <div
      v-if="toast"
      class="fixed left-1/2 top-5 z-[90] flex max-w-[calc(100vw-3rem)] -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-2.5 text-sm shadow-lg"
      role="status"
      aria-live="polite"
    >
      <component
        :is="visual.icon"
        v-if="visual"
        :class="['size-4 shrink-0', visual.class]"
        aria-hidden="true"
      />
      <span class="min-w-0">{{ toast.message }}</span>
      <button
        v-if="toast.actionLabel"
        type="button"
        class="shrink-0 cursor-pointer font-medium text-foreground underline-offset-2 hover:underline"
        @click="runAction"
      >
        {{ toast.actionLabel }}
      </button>
    </div>
  </Transition>
</template>
