<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PanelLeft } from '@lucide/vue'
import { useSettings } from '@/composables/useSettings'
import { isWindowsPlatform } from '@/lib/platform'

const props = withDefaults(defineProps<{ showSidebarToggle?: boolean }>(), {
  showSidebarToggle: true,
})
const { sidebarCollapsed } = useSettings()
const { t } = useI18n()
</script>

<template>
  <div
    v-if="isWindowsPlatform"
    class="app-drag flex h-10 shrink-0 items-center border-b bg-background px-3"
  >
    <button
      v-if="props.showSidebarToggle"
      type="button"
      class="app-no-drag cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      :title="`${t('app.toggleSidebar')} (Ctrl+B)`"
      :aria-label="t('app.toggleSidebar')"
      @click="sidebarCollapsed = !sidebarCollapsed"
    >
      <PanelLeft class="size-4" />
    </button>
  </div>
</template>
