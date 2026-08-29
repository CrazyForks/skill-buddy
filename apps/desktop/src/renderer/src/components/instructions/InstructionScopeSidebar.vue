<script setup lang="ts">
import { FolderGit2, Globe2 } from '@lucide/vue'

const props = defineProps<{
  selected: string
  projects: string[]
  projectCounts: Record<string, number>
  globalCount: number
}>()
const emit = defineEmits<{ select: [scope: string] }>()

function name(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path
}
</script>

<template>
  <aside class="flex w-52 shrink-0 flex-col border-r bg-muted/15">
    <div class="border-b px-3 py-3 text-xs font-medium text-muted-foreground">
      {{ $t('instructions.scopes') }}
    </div>
    <div class="flex flex-col gap-1 p-2">
      <button
        type="button"
        :class="[
          'flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          props.selected === 'global' ? 'nav-active' : 'hover:bg-accent/60',
        ]"
        @click="emit('select', 'global')"
      >
        <Globe2 class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ $t('instructions.global') }}</span>
        <span class="text-xs tabular-nums text-muted-foreground">{{ props.globalCount }}</span>
      </button>
      <button
        v-for="project in props.projects"
        :key="project"
        type="button"
        :title="project"
        :class="[
          'flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          props.selected === project ? 'nav-active' : 'hover:bg-accent/60',
        ]"
        @click="emit('select', project)"
      >
        <FolderGit2 class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ name(project) }}</span>
        <span class="text-xs tabular-nums text-muted-foreground">{{ props.projectCounts[project] ?? 0 }}</span>
      </button>
    </div>
  </aside>
</template>
