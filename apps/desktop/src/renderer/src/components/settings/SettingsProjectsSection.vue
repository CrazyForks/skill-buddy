<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderPlus, Trash2 } from '@lucide/vue'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import CopyButton from '@/components/CopyButton.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{
  query: string
  roots: string[]
}>()

const emit = defineEmits<{
  add: []
  remove: [root: string]
}>()

const { t } = useI18n()
const pendingRemoval = shallowRef<string | null>(null)
const visibleRoots = computed(() => {
  const query = props.query.trim().toLowerCase()
  return query
    ? props.roots.filter((root) => root.toLowerCase().includes(query))
    : props.roots
})

function requestRemove(root: string): void {
  pendingRemoval.value = root
}

function closeRemoveDialog(): void {
  pendingRemoval.value = null
}

function confirmRemove(): void {
  if (!pendingRemoval.value) return
  emit('remove', pendingRemoval.value)
  closeRemoveDialog()
}
</script>

<template>
  <section class="mb-10">
    <div class="mb-3 flex items-center justify-between gap-6">
      <h2 class="text-sm font-medium">{{ t('settings.sectionProjects') }}</h2>
      <Button variant="outline" size="sm" class="cursor-pointer" @click="emit('add')">
        <FolderPlus />
        {{ t('common.add') }}
      </Button>
    </div>
    <p class="mb-3 text-sm text-muted-foreground">{{ t('settings.projectDirsDesc') }}</p>
    <p
      v-if="props.roots.length === 0"
      class="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground"
    >
      {{ t('settings.noDirs') }}
    </p>
    <div v-else class="divide-y rounded-xl border">
      <div
        v-for="root in visibleRoots"
        :key="root"
        class="flex items-center justify-between gap-2 px-5 py-3"
      >
        <code class="select-text truncate text-sm">{{ root }}</code>
        <span class="flex shrink-0 items-center gap-0.5">
          <CopyButton :text="root" class="size-7" />
          <Button
            variant="ghost"
            size="icon"
            class="size-7 cursor-pointer text-muted-foreground"
            :title="t('common.delete')"
            :aria-label="t('common.delete')"
            @click="requestRemove(root)"
          >
            <Trash2 class="size-3.5" />
          </Button>
        </span>
      </div>
    </div>
    <DialogRoot
      :open="Boolean(pendingRemoval)"
      @update:open="(open) => !open && closeRemoveDialog()"
    >
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 z-50 w-[380px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        >
          <DialogTitle class="text-base font-semibold">
            {{ t('app.removeScopeTitle') }}
          </DialogTitle>
          <DialogDescription class="mt-2 break-all text-sm leading-6 text-muted-foreground">
            {{ t('app.removeScopeConfirm', { root: pendingRemoval }) }}
          </DialogDescription>
          <div class="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              class="cursor-pointer"
              @click="closeRemoveDialog"
            >
              {{ t('common.cancel') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              class="cursor-pointer"
              @click="confirmRemove"
            >
              {{ t('app.removeScopeAction') }}
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>
