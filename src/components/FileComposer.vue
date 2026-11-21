<script setup lang="ts">
import UiSpinner from './UiSpinner.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import UiSelect from './UiSelect.vue'
import { state } from '../store'
import { inbox, takeInbox } from '../case/runs'
import { useVoice } from '../useVoice'

const props = withDefaults(defineProps<{ placeholder?: string; autofocus?: boolean; sendLabel?: string; busy?: boolean; busyText?: string; ask?: boolean; pickDomain?: boolean }>(), {
  placeholder: 'Перетащите PDF, папку или ZIP',
  autofocus: false,
  sendLabel: 'Разобрать',
})
const emit = defineEmits<{ send: [files: File[], folder: string, domain: 'solar' | 'rag']; ask: [text: string] }>()
const domain = ref<'solar' | 'rag'>('solar')
const DOMAINS: { id: 'solar' | 'rag'; label: string; icon: string; tip: string }[] = [
  { id: 'solar', label: 'Солнечные элементы', icon: 'sun', tip: 'Тонкоплёночные солнечные элементы' },
  { id: 'rag', label: 'RAG', icon: 'search', tip: 'RAG и поиск по документам' },
]

const files = ref<File[]>([])
const text = ref('')
const area = ref<HTMLTextAreaElement | null>(null)
const can = computed(() => files.value.length > 0 || (props.ask && text.value.trim().length > 0))
function grow() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}
const folder = ref('')
const voice = useVoice(text, { onText: () => void nextTick(grow), onEnd: () => area.value?.focus() })
const root = ref<HTMLElement | null>(null)
const filesEl = ref<HTMLInputElement | null>(null)
const folderEl = ref<HTMLInputElement | null>(null)
const menu = ref(false)

const SHOW = computed(() => (state.mobile ? 3 : 6))
const shown = computed(() => files.value.slice(0, SHOW.value))
const more = computed(() => Math.max(0, files.value.length - SHOW.value))
const count = computed(() => files.value.length)

function add(list: File[], dir = '') {
  if (!list.length) return
  const seen = new Set(files.value.map((f) => f.name + ':' + f.size))
  for (const f of list) {
    const k = f.name + ':' + f.size
    if (!seen.has(k)) { seen.add(k); files.value.push(f) }
  }
  if (dir && !folder.value) folder.value = dir
  void nextTick(() => (area.value ?? root.value)?.focus({ preventScroll: true }))
}
function remove(i: number) {
  files.value.splice(i, 1)
  if (!files.value.length) folder.value = ''
}
function clear() {
  files.value = []
  folder.value = ''
}
function send() {
  if (!can.value) return
  voice.stop()
  if (count.value) emit('send', [...files.value], folder.value, domain.value)
  const q = text.value.trim()
  if (props.ask && q) emit('ask', q)
  clear()
  text.value = ''
  void nextTick(grow)
}
function fill(v: string) {
  text.value = v
  void nextTick(() => { grow(); area.value?.focus() })
}
function onPick(e: Event, dir: boolean) {
  const input = e.target as HTMLInputElement
  const list = [...(input.files ?? [])]
  const rel = (list[0] as (File & { webkitRelativePath?: string }) | undefined)?.webkitRelativePath ?? ''
  add(dir ? list.filter((f) => /\.(pdf|zip)$/i.test(f.name)) : list, dir ? rel.split('/')[0] : '')
  input.value = ''
}
function pick(dir: boolean) {
  menu.value = false
  ;(dir ? folderEl : filesEl).value?.click()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && can.value && (e.target === root.value || e.target === area.value)) {
    e.preventDefault()
    send()
  }
  if (e.key === 'Escape' && menu.value) menu.value = false
}

const takeIn = () => {
  if (!inbox.files.length) return
  const { files: list, folder: dir } = takeInbox()
  add(list, dir)
}
watch(() => inbox.files.length, takeIn)
watch(() => inbox.pick, () => pick(false))
watch(() => inbox.clear, clear)

const onDoc = (e: MouseEvent) => { if (menu.value && !root.value?.contains(e.target as Node)) menu.value = false }
onMounted(() => {
  takeIn()
  if (props.autofocus && !state.mobile) (area.value ?? root.value)?.focus({ preventScroll: true })
  document.addEventListener('click', onDoc)
})
onBeforeUnmount(() => document.removeEventListener('click', onDoc))
defineExpose({ add, clear, fill, focus: () => (area.value ?? root.value)?.focus() })

const ext = (n: string) => (/\.zip$/i.test(n) ? 'zip' : /\.pdf$/i.test(n) ? 'pdf' : 'file')
const sendText = computed(() => (count.value ? `${props.sendLabel} ${count.value}` : props.sendLabel))
</script>

