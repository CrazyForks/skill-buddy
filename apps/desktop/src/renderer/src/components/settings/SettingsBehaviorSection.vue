<script setup lang="ts">
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const props = defineProps<{
  query: string
  globalShortcutOk: boolean
  launchAtLoginReady: boolean
  desktopPreferencesReady: boolean
}>()

const autoRefresh = defineModel<boolean>('autoRefresh', { required: true })
const notifyDrift = defineModel<boolean>('notifyDrift', { required: true })
const confirmUninstall = defineModel<boolean>('confirmUninstall', { required: true })
const backgroundMode = defineModel<boolean>('backgroundMode', { required: true })
const launchAtLogin = defineModel<boolean>('launchAtLogin', { required: true })
const launchHidden = defineModel<boolean>('launchHidden', { required: true })
const globalShortcut = defineModel<string>('globalShortcut', { required: true })
const { t } = useI18n()
const recordingShortcut = shallowRef(false)
let shortcutCaptured = false

const shortcutKeyAliases: Record<string, string> = {
  ' ': 'Space',
  Esc: 'Escape',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen',
  ContextMenu: 'Menu',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': 'Plus',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
}

function normalizeShortcutKey(event: KeyboardEvent): string | null {
  const alias = shortcutKeyAliases[event.key]
  if (alias !== undefined) return alias
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key)) return event.key
  if (event.key.length === 1) return event.key === '+' ? 'Plus' : event.key.toUpperCase()
  return null
}

function onShortcutKeydown(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
  const input = event.currentTarget as HTMLInputElement
  if (['Escape', 'Backspace', 'Delete'].includes(event.key)) {
    shortcutCaptured = true
    globalShortcut.value = ''
    input.blur()
    return
  }

  const key = normalizeShortcutKey(event)
  if (!key) return

  const modifiers: string[] = []
  if (event.metaKey || event.ctrlKey) modifiers.push('CommandOrControl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (modifiers.length === 0) return

  const accelerator = [...modifiers, key].join('+')
  const unchanged = accelerator === globalShortcut.value
  shortcutCaptured = true
  globalShortcut.value = accelerator
  if (unchanged) void window.skillsManager?.setGlobalShortcut(accelerator)
  input.blur()
}

function startShortcutRecording(): void {
  recordingShortcut.value = true
  shortcutCaptured = false
  void window.skillsManager?.setGlobalShortcut('')
}

function stopShortcutRecording(): void {
  recordingShortcut.value = false
  if (!shortcutCaptured) void window.skillsManager?.setGlobalShortcut(globalShortcut.value)
}

function visible(...texts: string[]): boolean {
  const query = props.query.trim().toLowerCase()
  return !query || texts.some((text) => text.toLowerCase().includes(query))
}
</script>

<template>
  <section class="mb-10">
    <h2 class="mb-3 text-sm font-medium">{{ t('settings.catBehavior') }}</h2>
    <div class="divide-y rounded-xl border">
      <div
        v-if="visible(t('settings.autoRefreshTitle'), t('settings.autoRefreshDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.autoRefreshTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.autoRefreshDesc') }}
          </p>
        </div>
        <Switch v-model="autoRefresh" />
      </div>
      <div
        v-if="visible(t('settings.notifyDriftTitle'), t('settings.notifyDriftDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.notifyDriftTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.notifyDriftDesc') }}
          </p>
        </div>
        <Switch v-model="notifyDrift" />
      </div>
      <div
        v-if="visible(t('settings.confirmUninstallTitle'), t('settings.confirmUninstallDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.confirmUninstallTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.confirmUninstallDesc') }}
          </p>
        </div>
        <Switch v-model="confirmUninstall" />
      </div>
      <div
        v-if="visible(t('settings.backgroundModeTitle'), t('settings.backgroundModeDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.backgroundModeTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.backgroundModeDesc') }}
          </p>
        </div>
        <Switch v-model="backgroundMode" :disabled="!props.desktopPreferencesReady" />
      </div>
      <div
        v-if="visible(t('settings.launchAtLoginTitle'), t('settings.launchAtLoginDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.launchAtLoginTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.launchAtLoginDesc') }}
          </p>
        </div>
        <Switch v-model="launchAtLogin" :disabled="!props.launchAtLoginReady" />
      </div>
      <div
        v-if="visible(t('settings.launchHiddenTitle'), t('settings.launchHiddenDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.launchHiddenTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ t('settings.launchHiddenDesc') }}
          </p>
        </div>
        <Switch
          v-model="launchHidden"
          :disabled="
            !props.desktopPreferencesReady ||
            !props.launchAtLoginReady ||
            !backgroundMode ||
            !launchAtLogin
          "
        />
      </div>
      <div
        v-if="visible(t('settings.shortcutTitle'), t('settings.shortcutDesc'))"
        class="flex items-center justify-between gap-6 px-5 py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('settings.shortcutTitle') }}</p>
          <p class="mt-0.5 text-sm text-muted-foreground">{{ t('settings.shortcutDesc') }}</p>
          <p v-if="globalShortcut && !props.globalShortcutOk" class="mt-0.5 text-sm text-destructive">
            {{ t('settings.shortcutInvalid') }}
          </p>
        </div>
        <Input
          v-model="globalShortcut"
          :class="[
            'w-64 shrink-0 cursor-pointer font-mono text-sm',
            recordingShortcut && 'ring-1 ring-ring',
          ]"
          :placeholder="t(recordingShortcut ? 'settings.shortcutRecording' : 'settings.shortcutPh')"
          readonly
          @focus="startShortcutRecording"
          @blur="stopShortcutRecording"
          @keydown="onShortcutKeydown"
        />
      </div>
    </div>
  </section>
</template>
