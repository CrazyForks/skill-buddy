<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffLines, diffWordsWithSpace } from 'diff'
import { ScrollArea } from '@/components/ui/scroll-area'

const props = defineProps<{ base: string; other: string }>()
const { t } = useI18n()

const DIFF_TIMEOUT_MS = 80
const MAX_EDIT_LENGTH = 1200
const MAX_DIFF_CHARS = 400_000
const MAX_WORD_DIFF_CHARS = 24_000
const MAX_RENDER_ROWS = 800

interface Segment {
  text: string
  /** word-level highlight inside a changed line */
  changed: boolean
}

interface Row {
  type: 'same' | 'add' | 'del'
  segments: Segment[]
}

interface DiffResult {
  rows: Row[]
  omitted: boolean
  truncated: boolean
  failed: boolean
}

/** 将文本换行统一为 LF，避免 Windows 与 Unix 换行差异放大计算量。 */
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n')
}

/** 按行追加展示结果，并在达到 DOM 行数上限后停止。 */
function appendRows(
  rows: Row[],
  type: Row['type'],
  text: string,
  segments?: Segment[],
): boolean {
  if (!segments) {
    const value = text.endsWith('\n') ? text.slice(0, -1) : text
    let start = 0
    while (true) {
      if (rows.length >= MAX_RENDER_ROWS) return true
      const newline = value.indexOf('\n', start)
      const end = newline === -1 ? value.length : newline
      rows.push({ type, segments: [{ text: value.slice(start, end), changed: false }] })
      if (newline === -1) return false
      start = newline + 1
    }
  }

  let current: Segment[] = []
  for (const seg of segments) {
    const lines = seg.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const part = lines[i]!
      if (i > 0) {
        if (rows.length >= MAX_RENDER_ROWS) return true
        rows.push({ type, segments: current })
        current = []
      }
      if (part) current.push({ text: part, changed: seg.changed })
    }
  }
  if (current.length > 0) {
    if (rows.length >= MAX_RENDER_ROWS) return true
    rows.push({ type, segments: current })
  }
  return false
}

function buildDiffResult(): DiffResult {
  const base = normalizeLineEndings(props.base)
  const other = normalizeLineEndings(props.other)
  if (base.length + other.length > MAX_DIFF_CHARS) {
    return { rows: [], omitted: true, truncated: false, failed: false }
  }
  const parts = diffLines(base, other, {
    maxEditLength: MAX_EDIT_LENGTH,
    stripTrailingCr: true,
    timeout: DIFF_TIMEOUT_MS,
  })
  if (!parts) return { rows: [], omitted: true, truncated: false, failed: false }

  const out: Row[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const next = parts[i + 1]
    if (part.removed && next?.added) {
      const canDiffWords = part.value.length + next.value.length <= MAX_WORD_DIFF_CHARS
      const words = canDiffWords
        ? diffWordsWithSpace(part.value, next.value, {
            maxEditLength: MAX_EDIT_LENGTH,
            timeout: DIFF_TIMEOUT_MS,
          })
        : undefined
      if (words) {
        const delSegs: Segment[] = []
        const addSegs: Segment[] = []
        for (const word of words) {
          if (word.added) addSegs.push({ text: word.value, changed: true })
          else if (word.removed) delSegs.push({ text: word.value, changed: true })
          else {
            delSegs.push({ text: word.value, changed: false })
            addSegs.push({ text: word.value, changed: false })
          }
        }
        if (appendRows(out, 'del', part.value, delSegs)) {
          return { rows: out, omitted: false, truncated: true, failed: false }
        }
        if (appendRows(out, 'add', next.value, addSegs)) {
          return { rows: out, omitted: false, truncated: true, failed: false }
        }
      } else {
        if (appendRows(out, 'del', part.value) || appendRows(out, 'add', next.value)) {
          return { rows: out, omitted: false, truncated: true, failed: false }
        }
      }
      i++
    } else if (part.added) {
      if (appendRows(out, 'add', part.value)) {
        return { rows: out, omitted: false, truncated: true, failed: false }
      }
    } else if (part.removed) {
      if (appendRows(out, 'del', part.value)) {
        return { rows: out, omitted: false, truncated: true, failed: false }
      }
    } else {
      if (appendRows(out, 'same', part.value)) {
        return { rows: out, omitted: false, truncated: true, failed: false }
      }
    }
  }
  return { rows: out, omitted: false, truncated: false, failed: false }
}

const result = computed<DiffResult>(() => {
  try {
    return buildDiffResult()
  } catch (error) {
    console.error('Failed to render SKILL.md diff', error)
    return { rows: [], omitted: false, truncated: false, failed: true }
  }
})
</script>

<template>
  <p
    v-if="result.failed"
    class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-muted-foreground"
  >
    {{ t('detail.diffFailed') }}
  </p>
  <p
    v-else-if="result.omitted"
    class="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-muted-foreground"
  >
    {{ t('detail.diffTooLarge') }}
  </p>
  <ScrollArea
    v-else
    class="max-h-64 rounded-md border font-mono text-sm leading-5"
    viewport-class="max-h-64"
  >
    <div
      v-for="(row, i) in result.rows"
      :key="i"
      :class="[
        'whitespace-pre-wrap px-3',
        row.type === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        row.type === 'del' && 'bg-red-500/[0.07] text-red-700 dark:text-red-400',
      ]"
    >
      <span class="mr-2 select-none opacity-60">{{
        row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '
      }}</span
      ><template v-for="(seg, j) in row.segments" :key="j"
        ><span
          :class="
            seg.changed
              ? row.type === 'add'
                ? 'rounded-[3px] bg-emerald-500/25'
                : 'rounded-[3px] bg-red-500/20'
              : ''
          "
          >{{ seg.text }}</span
        ></template
      >
    </div>
    <p
      v-if="result.truncated"
      class="border-t bg-muted/40 px-3 py-2 font-sans text-xs text-muted-foreground"
    >
      {{ t('detail.diffTruncated', { n: MAX_RENDER_ROWS }) }}
    </p>
  </ScrollArea>
</template>
