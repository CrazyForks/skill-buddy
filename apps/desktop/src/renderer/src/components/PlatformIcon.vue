<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { platformIcon } from '@/lib/platform-icons'

const props = withDefaults(
  defineProps<{
    id: string
    /** Icon size in px; default 16 */
    size?: number
    class?: string
  }>(),
  { size: 16 },
)

const def = computed(() => platformIcon(props.id))
</script>

<template>
  <span
    v-if="def.maskSrc"
    class="platform-icon-mask"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      '--platform-icon-mask': `url(${def.maskSrc})`,
    }"
    :class="cn('inline-block shrink-0', props.class)"
    aria-hidden="true"
  />
  <img
    v-else-if="def.src"
    :src="def.src"
    :width="size"
    :height="size"
    :class="cn('shrink-0 rounded-[3px]', props.class)"
    alt=""
    aria-hidden="true"
  />
  <span
    v-else
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${size * 0.52}px`,
      background: def.bg,
    }"
    :class="
      cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-[4px] font-semibold leading-none',
        def.bg ? 'text-white' : 'bg-foreground/80 text-background',
        props.class,
      )
    "
    aria-hidden="true"
  >
    {{ def.monogram }}
  </span>
</template>

<style scoped>
.platform-icon-mask {
  display: inline-block;
  flex-shrink: 0;
  background-color: currentcolor;
  mask-image: var(--platform-icon-mask);
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
  /* stylelint-disable property-no-vendor-prefix */
  -webkit-mask-image: var(--platform-icon-mask);
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  /* stylelint-enable property-no-vendor-prefix */
}
</style>