<template>
  <div ref="root" class="fc" :class="{ 'is-drag': state.dragging, 'has-files': count > 0, 'is-rec': voice.listening.value }" tabindex="0" role="group" aria-label="Файлы для разбора" @keydown="onKey">
    <p v-if="voice.listening.value" class="fc__rec" aria-live="polite"><span class="fc__recdot" />Слушаю… говорите, текст появится в поле</p>
    <div class="fc__area" @click.self="!count && !ask && pick(false)">
      <p v-if="!count && !ask" class="fc__ph" @click="pick(false)">{{ placeholder }}</p>
      <ul v-if="count" class="fc__chips" role="list">
        <li v-for="(f, i) in shown" :key="f.name + i" class="chip chip--soft fc__chip">
          <Icon :name="ext(f.name) === 'zip' ? 'folder' : 'doc'" :size="14" class="chip__ico" />
          <span class="chip__t">{{ f.name }}</span>
          <button type="button" class="chip__x" :aria-label="'Убрать ' + f.name" data-tip="Убрать" @click="remove(i)"><Icon name="x" :size="14" /></button>
        </li>
        <li v-if="more" class="chip chip--soft fc__chip num">+{{ more }}</li>
      </ul>
      <textarea
        v-if="ask" ref="area" v-model="text" class="fc__text" :class="{ 'has-chips': count }" rows="1" :placeholder="placeholder"
        aria-label="Вопрос о результатах" @input="grow"
      />
    </div>
    <div class="fc__bar">
      <div class="fc__clipw">
        <button type="button" class="icon-btn fc__clip" :class="{ 'is-open': menu }" aria-label="Добавить PDF" data-tip="Добавить PDF, папку или ZIP" :aria-expanded="menu" aria-haspopup="menu" @click.stop="menu = !menu">
          <Icon name="clip" />
        </button>
        <Transition name="pop">
          <div v-if="menu" class="menu fc__menu" role="menu">
            <button type="button" class="menu__item" role="menuitem" @click="pick(false)"><Icon name="doc" :size="16" />Файлы PDF или ZIP</button>
            <button type="button" class="menu__item" role="menuitem" @click="pick(true)"><Icon name="folder" :size="16" />Папка</button>
          </div>
        </Transition>
      </div>
      <UiSelect
        v-if="pickDomain && state.mobile" class="fc__dom" :model-value="domain" :options="DOMAINS.map((d) => ({ value: d.id, label: d.id === 'solar' ? 'Солнечные' : d.label, icon: d.icon }))"
        label="Область разбора" variant="chip" size="sm" @update:model-value="(v) => (domain = v as 'solar' | 'rag')"
      />
      <div v-else-if="pickDomain" class="seg fc__dom" role="radiogroup" aria-label="Область разбора">
        <button v-for="d in DOMAINS" :key="d.id" type="button" role="radio" :aria-checked="domain === d.id" :data-tip="d.tip" @click="domain = d.id"><Icon :name="d.icon" :size="14" />{{ d.label }}</button>
      </div>
      <span class="fc__flex" />
      <button
        v-if="ask" type="button" class="icon-btn fc__mic" :class="{ 'is-on': voice.listening.value }"
        :aria-label="voice.listening.value ? 'Остановить запись' : 'Голосовой ввод'" :aria-pressed="voice.listening.value"
        :data-tip="voice.listening.value ? 'Остановить' : 'Голосовой ввод'" @click="voice.toggle"
      >
        <span v-if="voice.listening.value" class="wave" aria-hidden="true"><i /><i /><i /><i /></span>
        <Icon v-else name="mic" :size="18" />
      </button>
      <button type="button" class="fc__send" :class="{ 'is-on': count > 0 || busy, 'is-busy': busy }" :disabled="!can || busy" :data-tip="count && !ask ? 'Нажмите, чтобы начать разбор' : undefined" :aria-label="count ? sendText : ask ? 'Спросить' : 'Разобрать'" @click="send">
        <UiSpinner v-if="busy" :size="14" tone="current" /><Icon v-else name="send" :size="16" />
        <span v-if="busy" class="fc__sendt">{{ busyText || 'Отправляем…' }}</span>
        <span v-else-if="count" class="fc__sendt">{{ sendText }}</span>
      </button>
    </div>
    <input ref="filesEl" class="visually-hidden" type="file" accept="application/pdf,.pdf,.zip,application/zip" multiple tabindex="-1" aria-label="Выбрать PDF или ZIP" @change="onPick($event, false)" />
    <input ref="folderEl" class="visually-hidden" type="file" webkitdirectory multiple tabindex="-1" aria-label="Выбрать папку" @change="onPick($event, true)" />
  </div>
</template>

