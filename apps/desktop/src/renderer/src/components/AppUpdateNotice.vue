<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpCircle, ExternalLink } from '@lucide/vue'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import { useAppUpdate } from '@/composables/useAppUpdate'
import { showToast } from '@/composables/useToast'

const { t, locale } = useI18n()
const {
  updateResult,
  hasDownload,
  downloading,
  downloaded,
  downloadPercent,
  downloadError,
  downloadUpdate,
} = useAppUpdate()

const updateInfo = computed(() =>
  updateResult.value?.status === 'update' ? updateResult.value : null,
)
const updateAvailable = computed(() => Boolean(updateInfo.value))
const updateAsset = computed(() => updateInfo.value?.asset ?? null)
const downloadUrl = computed(() => updateAsset.value?.url ?? updateInfo.value?.url ?? '')

function formatSize(size: number | undefined): string {
  if (!size) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function formatDate(value: string | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date)
}

function openDownloadUrl(): void {
  if (downloadUrl.value) void window.skillsManager.openLink(downloadUrl.value)
}

watch(downloadError, (message) => {
  if (message) showToast.error(t('settings.aboutDownloadFailed', { msg: message }))
})
</script>

<template>
  <PopoverRoot v-if="updateAvailable">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex size-8 cursor-pointer items-center justify-center rounded-md text-amber-600 outline-none transition-colors hover:bg-amber-500/10 focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
        :title="t('settings.updateAvailableTitle')"
        :aria-label="t('settings.updateAvailableTitle')"
      >
        <ArrowUpCircle class="size-4" />
      </button>
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        align="end"
        side="top"
        :side-offset="8"
        class="z-50 w-72 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold">{{ t('settings.updateAvailableTitle') }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ t('settings.updateVersion', { v: updateInfo?.latest ?? '-' }) }}
            </p>
          </div>
          <ArrowUpCircle class="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
        </div>
        <dl class="space-y-2 text-xs">
          <div class="flex items-start justify-between gap-4">
            <dt class="text-muted-foreground">{{ t('settings.updateSize') }}</dt>
            <dd class="text-right font-medium">{{ formatSize(updateAsset?.size) }}</dd>
          </div>
          <div class="flex items-start justify-between gap-4">
            <dt class="text-muted-foreground">{{ t('settings.updatePublishedAt') }}</dt>
            <dd class="text-right font-medium">{{ formatDate(updateInfo?.publishedAt) }}</dd>
          </div>
          <div class="space-y-1">
            <dt class="text-muted-foreground">{{ t('settings.updateDownloadUrl') }}</dt>
            <dd>
              <button
                type="button"
                class="inline-flex max-w-full cursor-pointer items-center gap-1 truncate text-left text-primary underline-offset-2 hover:underline"
                :title="downloadUrl"
                @click="openDownloadUrl"
              >
                <span class="truncate">{{ downloadUrl || '-' }}</span>
                <ExternalLink class="size-3 shrink-0" />
              </button>
            </dd>
          </div>
        </dl>
        <Button
          v-if="hasDownload"
          size="sm"
          class="mt-4 w-full cursor-pointer"
          :loading="downloading"
          :disabled="downloaded"
          @click="downloadUpdate"
        >
          {{
            downloaded
              ? t('settings.aboutDownloaded')
              : downloading
                ? t('settings.aboutDownloading', { progress: downloadPercent })
                : t('settings.aboutDownloadUpdate')
          }}
        </Button>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
