<script setup lang="ts">
import { computed } from 'vue'
import { FileText, Link2, LockKeyhole } from '@lucide/vue'
import type { InstructionDocument } from '#shared/ipc'

const props = defineProps<{ documents: InstructionDocument[]; selectedId?: string }>()
const emit = defineEmits<{ select: [document: InstructionDocument] }>()

const groups = computed(() => {
  const grouped = new Map<string, InstructionDocument[]>()
  for (const document of props.documents) {
    const directory = document.scope === 'user' ? document.path.slice(0, -document.fileName.length - 1) : (document.relativeDirectory ?? '.')
    grouped.set(directory, [...(grouped.get(directory) ?? []), document])
  }
  return [...grouped.entries()].map(([directory, documents]) => ({ directory, documents }))
})
</script>

<template>
  <div class="instruction-scroll min-w-0 flex-1 overflow-y-auto px-2 py-2">
    <div
      v-if="groups.length === 0"
      class="px-3 py-10 text-center text-sm text-muted-foreground"
    >
      {{ $t('instructions.empty') }}
    </div>
    <section
      v-for="group in groups"
      :key="group.directory"
      class="mb-3"
    >
      <div
        class="truncate px-2 py-1 text-[11px] font-medium text-muted-foreground"
        :title="group.directory"
      >
        {{ group.directory }}
      </div>
      <button
        v-for="document in group.documents"
        :key="document.id"
        type="button"
        :class="[
          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
          props.selectedId === document.id ? 'nav-active' : 'hover:bg-accent/60',
        ]"
        @click="emit('select', document)"
      >
        <FileText class="size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate">{{ document.fileName }}</span>
        <Link2
          v-if="document.linked"
          class="size-3.5 shrink-0 text-muted-foreground"
          :title="$t('instructions.linked')"
        />
        <LockKeyhole
          v-if="document.readOnly"
          class="size-3.5 shrink-0 text-muted-foreground"
          :title="$t('instructions.readOnly')"
        />
      </button>
    </section>
  </div>
</template>
