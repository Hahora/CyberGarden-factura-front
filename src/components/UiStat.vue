<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  value: string | number
  label: string
  hint?: string
  to?: RouteLocationRaw
  button?: boolean
  on?: boolean
  tone?: 'ok' | 'warn' | 'conflict' | 'blue'
  size?: 'md' | 'sm'
}>(), { size: 'md' })
defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <component
    :is="to ? 'RouterLink' : button ? 'button' : 'div'" :to="to" :type="button && !to ? 'button' : undefined"
    class="st" :class="['st--' + size, { 'st--act': to || button, 'is-on': on }]" :aria-pressed="button && !to ? !!on : undefined"
    @click="$emit('click', $event)"
  >
    <b class="st__v num">{{ value }}</b>
    <span class="st__l"><i v-if="tone" class="dot" :class="'dot--' + tone" aria-hidden="true" />{{ label }}</span>
    <span v-if="hint" class="st__h">{{ hint }}</span>
  </component>
</template>

<style scoped>
.st {
  display: grid; align-content: start; gap: 2px; min-width: 0; padding: var(--s4); text-align: left;
  border-radius: var(--r); background: var(--card); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink);
  transition: background-color var(--t-fast) ease, box-shadow var(--t-fast) ease;
}
.st--sm { padding: var(--s3); }
.st--act { cursor: pointer; }
@media (hover: hover) { .st--act:hover { background: var(--bg-2); } }
.st.is-on { background: var(--blue-wash); box-shadow: inset 0 0 0 1px var(--blue); }
.st__v { font-size: var(--fs-num); font-weight: 300; line-height: 1.15; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.st--sm .st__v { font-size: var(--fs-h2); font-weight: 500; letter-spacing: 0; }
.st__l { display: inline-flex; align-items: center; gap: var(--s2); min-width: 0; font-size: var(--fs-sm); color: var(--ink-2); }
.st__h { font-size: var(--fs-xs); color: var(--muted); line-height: 1.4; }
@media (max-width: 768px) { .st--act { min-height: 44px; } }
</style>
