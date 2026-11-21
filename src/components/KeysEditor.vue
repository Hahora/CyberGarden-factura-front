<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import Icon from './Icon.vue'
import { state } from '../store'
import {
  EDITABLE_GROUPS, FIXED_GROUPS, SHORTCUTS, bindingFromEvent, changedCount, conflictOf, isChanged, isEditable, keyLabels,
  labelOf, overridesSnapshot, partsOf, problemOf, reservedOf, resetAll, resetBinding, restoreOverrides, setBinding, shortcut, shownGroup, swapBinding, type Binding,
} from '../keys'
import { toast } from '../store'

const rec = ref<string | null>(null)
const problem = ref('')
const pending = ref<{ id: string; binding: Binding; other: string } | null>(null)
const live = ref('')
const btns = new Map<string, HTMLElement>()
const setBtn = (id: string) => (el: unknown) => {
  if (el) btns.set(id, el as HTMLElement)
  else btns.delete(id)
}
const readOnly = computed(() => state.mobile)
const rows = (g: string) => SHORTCUTS.filter((s) => s.group === g)
const labels = (id: string) => keyLabels(shortcut(id))

function onCapture(e: KeyboardEvent) {
  if (!rec.value) return
  e.preventDefault()
  e.stopPropagation()
  if (e.repeat) return
  if (e.code === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) return stop()
  const b = bindingFromEvent(e)
  if (!b) return
  const id = rec.value
  const bad = problemOf(id, b)
  if (bad) {
    problem.value = bad
    return
  }
  const other = conflictOf(id, b)
  if (other) {
    pending.value = { id, binding: b, other }
    problem.value = ''
    rec.value = null
    removeListeners()
    return
  }
  setBinding(id, b)
  live.value = `${labelOf(id)}: ${keyLabels(shortcut(id)).join(' ')}`
  stop(id)
}
function removeListeners() {
  window.removeEventListener('keydown', onCapture, true)
  window.removeEventListener('keyup', onSwallow, true)
}
const onSwallow = (e: KeyboardEvent) => {
  if (rec.value) e.stopPropagation()
}
function stop(focus?: string) {
  const id = focus ?? rec.value
  rec.value = null
  problem.value = ''
  removeListeners()
  if (id) setTimeout(() => btns.get(id)?.focus(), 0)
}
function start(id: string) {
  if (readOnly.value || !isEditable(id)) return
  pending.value = null
  problem.value = ''
  if (rec.value) removeListeners()
  rec.value = id
  window.addEventListener('keydown', onCapture, true)
  window.addEventListener('keyup', onSwallow, true)
}
function swap() {
  const p = pending.value
  if (!p) return
  swapBinding(p.id, p.binding)
  live.value = `Поменяли местами: ${labelOf(p.id)} и ${labelOf(p.other)}`
  pending.value = null
  setTimeout(() => btns.get(p.id)?.focus(), 0)
}
function cancelPending() {
  const id = pending.value?.id
  pending.value = null
  if (id) setTimeout(() => btns.get(id)?.focus(), 0)
}
const canSwap = computed(() => !!pending.value && isEditable(pending.value.other))
const doReset = (id: string) => {
  resetBinding(id)
  if (rec.value === id) stop()
}
const doResetAll = () => {
  stop()
  pending.value = null
  const prev = overridesSnapshot()
  resetAll()
  live.value = 'Все сочетания сброшены'
  toast('Сочетания сброшены', { label: 'Вернуть', run: () => restoreOverrides(prev) })
}
onBeforeUnmount(removeListeners)
</script>