<style scoped>
.fc {
  position: relative; width: 100%; padding: var(--s3) var(--s3) var(--s2) var(--s4); border-radius: var(--r-lg);
  background: var(--card); box-shadow: var(--shadow), 0 0 0 1px var(--line); outline: none;
  transition: box-shadow var(--t) ease, background-color var(--t) ease;
}
.fc:focus-within, .fc:focus-visible { box-shadow: var(--shadow), 0 0 0 1.5px var(--line-2); }
.fc.is-drag { box-shadow: 0 0 0 2px var(--blue); background: var(--blue-wash); }
.fc__area { min-height: 34px; padding: var(--s1) 0 var(--s2); }
.fc__ph { font-size: max(16px, var(--fs-body)); line-height: 1.55; color: var(--faint); cursor: pointer; }
.fc__text {
  display: block; width: 100%; min-height: 26px; max-height: 200px; resize: none; border: 0; outline: 0; background: none; padding: 0;
  font: inherit; font-size: max(16px, var(--fs-body)); line-height: 1.55; color: var(--ink);
}
.fc__text::placeholder { color: var(--faint); }
.fc__text.has-chips { margin-top: var(--s2); }
.fc__dom { margin-left: var(--s2); }
.fc__dom > button { height: 28px; padding: 0 var(--s2); font-size: var(--fs-xs); }
.fc__chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
.fc__chip { max-width: 240px; color: var(--ink); animation: rise var(--t-enter) var(--ease) both; }
.fc__chip.num { color: var(--muted); }
.fc__chip .chip__x { position: relative; width: 24px; height: 24px; }
.fc__chip .chip__x::after { content: ''; position: absolute; inset: -6px; }

.fc.is-rec { box-shadow: var(--shadow), 0 0 0 1.5px var(--red); }
.fc__rec { display: flex; align-items: center; gap: var(--s2); margin: 0 0 var(--s2); font-size: var(--fs-xs); color: var(--red); }
.fc__recdot { width: 7px; height: 7px; border-radius: 50%; background: var(--red); animation: fc-rec 1.2s ease-in-out infinite; }
@keyframes fc-rec { 50% { opacity: 0.3; } }
.fc__mic.is-on { background: var(--red-soft); color: var(--red); }
.wave { display: flex; align-items: center; gap: 2px; height: 16px; }
.wave i { width: 3px; height: 100%; border-radius: var(--r-pill); background: currentColor; animation: fc-wave 900ms ease-in-out infinite; }
.wave i:nth-child(2) { animation-delay: 120ms; }
.wave i:nth-child(3) { animation-delay: 240ms; }
.wave i:nth-child(4) { animation-delay: 360ms; }
@keyframes fc-wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .wave i, .fc__recdot { animation: none; } }
.fc__bar { display: flex; align-items: center; gap: var(--s2); margin-left: calc(-1 * var(--s2)); }
.fc__clipw { position: relative; }
.fc__clip.is-open { background: var(--bg-2); }
.fc__menu { position: absolute; left: 0; bottom: calc(100% + var(--s2)); min-width: 200px; }
.fc__flex { flex: 1; }
.fc__send {
  height: 36px; min-width: 36px; padding: 0 var(--s3); border-radius: var(--r-pill); display: inline-flex; align-items: center; justify-content: center; gap: var(--s2); flex: none;
  background: var(--solid); color: var(--on-solid); font-size: var(--fs-sm); font-weight: 500; white-space: nowrap;
  transition: opacity var(--t) ease, background-color var(--t-fast) ease, transform var(--t-fast) var(--ease);
}
.fc__send:not(:disabled):hover { background: var(--solid-hover); }
.fc__send:not(.is-on) { width: 36px; padding: 0; }
.fc__send.is-on { padding: 0 var(--s4) 0 var(--s3); background: var(--blue); color: #fff; box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 22%, transparent); animation: fc-nudge 1.1s var(--ease) 1; }
.fc__send.is-on:not(:disabled):hover { background: color-mix(in srgb, var(--blue) 88%, #000); }
.fc__nudge { margin: var(--s1) 0 0; text-align: right; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: rise var(--t-enter) var(--ease) both; }
@keyframes fc-nudge {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--blue) 55%, transparent); transform: scale(1); }
  35% { transform: scale(1.05); }
  100% { box-shadow: 0 0 0 12px color-mix(in srgb, var(--blue) 0%, transparent); transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) { .fc__send.is-on { animation: none; } }
.fc__send.is-busy { min-width: 170px; }
.fc__sendt { font-variant-numeric: tabular-nums; }
.fc__send.is-busy:disabled { opacity: 0.7; }
.fc__send:disabled { opacity: 0.18; cursor: default; }
.fc__send:not(:disabled):active { transform: scale(0.96); }

@media (max-width: 768px) {
  .fc { padding: var(--s2) var(--s2) var(--s1) var(--s3); }
  .fc__bar { margin-left: calc(-1 * var(--s1)); gap: var(--s1); }
  .fc__clip { width: 44px; height: 44px; }
  .fc__send { height: 44px; min-width: 44px; }
  .fc__send:not(.is-on) { width: 44px; }
  .fc__chip { max-width: 100%; }
  .fc__chip .chip__x { width: 32px; height: 32px; }
  .fc__chip .chip__x::after { inset: -6px; }
}
</style>
