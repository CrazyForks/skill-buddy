<script setup lang="ts">
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
import type { GroupDeleteRequest } from '@/lib/skill-action-types'

/** 技能包删除确认弹窗，仅删除包定义，不删除 Skill 本体。 */
const props = defineProps<{
  request: GroupDeleteRequest | null
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="Boolean(props.request)" @update:open="emit('openChange', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
      >
        <DialogTitle class="text-base font-semibold">
          {{ t('groups.deleteTitle') }}
        </DialogTitle>
        <DialogDescription class="mt-2 text-sm leading-6 text-muted-foreground">
          <I18nT v-if="props.request" keypath="groups.deleteConfirm" tag="span">
            <template #name>
              <strong class="font-semibold text-foreground">{{ props.request.groupName }}</strong>
            </template>
            <template #n>{{ props.request.skillCount }}</template>
          </I18nT>
        </DialogDescription>
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="emit('openChange', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="cursor-pointer"
            @click="emit('confirm')"
          >
            {{ t('groups.deleteAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