<template>
  <div class="ke">
    <p v-if="readOnly" class="ke__note">Настройка — на компьютере. Здесь список для справки.</p>
    <span class="sr" role="status" aria-live="polite">{{ live }}</span>

    <section v-for="g in EDITABLE_GROUPS.filter(shownGroup)" :key="g" class="ke__group">
      <h3>{{ g }}</h3>
      <ul role="list">
        <li v-for="s in rows(g)" :key="s.id" :class="{ 'is-rec': rec === s.id }">
          <div class="ke__row">
            <span class="ke__name">{{ s.label }}</span>
            <button
              v-if="isChanged(s.id) && !readOnly"
              type="button" class="ke__reset" :aria-label="'Сбросить сочетание: ' + s.label" @click="doReset(s.id)"
            ><Icon name="undo" :size="14" /><span>Сбросить</span></button>
            <button
              v-if="!readOnly"
              :ref="setBtn(s.id)" type="button" class="ke__combo" :class="{ 'is-rec': rec === s.id, 'is-changed': isChanged(s.id) }"

              :aria-label="rec === s.id ? 'Нажмите новое сочетание для: ' + s.label + '. Esc — отмена' : 'Изменить сочетание: ' + s.label + ', сейчас ' + labels(s.id).join(' ')"
              @click="rec === s.id ? stop(s.id) : start(s.id)"
            >
              <span v-if="rec === s.id" class="ke__rec">Нажмите…</span>
              <template v-else><kbd v-for="(k, i) in labels(s.id)" :key="i">{{ k }}</kbd><Icon name="edit" :size="13" class="ke__pen" /></template>
            </button>
            <span v-else class="ke__combo ke__combo--ro"><kbd v-for="(k, i) in labels(s.id)" :key="i">{{ k }}</kbd></span>
          </div>
          <p v-if="rec === s.id && problem" class="ke__msg ke__msg--err" role="alert">{{ problem }}</p>
          <div v-if="pending && pending.id === s.id" class="ke__msg ke__msg--conf" role="alert">
            <span><kbd v-for="(k, i) in keyLabels(partsOf(pending.binding))" :key="i">{{ k }}</kbd> уже используется: «{{ labelOf(pending.other) }}»</span>
            <span class="ke__acts">
              <button v-if="canSwap" type="button" class="btn btn--sm" @click="swap">Поменять местами</button>
              <button type="button" class="btn btn--soft btn--sm" @click="cancelPending">Отмена</button>
            </span>
          </div>
          <p v-else-if="rec !== s.id && reservedOf(s.id)" class="ke__msg ke__msg--warn">Браузер может перехватить — выберите другое</p>
        </li>
      </ul>
    </section>

    <section v-for="g in FIXED_GROUPS.filter(shownGroup)" :key="g" class="ke__group ke__group--fixed">
      <h3>{{ g }} <span class="ke__lock">не меняется</span></h3>
      <ul role="list">
        <li v-for="s in rows(g)" :key="s.id">
          <div class="ke__row">
            <span class="ke__name">{{ s.label }}</span>
            <span class="ke__combo ke__combo--ro">
              <template v-for="(k, i) in labels(s.id)" :key="i"><span v-if="shortcut(s.id)[i] === 'then'" class="ke__then">{{ k }}</span><kbd v-else>{{ k }}</kbd></template>
            </span>
          </div>
        </li>
      </ul>
    </section>

    <footer v-if="!readOnly" class="ke__foot">
      <span>Клавиши без Ctrl и ⌘ не срабатывают, пока курсор в поле ввода.</span>
      <button type="button" class="btn btn--soft btn--sm" :disabled="!changedCount()" @click="doResetAll">Сбросить все</button>
    </footer>
  </div>
</template>

<style scoped>
.ke { display: flex; flex-direction: column; min-width: 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.ke__note { margin: 0 0 var(--s2); padding: var(--s2) var(--s3); border-radius: var(--r); font-size: var(--fs-sm); line-height: 1.45; color: var(--ink-2); background: var(--bg-2); }
.ke__group { padding: var(--s3) 0 var(--s1); border-top: 1px solid var(--line); }
.ke__group:first-of-type { border-top: 0; }
.ke__group h3 { display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.02em; color: var(--muted); margin-bottom: var(--s1); }
.ke__lock { font-weight: 400; color: var(--faint); }
.ke__group ul { list-style: none; padding: 0; margin: 0; }
.ke__group li { min-width: 0; }
.ke__row { display: flex; align-items: center; gap: var(--s3); min-height: 40px; font-size: var(--fs-body); }
.ke__name { flex: 1; min-width: 0; }
.ke__group--fixed .ke__name { color: var(--muted); }
.ke__group--fixed kbd { opacity: 0.7; }
.ke__combo { display: inline-flex; align-items: center; gap: var(--s1); flex: none; }
button.ke__combo {
  min-height: 32px; padding: var(--s1) var(--s2); border: 0; border-radius: var(--r-sm); background: transparent; color: inherit; cursor: pointer;
  transition: background-color var(--t) ease;
}
button.ke__combo:hover { background: var(--bg-2); box-shadow: inset 0 0 0 1px var(--muted); }
.ke__pen { color: var(--muted); opacity: 0; margin-left: var(--s1); transition: opacity var(--t) ease; }
button.ke__combo:hover .ke__pen, button.ke__combo:focus-visible .ke__pen { opacity: 1; }
@media (hover: none) { .ke__pen { opacity: 0.6; } }
button.ke__combo:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
button.ke__combo.is-rec { background: var(--blue-soft); box-shadow: inset 0 0 0 1px var(--blue); }
.ke__rec { font-size: var(--fs-sm); color: var(--ink); }
.ke__combo kbd { min-width: 24px; height: 24px; font-size: var(--fs-xs); }
.is-changed kbd { color: var(--ink); }
.ke__then { font-size: var(--fs-xs); color: var(--muted); padding: 0 var(--s1); }
.ke__reset {
  display: inline-flex; align-items: center; gap: var(--s1); min-height: 28px; padding: 0 var(--s2); border: 0; border-radius: var(--r-pill); background: transparent;
  font: inherit; font-size: var(--fs-xs); color: var(--muted); cursor: pointer; transition: background-color var(--t) ease, color var(--t) ease;
}
.ke__reset:hover { background: var(--bg-2); color: var(--ink); }
.ke__reset:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.ke__msg { margin: 0 0 var(--s2); font-size: var(--fs-sm); line-height: 1.4; }
.ke__msg--err { color: var(--red); }
.ke__msg--warn { color: var(--amber); }
.ke__msg--conf { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--s2); padding: var(--s2) var(--s3); border-radius: var(--r); background: var(--bg-2); color: var(--ink); }
.ke__acts { display: inline-flex; gap: var(--s2); }
.ke__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); margin-top: var(--s3); padding-top: var(--s3); border-top: 1px solid var(--line); font-size: var(--fs-sm); color: var(--muted); }

@media (max-width: 768px) {
  .ke__row { min-height: 44px; }
  .ke__foot { flex-direction: column; align-items: flex-start; }
}
</style>
