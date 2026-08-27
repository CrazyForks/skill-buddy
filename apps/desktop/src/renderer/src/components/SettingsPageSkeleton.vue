<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="flex min-h-0 flex-1">
    <aside class="sidebar-surface flex w-[276px] shrink-0 flex-col">
      <div class="px-4 pb-2 pt-10">
        <Skeleton class="h-8 w-full" />
      </div>
      <div class="px-4 pb-2">
        <Skeleton class="h-8 w-full" />
      </div>
      <div class="flex flex-1 flex-col gap-4 px-5 pt-4">
        <div v-for="group in 3" :key="group" class="flex flex-col gap-2">
          <Skeleton class="h-3 w-16" />
          <Skeleton class="h-8 w-full" />
          <Skeleton class="h-8 w-11/12" />
        </div>
      </div>
    </aside>

    <main class="content-surface min-w-0 flex-1 overflow-hidden">
      <div class="mx-auto max-w-3xl px-10 py-10">
        <Skeleton class="mb-8 h-8 w-32" />
        <div class="divide-y rounded-xl border">
          <div v-for="row in 3" :key="row" class="flex items-center justify-between gap-6 px-5 py-4">
            <div class="flex flex-col gap-2">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-3 w-64" />
            </div>
            <Skeleton class="h-8 w-20 shrink-0" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
