<script setup lang="ts">
import { shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronsDown, ChevronsUp, TriangleAlert } from '@lucide/vue'
import ResourcePreviewDialog from '@/components/ResourcePreviewDialog.vue'
import SkillResourceTree from '@/components/skill-detail/SkillResourceTree.vue'
import { ScrollArea } from '@/components/ui/scroll-area'

/** 资源区域持有预览弹窗状态，资源内容仍由详情页提供。 */
const props = defineProps<{
  skillName: string
  resources: [string, string][]
  containsScripts: boolean
}>()

const { t } = useI18n()
const previewTarget = shallowRef<{ path: string; source: string } | null>(null)
const resourceTree = useTemplateRef<InstanceType<typeof SkillResourceTree>>('resourceTree')
const allResourcesExpanded = shallowRef(false)
const resourcesExpandable = shallowRef(false)

function previewResource(path: string, source: string): void {
  previewTarget.value = { path, source }
}

function updateExpansionState(state: { allExpanded: boolean; expandable: boolean }): void {
  allResourcesExpanded.value = state.allExpanded
  resourcesExpandable.value = state.expandable
}

function toggleAllResources(): void {
  if (allResourcesExpanded.value) resourceTree.value?.collapseAll()
  else resourceTree.value?.expandAll()
}

/** 技能切换时关闭旧资源预览，防止展示已不属于当前技能的文件。 */
watch(() => props.skillName, () => {
  previewTarget.value = null
  allResourcesExpanded.value = false
  resourcesExpandable.value = false
})
</script>

<template>
  <section v-if="props.resources.length > 0" class="mb-8">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h3 class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('detail.resources') }}
      </h3>
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        :title="t(allResourcesExpanded ? 'detail.collapseAllResources' : 'detail.expandAllResources')"
        :aria-label="t(allResourcesExpanded ? 'detail.collapseAllResources' : 'detail.expandAllResources')"
        :aria-pressed="allResourcesExpanded"
        :disabled="!resourcesExpandable"
        @click="toggleAllResources"
      >
        <component :is="allResourcesExpanded ? ChevronsUp : ChevronsDown" class="size-3.5" />
        {{ t(allResourcesExpanded ? 'detail.collapseAllResources' : 'detail.expandAllResources') }}
      </button>
    </div>
    <div
      v-if="props.containsScripts"
      class="mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
    >
      <TriangleAlert class="size-3.5 shrink-0" />
      {{ t('detail.scriptWarning') }}
    </div>
    <ScrollArea class="max-h-96 rounded-md border" viewport-class="max-h-96 pr-2">
      <SkillResourceTree
        ref="resourceTree"
        :resources="props.resources"
        @preview="previewResource"
        @expansion-change="updateExpansionState"
      />
    </ScrollArea>
  </section>

  <ResourcePreviewDialog :resource="previewTarget" @close="previewTarget = null" />
</template>
