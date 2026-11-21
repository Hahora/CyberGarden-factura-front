<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { closePrompt, prompt } from '../prompt'

const input = ref<HTMLInputElement>()
watch(
  () => prompt.open,
  async (o) => {
    if (!o) return
    await nextTick()
    input.value?.focus()
    input.value?.select()
  },
)
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    closePrompt(true)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closePrompt(false)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="up-fade">
      <div v-if="prompt.open" class="upr" @pointerdown.self="closePrompt(false)">
        <form class="upr__box" role="dialog" aria-modal="true" :aria-label="prompt.opts.title" @submit.prevent="closePrompt(true)">
          <h2 class="upr__title">{{ prompt.opts.title }}</h2>
          <input
            ref="input" v-model="prompt.value" class="upr__input" type="text" :placeholder="prompt.opts.placeholder"
            :aria-label="prompt.opts.label ?? prompt.opts.title" maxlength="120" autocomplete="off" @keydown="onKey"
          />
          <div class="upr__acts">
            <button type="button" class="btn btn--ghost" @click="closePrompt(false)">Отмена</button>
            <button type="submit" class="btn btn--dark" :disabled="!prompt.value.trim()">{{ prompt.opts.ok ?? 'Сохранить' }}</button>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.upr { position: fixed; inset: 0; z-index: var(--z-prompt); display: grid; place-items: center; padding: var(--s4); background: var(--scrim); }
.upr__box {
  width: min(440px, 100%); display: grid; gap: var(--s4); padding: var(--s6);
  border-radius: var(--r-lg); background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line);
}
.upr__title { font-size: var(--fs-h2); font-weight: 600; }
.upr__input {
  width: 100%; height: 44px; padding: 0 var(--s3); border-radius: var(--r); border: 0; outline: none;
  font: inherit; font-size: var(--fs-body); color: var(--ink); background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line);
}
.upr__input:focus { box-shadow: inset 0 0 0 2px var(--blue); }
.upr__acts { display: flex; justify-content: flex-end; gap: var(--s2); }
.btn--dark { background: var(--solid); color: var(--on-solid); }
.up-fade-enter-active, .up-fade-leave-active { transition: opacity var(--t) ease; }
.up-fade-enter-active .upr__box { transition: scale var(--t) var(--ease); }
.up-fade-enter-from, .up-fade-leave-to { opacity: 0; }
.up-fade-enter-from .upr__box { scale: 0.97; }
@media (max-width: 768px) {
  .upr__input { font-size: 16px; height: 48px; }
  .upr__acts .btn { min-height: 44px; flex: 1; }
}
</style>
