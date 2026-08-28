<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  type TooltipContentProps,
} from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props {
  content?: string
  side?: TooltipContentProps['side']
  align?: TooltipContentProps['align']
  sideOffset?: number
  delayDuration?: number
  skipDelayDuration?: number
  disabled?: boolean
  triggerClass?: HTMLAttributes['class']
  contentClass?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  content: '',
  side: 'top',
  align: 'center',
  sideOffset: 8,
  delayDuration: 300,
  skipDelayDuration: 100,
  disabled: false,
  triggerClass: undefined,
  contentClass: undefined,
})

defineSlots<{
  default(): unknown
  content?(): unknown
}>()
</script>

<template>
  <TooltipProvider
    :delay-duration="props.delayDuration"
    :skip-delay-duration="props.skipDelayDuration"
  >
    <TooltipRoot :disabled="props.disabled">
      <TooltipTrigger as-child>
        <span
          tabindex="0"
          :class="cn(
            'inline-flex shrink-0 cursor-help outline-none focus-visible:ring-2 focus-visible:ring-ring',
            props.triggerClass,
          )"
        >
          <slot />
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="props.side"
          :align="props.align"
          :side-offset="props.sideOffset"
          :class="cn(
            'z-[80] max-w-80 rounded-md border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-md',
            props.contentClass,
          )"
        >
          <slot name="content">
            {{ props.content }}
          </slot>
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
