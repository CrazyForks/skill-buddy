<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { GROUP_DESCRIPTION_MAX_LENGTH } from '@/lib/preset-format'

/** 技能包编辑弹窗只维护输入契约，名称校验和持久化由页面编排层处理。 */
const props = defineProps<{
  open: boolean
  value: string
  description: string
  duplicate: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:value': [value: string]
  'update:description': [value: string]
  submit: []
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="props.open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/40" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-xl outline-none"
        @open-auto-focus.prevent
      >
        <DialogTitle class="text-base font-semibold">{{ t('groups.editTitle') }}</DialogTitle>
        <Input
          :model-value="props.value"
          :placeholder="t('groups.createPh')"
          class="mt-4"
          autofocus
          @update:model-value="emit('update:value', $event)"
          @keydown.enter.prevent="emit('submit')"
        />
        <p v-if="props.duplicate" class="mt-2 text-sm text-destructive">
          {{ t('groups.renameDuplicate') }}
        </p>
        <Textarea
          :model-value="props.description"
          :placeholder="t('groups.descriptionPh')"
          :maxlength="GROUP_DESCRIPTION_MAX_LENGTH"
          class="mt-3"
          @update:model-value="emit('update:description', $event)"
        />
        <div class="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            class="cursor-pointer"
            @click="emit('update:open', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button
            size="sm"
            class="cursor-pointer"
            :disabled="!props.value.trim() || props.duplicate"
            @click="emit('submit')"
          >
            {{ t('groups.editAction') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
