<script setup lang="ts">
import UiSkeleton from './UiSkeleton.vue'
defineProps<{ part?: 'all' | 'sum' | 'set' | 'cov' | 'issues' }>()
</script>

<template>
  <div v-if="!part || part === 'all'" class="rfs" aria-busy="true">
    <div class="rfs__me"><UiSkeleton width="160px" /><div class="rfs__chips"><UiSkeleton v-for="i in 4" :key="i" variant="block" width="56px" height="24px" class="rfs__chip" /></div></div>
    <div class="rfs__ans">
      <UiSkeleton variant="circle" width="32px" />
      <div class="rfs__body">
        <UiSkeleton variant="block" height="44px" />
        <UiSkeleton variant="block" height="52px" />
        <RunFeedSkeleton part="set" />
        <RunFeedSkeleton part="issues" />
      </div>
    </div>
  </div>
  <UiSkeleton v-else-if="part === 'sum'" variant="block" height="52px" />
  <div v-else-if="part === 'set'" class="rfs__set" aria-busy="true">
    <div class="rfs__tabs"><UiSkeleton v-for="i in 5" :key="i" variant="block" width="84px" height="32px" /></div>
    <UiSkeleton variant="row" :lines="7" />
  </div>
  <div v-else-if="part === 'cov'" class="rfs__cov" aria-busy="true"><UiSkeleton :lines="1" width="40%" /><UiSkeleton variant="block" height="10px" /><UiSkeleton variant="block" height="10px" /><UiSkeleton variant="block" height="10px" /></div>
  <div v-else class="rfs__iss" aria-busy="true"><UiSkeleton v-for="i in 3" :key="i" variant="block" height="96px" /></div>
</template>

<style scoped>
.rfs { display: grid; gap: var(--block); }
.rfs__me { justify-self: end; display: grid; gap: var(--s2); justify-items: end; width: min(420px, 80%); }
.rfs__chips { display: flex; gap: var(--s1); }
.rfs__chip { border-radius: var(--r-pill); }
.rfs__ans { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--s3); align-items: start; }
.rfs__body { display: grid; gap: var(--block); min-width: 0; }
.rfs__set { display: grid; gap: var(--s3); }
.rfs__tabs { display: flex; gap: var(--s2); overflow: hidden; }
.rfs__cov { display: grid; gap: var(--s3); padding: var(--s4); border-radius: var(--r-lg); box-shadow: inset 0 0 0 1px var(--line); }
.rfs__iss { display: grid; gap: var(--s2); }
</style>
