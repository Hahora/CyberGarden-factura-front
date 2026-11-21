<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="sg">
    <h3 v-if="title" class="sg__t">{{ title }}</h3>
    <div class="sg__box"><slot /></div>
  </section>
</template>

<style scoped>
.sg + .sg { margin-top: var(--s8); }
.sg__t { margin: 0 0 var(--s2); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.sg__box { overflow: hidden; background: var(--card); border-radius: var(--r-lg); box-shadow: 0 0 0 1px var(--line); }
</style>
