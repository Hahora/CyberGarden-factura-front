<script setup lang="ts">
withDefaults(defineProps<{ size?: number; tone?: 'muted' | 'blue' | 'ink' | 'current'; label?: string }>(), { size: 16, tone: 'muted' })
</script>

<template>
  <span class="spn" :class="'spn--' + tone" :style="{ width: size + 'px', height: size + 'px' }" role="status" :aria-label="label ?? 'Загрузка'" />
</template>

<style scoped>
.spn {
  display: inline-block; flex: none; border-radius: 50%;
  border: 2px solid var(--line-2); border-top-color: currentColor;
  animation: spn 0.8s linear infinite;
}
.spn--muted { color: var(--muted); }
.spn--blue { color: var(--blue); }
.spn--ink { color: var(--ink); }
.spn--current { color: inherit; border-color: color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor; }
@keyframes spn { to { rotate: 360deg; } }
@media (prefers-reduced-motion: reduce) { .spn { animation-duration: 2.4s; } }
</style>
