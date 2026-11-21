<script setup lang="ts">
withDefaults(
  defineProps<{ variant?: 'line' | 'block' | 'circle' | 'row'; lines?: number; width?: string; height?: string }>(),
  { variant: 'line', lines: 1 },
)
</script>

<template>
  <span v-if="variant === 'block' || variant === 'circle'" class="sk" :class="'sk--' + variant" :style="{ width, height: height ?? width }" aria-hidden="true" />
  <span v-else class="sk-wrap" :class="'sk-wrap--' + variant" aria-hidden="true">
    <span v-for="i in lines" :key="i" class="sk" :class="'sk--' + variant" :style="{ width: variant === 'line' && i === lines && lines > 1 ? '62%' : width }" />
  </span>
</template>

<style scoped>
.sk {
  display: block; position: relative; overflow: hidden; border-radius: var(--r-sm);
  background: var(--sk-bg);
}
.sk::after {
  content: ''; position: absolute; inset: 0; translate: -100% 0;
  background: linear-gradient(90deg, transparent, var(--sk-hi), transparent);
  animation: sk-shine var(--sk-t) ease-in-out infinite;
}
@keyframes sk-shine { to { translate: 100% 0; } }
.sk--line { height: 0.8em; width: 100%; border-radius: var(--r-xs); }
.sk--block { width: 100%; border-radius: var(--r-lg); }
.sk--circle { border-radius: 50%; }
.sk--row { height: 40px; width: 100%; border-radius: var(--r); }
.sk-wrap { display: grid; width: 100%; }
.sk-wrap--line { gap: 0.6em; }
.sk-wrap--row { gap: var(--s2); }
@media (prefers-reduced-motion: reduce) { .sk::after { animation: none; } }
:global([data-motion='off']) .sk::after { animation: none; }
</style>
