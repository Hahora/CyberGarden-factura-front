<script setup lang="ts">
import Icon from './Icon.vue'
import { hideHint, hintSeen } from '../hints'

withDefaults(defineProps<{ id: string; icon?: string; variant?: 'line' | 'inline' }>(), { icon: 'info', variant: 'inline' })
</script>

<template>
  <p v-if="!hintSeen(id)" class="uh" :class="'uh--' + variant" role="note">
    <Icon :name="icon" :size="15" class="uh__ico" />
    <span class="uh__t"><slot /></span>
    <button type="button" class="uh__x" aria-label="Больше не показывать" data-tip="Больше не показывать" @click="hideHint(id)">
      <Icon name="x" :size="13" />
    </button>
  </p>
</template>

<style scoped>
.uh { display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-sm); color: var(--ink-2); }
.uh--line { flex: none; min-height: 40px; padding: 4px var(--s2) 4px var(--s5); background: var(--bg-2); border-bottom: 1px solid var(--line); }
.uh--inline { color: var(--muted); }
.uh__ico { flex: none; color: var(--blue); }
.uh--inline .uh__ico { color: var(--muted); }
.uh__t { flex: 1; min-width: 0; }
.uh__x { flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--r-xs); color: var(--muted); }
.uh__x:hover { background: var(--bg-3); color: var(--ink); }
@media (max-width: 768px) { .uh__x { width: 36px; height: 36px; } }
</style>
