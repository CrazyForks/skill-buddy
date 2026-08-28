<script setup lang="ts">
import { useAttrs } from 'vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class']
    rows?: number
    maxlength?: number
  }>(),
  {
    rows: 5,
  },
)
const model = defineModel<string>({ default: '' })
const attrs = useAttrs()
</script>

<template>
  <div class="relative w-full">
    <textarea
      v-bind="attrs"
      v-model="model"
      :rows="props.rows"
      :maxlength="props.maxlength"
      :class="
        cn(
          'h-32 max-h-32 min-h-32 w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 pb-6 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          props.class,
        )
      "
    />
    <span
      v-if="props.maxlength !== undefined"
      class="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground"
    >
      {{ model.length }}/{{ props.maxlength }}
    </span>
  </div>
</template>
