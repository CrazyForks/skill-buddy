<script setup lang="ts">
import { defineAsyncComponent, shallowRef } from 'vue'
import AppToast from '@/components/AppToast.vue'
import InAppBrowser from '@/components/InAppBrowser.vue'
import GroupDeleteDialog from '@/components/groups/GroupDeleteDialog.vue'
import GroupToggleDialog from '@/components/groups/GroupToggleDialog.vue'
import Sidebar from '@/components/Sidebar.vue'
import SettingsPageSkeleton from '@/components/SettingsPageSkeleton.vue'
import WindowTopBar from '@/components/WindowTopBar.vue'
import { useAppLifecycle } from '@/composables/useAppLifecycle'
import { useGroups } from '@/composables/useGroups'
import { useSettings } from '@/composables/useSettings'
import { useTrayIntegration } from '@/composables/useTrayIntegration'
import type { SettingsCategory, WorkspaceView } from '@/lib/navigation'
import { isWindowsPlatform } from '@/lib/platform'
import Workspace from '@/views/WorkspaceView.vue'

const ImportAppsModal = defineAsyncComponent(() => import('@/components/ImportAppsModal.vue'))
const ImportSheet = defineAsyncComponent(() => import('@/components/ImportSheet.vue'))
const SettingsPage = defineAsyncComponent({
  loader: () => import('@/components/SettingsPage.vue'),
  loadingComponent: SettingsPageSkeleton,
  delay: 0,
  suspensible: false,
})

const { sidebarCollapsed } = useSettings()
// 技能包操作在多个视图都有入口，确认弹窗随单例状态挂在这里，保证全局只有一个。
const {
  pendingGroupDelete,
  updateGroupDeleteDialog,
  confirmGroupDelete,
  pendingGroupToggle,
  groupToggleBusy,
  updateGroupToggleDialog,
  confirmGroupToggle,
} = useGroups()
const view = shallowRef<WorkspaceView>('dashboard')
const navigationRevision = shallowRef(0)
const attentionRevision = shallowRef(0)
const settingsOpen = shallowRef(false)
const settingsCategory = shallowRef<SettingsCategory>('general')
const importOpen = shallowRef(false)
const advancedImportOpen = shallowRef(false)

function openSettings(category: SettingsCategory = 'general'): void {
  settingsCategory.value = category
  settingsOpen.value = true
}

function openAttention(): void {
  settingsOpen.value = false
  view.value = 'dashboard'
  navigationRevision.value += 1
  attentionRevision.value += 1
}

/** Navigate from the sidebar and reset the destination to its default page. */
function navigate(viewName: WorkspaceView): void {
  view.value = viewName
  navigationRevision.value += 1
}

function handleConfirmGroupDelete(): void {
  if (confirmGroupDelete() && view.value === 'skills') navigate('groups')
}

const { refreshLocal } = useTrayIntegration({
  openAttention,
  openSettings: () => openSettings('behavior'),
})
useAppLifecycle({ refreshLocal })
</script>

<template>
  <AppToast />
  <InAppBrowser />
  <div class="relative flex h-screen flex-col">
    <WindowTopBar :show-sidebar-toggle="!settingsOpen" />
    <SettingsPage
      v-if="settingsOpen"
      class="min-h-0 flex-1"
      :initial-category="settingsCategory"
      @back="settingsOpen = false"
    />
    <div v-else class="flex min-h-0 flex-1">
      <Sidebar :view="view" @navigate="navigate" @open-settings="openSettings" />
      <Workspace
        :view="view"
        :navigation-revision="navigationRevision"
        :attention-revision="attentionRevision"
        :inset="sidebarCollapsed && !isWindowsPlatform"
        @attention-opened="attentionRevision = 0"
        @open-settings="openSettings"
        @import-skills="importOpen = true"
        @navigate="navigate"
      />
      <ImportAppsModal
        v-if="importOpen"
        :open="true"
        @close="importOpen = false"
        @advanced="((importOpen = false), (advancedImportOpen = true))"
      />
      <ImportSheet
        v-if="advancedImportOpen"
        :open="true"
        @close="advancedImportOpen = false"
      />
      <GroupToggleDialog
        :request="pendingGroupToggle"
        :busy="groupToggleBusy"
        @open-change="updateGroupToggleDialog"
        @confirm="confirmGroupToggle"
      />
      <GroupDeleteDialog
        :request="pendingGroupDelete"
        @open-change="updateGroupDeleteDialog"
        @confirm="handleConfirmGroupDelete"
      />
    </div>
  </div>
</template>

<style>
.app-drag {
  -webkit-app-region: drag;
}

.app-no-drag {
  -webkit-app-region: no-drag;
}
</style>
