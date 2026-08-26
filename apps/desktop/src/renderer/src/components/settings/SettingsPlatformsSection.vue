<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, ChevronRight, FolderSearch, Loader2, Plus, Trash2 } from '@lucide/vue'
import type { PlatformStatus } from '@skillbuddy/core'
import type { CustomPlatformInput } from '#shared/ipc'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  isSelectableDraft,
  PLATFORM_DRAFT_ERROR_KEYS,
  type CustomPlatformForm,
  type PlatformCandidateRow,
} from '@/lib/platform-draft'

/** 平台区域只负责候选列表的展示与编辑，保存、同步与刷新仍由设置页处理。 */
const props = defineProps<{
  platforms: PlatformStatus[]
  customPlatforms: CustomPlatformInput[]
  showForm: boolean
  candidates: PlatformCandidateRow[]
  discovering: boolean
  formError: string | null
}>()

const emit = defineEmits<{
  'update:showForm': [value: boolean]
  'toggle-selected': [key: string]
  'toggle-expanded': [key: string]
  'update-field': [key: string, field: keyof CustomPlatformForm, value: string]
  pick: []
  add: []
  remove: [id: string]
}>()

const { t } = useI18n()

const selectedCount = computed(() => props.candidates.filter((row) => row.selected).length)

</script>

<template>
  <section class="mb-10">
    <div class="mb-3 flex items-center justify-between gap-6">
      <h2 class="text-sm font-medium">{{ t('settings.sectionPlatforms') }}</h2>
      <Button
        variant="outline"
        size="sm"
        class="cursor-pointer"
        @click="emit('update:showForm', !props.showForm)"
      >
        <Plus />
        {{ t('settings.customPlatform') }}
      </Button>
    </div>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.platformsDesc') }}</p>

    <div v-if="props.showForm" class="mb-3 flex flex-col gap-3 rounded-xl border px-5 py-4">
      <div v-if="props.discovering" class="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 class="size-3.5 animate-spin" />
        {{ t('settings.discovering') }}
      </div>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{
            props.candidates.length > 0
              ? t('settings.discoveredCount', { count: props.candidates.length })
              : t('settings.discoveredNone')
          }}
        </p>

        <div v-if="props.candidates.length > 0" class="divide-y rounded-lg border">
          <div v-for="row in props.candidates" :key="row.key" class="px-3 py-2.5">
            <div class="flex items-center gap-2.5">
              <button
                type="button"
                class="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                :class="[
                  isSelectableDraft(row.error)
                    ? 'cursor-pointer'
                    : 'cursor-not-allowed opacity-40',
                  row.selected ? 'border-primary bg-primary text-primary-foreground' : '',
                ]"
                :disabled="!isSelectableDraft(row.error)"
                :aria-label="row.form.detectPath"
                :aria-checked="row.selected"
                role="checkbox"
                @click="emit('toggle-selected', row.key)"
              >
                <Check v-if="row.selected" class="size-3" />
              </button>
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                @click="emit('toggle-expanded', row.key)"
              >
                <ChevronRight
                  class="size-3.5 shrink-0 text-muted-foreground transition-transform"
                  :class="row.expanded ? 'rotate-90' : ''"
                />
                <span class="truncate font-mono text-xs">{{ row.form.detectPath }}</span>
                <span class="truncate text-sm text-muted-foreground">
                  {{ row.form.displayName }}
                </span>
                <Badge v-if="row.hasSkillsDir" variant="success">
                  {{ t('settings.hasSkillsDir') }}
                </Badge>
                <Badge v-if="row.manual" variant="secondary">
                  {{ t('settings.manuallyPicked') }}
                </Badge>
              </button>
            </div>

            <p v-if="row.error" class="mt-1.5 pl-6.5 text-xs text-destructive">
              {{ t(PLATFORM_DRAFT_ERROR_KEYS[row.error]) }}
            </p>

            <div v-if="row.expanded" class="mt-2.5 flex flex-col gap-2 pl-6.5">
              <div class="grid grid-cols-2 gap-2">
                <Input
                  :model-value="row.form.id"
                  :placeholder="t('settings.formIdPh')"
                  class="text-sm"
                  @update:model-value="emit('update-field', row.key, 'id', $event)"
                />
                <Input
                  :model-value="row.form.displayName"
                  :placeholder="t('settings.formNamePh')"
                  class="text-sm"
                  @update:model-value="emit('update-field', row.key, 'displayName', $event)"
                />
              </div>
              <Input
                :model-value="row.form.detectPath"
                :placeholder="t('settings.formDetectPh')"
                class="text-sm"
                @update:model-value="emit('update-field', row.key, 'detectPath', $event)"
              />
              <Input
                :model-value="row.form.userSkillsDir"
                :placeholder="t('settings.formUserDirPh')"
                class="text-sm"
                @update:model-value="emit('update-field', row.key, 'userSkillsDir', $event)"
              />
              <Input
                :model-value="row.form.projectSkillsDir"
                :placeholder="t('settings.formProjectDirPh')"
                class="text-sm"
                @update:model-value="emit('update-field', row.key, 'projectSkillsDir', $event)"
              />
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <span class="h-px flex-1 bg-border" />
          <span class="text-xs text-muted-foreground">{{ t('settings.orPickManually') }}</span>
          <span class="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" size="sm" class="cursor-pointer self-start" @click="emit('pick')">
          <FolderSearch />
          {{ t('settings.pickPlatformDir') }}
        </Button>
      </template>

      <p v-if="props.formError" class="text-sm text-destructive">{{ props.formError }}</p>
      <div class="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="cursor-pointer"
          @click="emit('update:showForm', false)"
        >
          {{ t('common.cancel') }}
        </Button>
        <Button
          size="sm"
          class="cursor-pointer"
          :disabled="selectedCount === 0"
          @click="emit('add')"
        >
          {{ t('settings.addSelected', { count: selectedCount }) }}
        </Button>
      </div>
    </div>

    <div class="divide-y rounded-xl border">
      <div
        v-for="platform in props.platforms"
        :key="platform.id"
        class="flex items-center justify-between gap-2 px-5 py-3"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <PlatformIcon :id="platform.id" :size="16" />
          <span class="text-sm">{{ platform.displayName }}</span>
          <Badge :variant="platform.detected ? 'success' : 'secondary'">
            {{ platform.detected ? t('settings.detected') : t('settings.notDetected') }}
          </Badge>
        </div>
        <Button
          v-if="props.customPlatforms.some((custom) => custom.id === platform.id)"
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 cursor-pointer text-muted-foreground"
          :title="t('settings.removeNote')"
          :aria-label="t('settings.removeNote')"
          @click="emit('remove', platform.id)"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>
    </div>
  </section>
</template>
