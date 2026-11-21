<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Icon from './Icon.vue'
import KeysEditor from './KeysEditor.vue'
import { state } from '../store'

const close = () => (state.keysModal = false)
const onKey = (e: KeyboardEvent) => {
  if (state.keysModal && e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="fade">
    <div v-if="state.keysModal" class="overlay" @click.self="close">
      <div class="modal keys" role="dialog" aria-modal="true" aria-labelledby="keys-title">
        <header class="keys__head">
          <h2 id="keys-title">Горячие клавиши</h2>
          <button type="button" class="icon-btn" aria-label="Закрыть" @click="close"><Icon name="x" :size="18" /></button>
        </header>

        <KeysEditor />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.keys { width: min(620px, calc(100vw - 32px)); padding: 0 var(--s6) var(--s5); }
.keys__head { position: sticky; top: 0; display: flex; align-items: center; gap: var(--s3); padding: calc(var(--s3) + var(--s2)) 0 var(--s3); z-index: 1; background: var(--card); box-shadow: 0 1px 0 var(--line); }
.keys__head h2 { font-size: var(--fs-h2); font-weight: 600; }
.keys__head .icon-btn { margin-left: auto; }
.keys__hint { margin: 0 0 var(--s2); font-size: var(--fs-sm); color: var(--muted); }
@media (max-width: 768px) {
  .keys { width: 100%; padding: var(--s1) var(--s5) calc(var(--s4) + var(--safe-b)); }
  .keys__head { padding: var(--s3) 0; }
  .keys__hint { display: none; }
}
</style>
