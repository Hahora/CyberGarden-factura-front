<script setup lang="ts">
import Icon from './Icon.vue'

withDefaults(defineProps<{ icon?: string; title: string; text?: string; action?: string; actionIcon?: string; plain?: boolean; compact?: boolean }>(), { icon: 'info' })
defineEmits<{ action: [] }>()
</script>

<template>
  <div class="ue" :class="{ 'ue--plain': plain, 'ue--compact': compact }" role="status">
    <Icon :name="icon" :size="compact ? 22 : 28" class="ue__ico" />
    <b class="ue__t">{{ title }}</b>
    <p v-if="text || $slots.default" class="ue__d"><slot>{{ text }}</slot></p>
    <slot name="action">
      <button v-if="action" type="button" class="btn btn--soft btn--sm ue__a" @click="$emit('action')">
        <Icon v-if="actionIcon" :name="actionIcon" :size="16" />{{ action }}
      </button>
    </slot>
  </div>
</template>

<style scoped>
.ue {
  display: grid; justify-items: center; gap: var(--s2); padding: var(--s8) var(--s4);
  border-radius: var(--r-lg); background: var(--card); box-shadow: inset 0 0 0 1px var(--line);
  color: var(--muted); text-align: center; animation: rise var(--t-enter) var(--ease) both;
}
.ue--plain { background: none; box-shadow: none; }
.ue--compact { padding: var(--s6) var(--s3); }
.ue__ico { color: var(--faint); }
.ue__t { font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; color: var(--ink); }
.ue--compact .ue__t { font-size: var(--fs-body); }
.ue__d { font-size: var(--fs-sm); line-height: 1.5; max-width: 44ch; }
.ue__a, .ue > :deep(.btn) { margin-top: var(--s2); }
</style>
