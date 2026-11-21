<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { backStack, goBack, type BackEntry } from '../viewState'
import { backWhere } from '../backWhere'
import { DATA_PATHS } from '../dataTabs'
import { state } from '../store'

const props = defineProps<{ inTabs?: boolean; fallback?: string }>()
const router = useRouter()
const top = computed<BackEntry | null>(() => backStack[backStack.length - 1] ?? null)
const where = computed(() => (top.value && !(props.inTabs && DATA_PATHS.includes(top.value.path)) ? backWhere(top.value) : null))

const mode = computed<'deep' | 'plain' | null>(() => {
  if (where.value && !state.mobile) return 'deep'
  if (props.fallback && !backStack.length) return 'plain'
  return null
})
function click() {
  if (mode.value === 'deep') return goBack(router)
  if (window.history.state?.back) router.back()
  else void router.push(props.fallback ?? '/app')
}
</script>

<template>
  <button
    v-if="mode" type="button" class="bc" :class="{ 'bc--deep': mode === 'deep' }"
    :aria-label="mode === 'deep' ? where!.full : 'Назад'" :data-tip="mode === 'deep' && where!.full !== where!.short ? where!.full : undefined"
    @click="click"
  >
    <Icon name="arrow-right" :size="16" class="bc__ico" />
    <span class="bc__t">{{ mode === 'deep' ? where!.short : 'Назад' }}</span>
  </button>
</template>

<style scoped>
.bc {
  flex: none; display: inline-flex; align-items: center; gap: var(--s2); max-width: 240px; height: 32px; padding: 0 var(--s3) 0 var(--s2);
  border-radius: var(--r-pill); font-size: var(--fs-sm); font-weight: 500; color: var(--ink);
  transition: background-color var(--t-fast) ease;
  animation: rise var(--t-enter) var(--ease) both;
}
.bc--deep { box-shadow: inset 0 0 0 1px var(--line-2); }
@media (hover: hover) { .bc:hover { background: var(--bg-2); } }
.bc__ico { rotate: 180deg; flex: none; color: var(--muted); }
.bc__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 768px) {
  .bc { height: 44px; padding: 0 var(--s3) 0 var(--s2); }
}
</style>
