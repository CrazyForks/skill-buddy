<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, FolderOpen, GitBranch } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SkillImportSource } from '@/composables/useSkillImportWorkflow'

const props = defineProps<{
  tab: SkillImportSource
  gitUrl: string
  fetching: boolean
}>()
const emit = defineEmits<{
  'update:tab': [value: SkillImportSource]
  'update:gitUrl': [value: string]
  pickFiles: []
  pickDirectory: []
  drop: [event: DragEvent]
  fetchGit: []
}>()

const { t } = useI18n()
const gitUrlModel = computed({
  get: () => props.gitUrl,
  set: (value: string) => emit('update:gitUrl', value),
})
</script>

<template>
  <div class="flex gap-2">
    <button
      type="button"
      :class="[
        'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
        props.tab === 'local'
          ? 'border-foreground bg-foreground text-background'
          : 'hover:border-foreground/40',
      ]"
      @click="emit('update:tab', 'local')"
    >
      <FolderOpen class="size-3.5" />
      {{ t('import.tabLocal') }}
    </button>
    <button
      type="button"
      :class="[
        'flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors',
        props.tab === 'git'
          ? 'border-foreground bg-foreground text-background'
          : 'hover:border-foreground/40',
      ]"
      @click="emit('update:tab', 'git')"
    >
      <GitBranch class="size-3.5" />
      {{ t('import.tabGit') }}
    </button>
  </div>

  <div
    v-if="props.tab === 'local'"
    class="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40"
    @dragover.prevent
    @drop.prevent="emit('drop', $event)"
  >
    <FolderOpen class="size-6" />
    {{ t('import.dropHint') }}
    <div class="mt-1 flex flex-wrap justify-center gap-2">
      <Button
        variant="outline"
        size="sm"
        :disabled="props.fetching"
        @click="emit('pickFiles')"
      >
        <FileText class="size-4" />
        {{ t('import.pickFiles') }}
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="props.fetching"
        @click="emit('pickDirectory')"
      >
        <FolderOpen class="size-4" />
        {{ t('import.pickDir') }}
      </Button>
    </div>
  </div>

  <div v-else class="flex gap-2">
    <div class="min-w-0 flex-1">
      <Input
        v-model="gitUrlModel"
        class="text-sm"
        :placeholder="t('import.gitPh')"
        @keydown.enter="emit('fetchGit')"
      />
    </div>
    <Button
      size="sm"
      class="cursor-pointer"
      :disabled="!props.gitUrl.trim()"
      :loading="props.fetching"
      @click="emit('fetchGit')"
    >
      {{ props.fetching ? t('import.fetching') : t('import.fetch') }}
    </Button>
  </div>
</template>
