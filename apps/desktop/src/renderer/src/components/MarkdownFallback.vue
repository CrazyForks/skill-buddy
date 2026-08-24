<script setup lang="ts">
defineProps<{ content?: string }>()
</script>

<template>
  <pre class="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{{ content }}</pre>
</template>
