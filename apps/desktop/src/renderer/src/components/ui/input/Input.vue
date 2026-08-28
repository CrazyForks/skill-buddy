<script setup lang="ts">
import { X } from '@lucide/vue'
import { useAttrs, useTemplateRef } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    clearable?: boolean
    clearLabel?: string
  }>(),
  {
    clearable: true,
    clearLabel: 'Clear input',
  },
)
const model = defineModel<string>({ default: '' })
const attrs = useAttrs()
const inputRef = useTemplateRef<HTMLInputElement>('input')

function clear(): void {
  model.value = ''
  inputRef.value?.focus()
}
</script>

<template>
  <div class="relative w-full">
    <input
      ref="input"
      v-bind="attrs"
      v-model="model"
      :class="
        cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          props.clearable && 'pr-8',
          props.class,
        )
      "
    />
    <button
      v-if="props.clearable && model"
      type="button"
      :disabled="attrs.disabled !== undefined && attrs.disabled !== false"
      class="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      :title="props.clearLabel"
      :aria-label="props.clearLabel"
      @click="clear"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
