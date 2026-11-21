<script setup lang="ts">
import Icon from './Icon.vue'

const model = defineModel<string>({ required: true })
withDefaults(defineProps<{ placeholder?: string; label: string }>(), { placeholder: 'Поиск' })
</script>

<template>
  <label class="us-s">
    <Icon name="search" :size="16" class="us-s__ico" />
    <input v-model="model" type="text" :placeholder="placeholder" :aria-label="label" spellcheck="false" autocomplete="off" enterkeyhint="search">
    <span v-if="$slots.end" class="us-s__end num" aria-live="polite"><slot name="end" /></span>
    <button v-if="model" type="button" class="us-s__x" aria-label="Очистить поиск" @click.prevent="model = ''"><Icon name="x" :size="14" /></button>
  </label>
</template>

<style scoped>
.us-s {
  display: flex; align-items: center; gap: var(--s2); height: var(--ctl-h); padding: 0 var(--s3); min-width: 0;
  border-radius: var(--r-pill); background: var(--card); box-shadow: inset 0 0 0 1px var(--line-2); color: var(--muted);
  transition: box-shadow var(--t);
}
.us-s:focus-within { box-shadow: inset 0 0 0 1.5px var(--blue); color: var(--ink); }
.us-s__ico { flex: none; }
.us-s input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font-size: var(--fs-sm); color: var(--ink); }
.us-s__end { flex: none; font-size: var(--fs-xs); color: var(--muted); }
.us-s__x { position: relative; flex: none; display: grid; place-items: center; width: 20px; height: 20px; margin-right: calc(-1 * var(--s1)); border-radius: 50%; color: var(--muted); }
.us-s__x:hover { background: var(--bg-3); color: var(--ink); }
.us-s__x::after { content: ''; position: absolute; inset: -12px; }
@media (max-width: 768px) { .us-s { height: 40px; } .us-s input { font-size: var(--fs-body); } }
</style>
