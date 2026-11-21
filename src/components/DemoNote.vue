<script setup lang="ts">
import { closeDemoNote, demoText } from '../demoNote'
</script>

<template>
  <Teleport to="body">
    <Transition name="note">
      <div v-if="demoText" class="note" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></svg>
        <span>{{ demoText }}</span>
        <button type="button" aria-label="Закрыть" @click="closeDemoNote">×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.note { position: fixed; left: 50%; bottom: calc(var(--s6) + var(--safe-b, 0px)); z-index: var(--z-toast); display: flex; align-items: center; gap: var(--s3); width: max-content; max-width: min(560px, calc(100% - 32px)); padding: var(--s3) var(--s2) var(--s3) var(--s4); border-radius: var(--r); background: var(--solid); color: var(--on-solid); font-size: 15px; line-height: 1.35; box-shadow: var(--shadow-pop); transform: translateX(-50%); }
.note svg { width: 20px; height: 20px; flex: none; color: color-mix(in srgb, var(--on-solid) 68%, transparent); }
.note span { flex: 1; }
.note button { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border: 0; border-radius: var(--r-sm); background: none; color: color-mix(in srgb, var(--on-solid) 68%, transparent); font-size: 22px; cursor: pointer; }
.note button:hover { color: var(--on-solid); background: color-mix(in srgb, var(--on-solid) 10%, transparent); }
.note-enter-active, .note-leave-active { transition: opacity var(--t-slow) var(--ease), transform var(--t-slow) var(--ease); }
.note-enter-from, .note-leave-to { opacity: 0; transform: translate(-50%, 16px); }
</style>
