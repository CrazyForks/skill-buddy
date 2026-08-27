<script setup lang="ts">
import { computed } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { Button } from '@/components/ui/button'
import type { GroupToggleRequest } from '@/lib/skill-action-types'

/** 技能包整体启停的确认弹窗，替代平台原生对话框。 */
const props = defineProps<{
  request: GroupToggleRequest | null
  busy: boolean
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  confirm: []
}>()

const { t } = useI18n()

const action = computed(() => (props.request?.enabled ? 'enable' : 'disable'))
const title = computed(() => (props.request ? t(`groups.${action.value}Title`) : ''))
const installationCount = computed(
  () => props.request?.items.reduce((count, item) => count + item.targets.length, 0) ?? 0,
)
const confirmLabel = computed(() => (props.request ? t(`groups.${action.value}Action`) : ''))
</script>

<template>
  <DialogRoot :open="Boolean(props.request)" @update:open="emit('openChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT v-if="props.request" :keypath="props.request.confirmMessageKey" tag="span">
            <template #name>
              <strong class="font-semibold text-foreground">{{ props.request.groupName }}</strong>
            </template>
            <template #skills>{{ props.request.items.length }}</template>
            <template #installations>{{ installationCount }}</template>
          </I18nT>
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            :disabled="props.busy"
            @click="emit('openChange', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            :variant="props.request?.enabled ? 'default' : 'destructive'"
            size="sm"
            class="cursor-pointer"
            :loading="props.busy"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
