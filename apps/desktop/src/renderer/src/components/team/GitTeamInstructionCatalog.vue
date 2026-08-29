<script setup lang="ts">
import { FileCog } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { useTeamLibraries } from '@/composables/useTeamLibraries'

const { instructions } = useTeamLibraries()
const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-3">
    <p
      v-if="instructions.length === 0"
      class="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground"
    >
      {{ t('team.instructionTemplateEmpty') }}
    </p>
    <ul
      v-else
      class="divide-y overflow-hidden rounded-md border"
    >
      <li
        v-for="item in instructions"
        :key="`${item.libraryId}:${item.path}`"
        class="flex items-start gap-3 px-4 py-3"
      >
        <FileCog class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ item.name }}</span>
            <Badge
              v-if="item.version"
              variant="secondary"
            >
              v{{ item.version }}
            </Badge>
          </span>
          <span class="mt-0.5 block text-sm text-muted-foreground">{{ item.description }}</span>
          <span
            class="mt-1 block truncate font-mono text-xs text-muted-foreground"
            :title="`${item.libraryName} · ${item.path}`"
          >
            {{ item.target }} · {{ item.libraryName }} · {{ item.path }}
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
