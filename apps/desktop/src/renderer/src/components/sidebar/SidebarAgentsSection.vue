<script setup lang="ts">
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight, TriangleAlert } from '@lucide/vue'
import type { PlatformStatus } from '@skillbuddy/core'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Tooltip } from '@/components/ui/tooltip'
import { openPlatformCleanup } from '@/composables/usePlatformCleanup'

const props = defineProps<{
  platforms: PlatformStatus[]
  counts: Map<string, number>
  activePlatform: string | null
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n()
const expanded = shallowRef(true)
</script>

<template>
  <section class="mt-4">
    <button
      type="button"
      class="mb-1 flex w-full cursor-pointer items-center gap-1 rounded-md px-3 py-1 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      aria-controls="sidebar-agents"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <ChevronRight
        :class="[
          'size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
          expanded && 'rotate-90',
        ]"
        aria-hidden="true"
      />
      {{ t('app.agents') }}
    </button>
    <div
      id="sidebar-agents"
      :class="[
        'grid transition-[grid-template-rows,opacity] motion-reduce:transition-none',
        expanded
          ? 'grid-rows-[1fr] opacity-100 duration-200 ease-out'
          : 'grid-rows-[0fr] opacity-0 duration-150 ease-in',
      ]"
      :inert="!expanded"
    >
      <div class="min-h-0 overflow-hidden">
        <!--
          行由「选中按钮 + 警示按钮」两个兄弟节点组成，不能把警示按钮嵌进选中
          按钮里：按钮不能嵌套按钮。悬停底色因此上移到外层容器。
        -->
        <div
          v-for="platform in props.platforms"
          :key="platform.id"
          :class="[
            'flex w-full items-center rounded-md transition-colors',
            props.activePlatform === platform.id ? 'nav-active' : 'hover:bg-accent/60',
          ]"
        >
          <button
            type="button"
            :class="[
              'flex min-w-0 flex-1 cursor-pointer items-center justify-between py-1.5 pl-3 text-sm',
              platform.residualPaths.length > 0 ? 'pr-1.5' : 'pr-3',
            ]"
            @click="emit('select', platform.id)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <PlatformIcon
                :id="platform.id"
                :size="15"
              />
              <span class="truncate">{{ platform.displayName }}</span>
            </span>
            <span class="text-sm tabular-nums text-muted-foreground">
              {{ props.counts.get(platform.id) ?? 0 }}
            </span>
          </button>
          <Tooltip
            v-if="platform.residualPaths.length > 0"
            :content="t('app.residueButton')"
            side="right"
            trigger-class="mr-1.5 cursor-pointer"
          >
            <button
              type="button"
              class="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10"
              :aria-label="t('app.residueButton')"
              @click="openPlatformCleanup(platform)"
            >
              <TriangleAlert class="size-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  </section>
</template>
