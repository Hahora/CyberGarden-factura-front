<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ value?: number; tone?: 'blue' | 'green' | 'amber' | 'ink'; size?: 'sm' | 'md'; label?: string; slow?: boolean }>(), {
  tone: 'blue',
  size: 'sm',
})
const pct = computed(() => (props.value == null ? null : Math.max(0, Math.min(100, props.value))))
</script>

<template>
  <span
    class="prg" :class="['prg--' + size, 'prg--' + tone, { 'is-indet': pct == null, 'is-slow': slow }]" role="progressbar"
    :aria-valuenow="pct ?? undefined" aria-valuemin="0" aria-valuemax="100" :aria-label="label"
  >
    <span class="prg__bar" :style="pct != null ? { width: pct + '%' } : undefined" />
  </span>
</template>

<style scoped>
.prg { display: block; width: 100%; overflow: hidden; border-radius: var(--r-pill); background: var(--line); }
.prg--sm { height: 3px; }
.prg--md { height: 6px; }
.prg__bar { display: block; height: 100%; border-radius: inherit; transition: width 300ms var(--ease); }
.prg.is-slow .prg__bar { transition-duration: 1900ms; transition-timing-function: linear; }
.prg--blue .prg__bar { background: var(--blue); }
.prg--green .prg__bar { background: var(--green); }
.prg--amber .prg__bar { background: var(--amber); }
.prg--ink .prg__bar { background: var(--ink); }
.prg.is-indet .prg__bar { width: 35%; animation: prg-run 1.2s ease-in-out infinite; }
@keyframes prg-run { from { translate: -100% 0; } to { translate: 300% 0; } }
@media (prefers-reduced-motion: reduce) { .prg.is-indet .prg__bar { animation-duration: 3s; } }
</style>
