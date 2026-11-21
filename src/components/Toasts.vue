<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { dock, watchDock } from '../dock'
import { state, dismiss, type Toast } from '../store'
import Icon from './Icon.vue'

function close(t: Toast) {
  held.delete(t.id)
  clearTimeout(timers.get(t.id))
  dismiss(t.id)
}
function act(t: Toast) {
  t.action?.run()
  close(t)
}

const held = reactive(new Set<number>())
const bar = reactive<Record<number, { ms: number; gen: number }>>({})
const barOf = (t: Toast) => bar[t.id] ?? { ms: t.ms, gen: 0 }
const timers = new Map<number, number>()
const MAX = 1
const hold = (id: number) => {
  held.add(id)
  clearTimeout(timers.get(id))
}
function release(t: Toast) {
  held.delete(t.id)
  clearTimeout(timers.get(t.id))
  const ms = t.action ? 4000 : 2500
  bar[t.id] = { ms, gen: barOf(t).gen + 1 }
  timers.set(t.id, window.setTimeout(() => dismiss(t.id), ms))
}
watch(
  () => state.toasts.map((t) => t.id).join(','),
  (_n, old) => {
    const was = (old ?? '').split(',').filter(Boolean).map(Number)
    const ids = new Set(state.toasts.map((t) => t.id))
    for (const id of was) if (!ids.has(id) && held.has(id)) {
      const t = lastSeen.get(id)
      if (t) state.toasts.push(t)
    }
    state.toasts.forEach((t) => lastSeen.set(t.id, t))
    for (const k of Object.keys(bar)) if (!ids.has(Number(k))) delete bar[Number(k)]
    while (state.toasts.length > MAX) {
      const gone = state.toasts.shift()
      if (gone) held.delete(gone.id)
    }
  },
)
const lastSeen = new Map<number, Toast>()

watchDock()
const lift = computed((): Record<string, string> | undefined => {
  const W = window.innerWidth
  if (dock.on) return state.mobile ? { bottom: `${window.innerHeight - dock.top + 12}px` } : { bottom: `${window.innerHeight - dock.top + 12}px`, left: `${dock.left}px`, right: `${W - dock.right}px` }
  if (dock.zone && !state.mobile) return { left: `${dock.zl + 16}px`, right: `${W - dock.zr + 16}px` }
  return state.mobile ? undefined : { left: 'calc(var(--sidebar, 64px) + var(--s5))', justifyContent: 'flex-start' }
})
</script>

<template>
  <div class="toasts" :style="lift">
    <TransitionGroup name="toast" tag="div" class="toasts__stack" aria-live="polite" aria-relevant="additions text">
      <div
        v-for="t in state.toasts" :key="t.id" class="toast" role="status"
        @pointerenter="hold(t.id)" @pointerleave="release(t)" @focusin="hold(t.id)" @focusout="release(t)"
      >
        <span class="toast__text">{{ t.text }}</span>
        <span :key="barOf(t).gen" class="toast__bar" :class="{ 'is-held': held.has(t.id) }" :style="{ animationDuration: barOf(t).ms + 'ms' }" aria-hidden="true" />
        <button v-if="t.action" class="toast__action" type="button" @click="act(t)">
          {{ t.action.label }}
        </button>
        <button class="toast__close" type="button" aria-label="Закрыть" @click="close(t)">
          <Icon name="x" :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed; left: 0; right: 0; bottom: calc(var(--s5) + var(--safe-b)); z-index: var(--z-toast);
  display: flex; justify-content: center; pointer-events: none;
}
.toasts__stack { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--s2); min-width: 0; max-width: 100%; }

.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: var(--s3);
  width: min(440px, calc(100vw - 32px));
  padding: var(--s2) var(--s2) var(--s2) var(--s4);
  border-radius: var(--r);
  background: var(--solid); color: var(--on-solid);
  font-size: var(--fs-body); line-height: 1.4;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--on-solid) 10%, transparent), var(--shadow-pop);
}
.toast { position: relative; overflow: hidden; }
.toast__bar {
  position: absolute; left: 0; bottom: 0; height: 3px; width: 100%;
  background: color-mix(in srgb, var(--on-solid) 55%, transparent);
  transform-origin: left; animation: toast-bar linear forwards;
}
.toast__bar.is-held { animation-play-state: paused; opacity: .4; }
@keyframes toast-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.toast__text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.toast__action {
  flex: none; height: 32px; padding: 0 var(--s3); border-radius: var(--r-pill);
  font-weight: 600; color: var(--on-solid); background: color-mix(in srgb, var(--on-solid) 16%, transparent); white-space: nowrap;
  transition: background-color var(--t-fast) ease;
}
.toast__action:hover { background: color-mix(in srgb, var(--on-solid) 26%, transparent); }
.toast :focus-visible { outline-color: var(--blue); }
.toast__close {
  flex: none; display: grid; place-items: center;
  width: 26px; height: 26px; border-radius: var(--r-sm);
  color: color-mix(in srgb, var(--on-solid) 68%, transparent);
  transition: color var(--t-fast) ease, background-color var(--t-fast) ease;
}
.toast__close:hover { color: var(--on-solid); background: color-mix(in srgb, var(--on-solid) 10%, transparent); }

.toast-enter-active, .toast-leave-active {
  transition: opacity var(--t) ease, transform var(--t-slow) var(--ease);
}
.toast-move { transition: transform var(--t-slow) var(--ease); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(12px); }

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active, .toast-move { transition: opacity var(--t) ease; }
  .toast-enter-from, .toast-leave-to { transform: none; }
}
@media (max-width: 768px) {
  .toasts { left: var(--s3); right: var(--s3); bottom: calc(88px + var(--safe-b)); }
  .toasts__stack { width: 100%; max-width: 520px; margin: 0 auto; align-items: stretch; }
  .toast { width: 100%; max-width: none; gap: var(--s2); padding: var(--s1) var(--s1) var(--s1) var(--s3); font-size: var(--fs-sm); line-height: 1.3; }
  .toast__text { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  .toast__action, .toast__close { position: relative; }
  .toast__action { display: inline-flex; align-items: center; height: 36px; padding: 0 var(--s3); }
  .toast__close { width: 36px; height: 36px; }
  .toast__action::after, .toast__close::after { content: ''; position: absolute; inset: -4px; }
}
</style>
