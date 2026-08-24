<script setup lang="ts">
import { defineAsyncComponent, useAttrs, type Component } from 'vue'
import MarkdownFallback from '@/components/MarkdownFallback.vue'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  content: string
  previewId?: string
}>()
const attrs = useAttrs()

/** Markdown 预览资源加载失败或超时时，回退为可阅读的原始文本。 */
function loadMarkdownView(): Promise<Component> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      settled = true
      resolve(MarkdownFallback)
    }, 15000)

    void import('./MarkdownView.vue')
      .then((module) => {
        if (settled) return
        clearTimeout(timer)
        resolve(module.default)
      })
      .catch(() => {
        if (settled) return
        clearTimeout(timer)
        resolve(MarkdownFallback)
      })
  })
}

const MarkdownView = defineAsyncComponent(loadMarkdownView)

</script>

<template>
  <MarkdownView
    :content="props.content"
    :preview-id="props.previewId"
    v-bind="attrs"
  />
</template>
