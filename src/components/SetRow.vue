<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import UiSpinner from './UiSpinner.vue'

const props = defineProps<{ title: string; hint?: string; to?: string; action?: boolean; tone?: 'blue' | 'danger'; icon?: string; stack?: boolean; busy?: boolean }>()
const emit = defineEmits<{ (e: 'click'): void }>()
const tag = computed(() => (props.to ? 'RouterLink' : props.action ? 'button' : 'div'))
</script>

<template>
  <component :is="tag" class="sr" :class="[{ 'is-act': to || action, 'is-stack': stack }, tone && 'sr--' + tone]" :to="to" :type="action ? 'button' : undefined" :disabled="busy || undefined" :aria-busy="busy || undefined" @click="action && !busy && emit('click')">
    <UiSpinner v-if="busy" :size="16" tone="current" class="sr__ico" />
    <Icon v-else-if="icon" :name="icon" :size="18" class="sr__ico" />
    <span class="sr__t">
      <b>{{ title }}</b>
      <small v-if="hint">{{ hint }}</small>
    </span>
    <span v-if="$slots.default" class="sr__c"><slot /></span>
    <Icon v-if="to" name="chevron-right" :size="16" class="sr__go" />
  </component>
</template>

<style scoped>
.sr { display: flex; align-items: center; gap: var(--s4); width: 100%; min-height: calc(var(--pad-y) * 2 + 20px); padding: var(--pad-y) var(--s4); text-align: left; }
.sr + .sr { border-top: 1px solid var(--line); }
.is-act { cursor: pointer; transition: background-color var(--t) ease; }
.is-act:hover { background: var(--bg-2); }
.is-act:focus-visible { outline-offset: -2px; border-radius: 0; }
.sr__ico { color: var(--muted); }
.sr__t { flex: 1; min-width: 0; display: grid; gap: 2px; }
.sr__t b { font-size: var(--fs-body); font-weight: 500; line-height: 1.35; }
.sr__t small { font-size: var(--fs-sm); color: var(--muted); line-height: 1.4; }
.sr__c { flex: none; display: flex; align-items: center; gap: var(--s2); max-width: 100%; }
.sr__go { flex: none; color: var(--muted); }
.sr--blue .sr__t b { color: var(--blue); }
.sr--danger .sr__t b { color: var(--red); }
@media (max-width: 768px) {
  .sr { min-height: 52px; }
  .sr.is-stack { flex-direction: column; align-items: stretch; gap: var(--s3); }
  .is-stack .sr__c { width: 100%; }
}
</style>
