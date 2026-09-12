<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Check, Loader2, TriangleAlert } from '@lucide/vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import PlatformIcon from '@/components/PlatformIcon.vue'
import { Button } from '@/components/ui/button'
import { usePlatformCleanupHost } from '@/composables/usePlatformCleanup'
import { useSkills } from '@/composables/useSkills'
import { showToast } from '@/composables/useToast'

/** 清理状态由 composable 维护，组件仅负责展示及刷新、提示的应用层接线。 */
const { t } = useI18n()
const { pending, selected, busy, failure, canConfirm, close, toggle, confirm } = usePlatformCleanupHost()
const { refresh } = useSkills()

async function handleConfirm(): Promise<void> {
  await confirm({
    cleanup: (platformId, paths) => window.skillsManager.cleanupPlatformResidue(platformId, paths),
    refresh,
    onSuccess: (name) => showToast.success(t('app.residueCleaned', { name })),
  })
}
</script>

<template>
  <DialogRoot
    :open="Boolean(pending)"
    @update:open="(open) => !open && !busy && close()"
  >
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <div
          v-if="pending"
          class="flex gap-3"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <TriangleAlert class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <DialogTitle class="flex items-center gap-2 text-base font-semibold">
              <PlatformIcon
                :id="pending.id"
                :size="16"
              />
              {{ t('app.residueTitle', { name: pending.displayName }) }}
            </DialogTitle>
            <DialogDescription class="mt-1.5 text-sm text-muted-foreground">
              {{ t('app.residueDesc') }}
            </DialogDescription>
          </div>
        </div>

        <div
          v-if="pending"
          class="residue-scroll mt-4 max-h-[240px] divide-y overflow-y-auto rounded-lg border"
        >
          <button
            v-for="path in pending.residualPaths"
            :key="path"
            type="button"
            class="flex w-full cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-60"
            role="checkbox"
            :disabled="busy"
            :aria-checked="selected.includes(path)"
            :aria-label="path"
            @click="toggle(path)"
          >
            <span
              :class="[
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                selected.includes(path) ? 'border-primary bg-primary text-primary-foreground' : '',
              ]"
            >
              <Check
                v-if="selected.includes(path)"
                class="size-3"
              />
            </span>
            <span class="min-w-0 break-all font-mono text-xs">{{ path }}</span>
          </button>
        </div>

        <p class="mt-3 text-xs text-muted-foreground">
          {{ t('app.residueHint') }}
        </p>

        <p
          v-if="failure"
          class="mt-3 whitespace-pre-line break-all text-xs text-destructive"
        >
          {{ failure }}
        </p>

        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="busy"
            @click="close"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="cursor-pointer"
            :disabled="!canConfirm"
            @click="handleConfirm"
          >
            <Loader2
              v-if="busy"
              class="animate-spin"
            />
            {{ t('app.residueClean', { count: selected.length }) }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
.residue-scroll {
  scrollbar-color: var(--scrollbar-thumb) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 9999px;
    background: var(--scrollbar-thumb);
    background-clip: padding-box;
  }
}
</style>
