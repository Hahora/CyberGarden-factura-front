<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import Icon from './Icon.vue'
import UiSelect from './UiSelect.vue'
import { useRouter } from 'vue-router'
import { openDeep, useViewState } from '../viewState'
import { picker, state, toast } from '../store'
import { COLLECTIONS, type CollectionId } from '../data'

const props = withDefaults(defineProps<{ collection: CollectionId; projectId?: string | null; placeholder?: string; autofocus?: boolean; lockCollection?: boolean; busy?: boolean; scopeLabel?: string; scopeIcon?: string }>(), {
  projectId: null,
  placeholder: 'Спросите коллекцию или перетащите PDF…',
  autofocus: false,
  lockCollection: false,
  busy: false,
})
const emit = defineEmits<{ send: [text: string]; collection: [id: CollectionId]; stop: [] }>()

const colOptions = Object.values(COLLECTIONS).map((c) => ({ value: c.id, label: c.name, icon: c.icon }))

const phonePlaceholder = computed(() => props.placeholder.replace(/ или перетащите PDF/, ''))
const draft = useViewState('composer', () => ({ text: '' }))
const text = toRef(draft, 'text')
const plus = ref(false)
const router = useRouter()
const plusDo = (fn: () => void) => {
  plus.value = false
  fn()
}
const area = ref<HTMLTextAreaElement | null>(null)
const can = computed(() => text.value.trim().length > 0)

function grow() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 220) + 'px'
}
function send() {
  if (props.busy) return emit('stop')
  if (!can.value) return
  emit('send', text.value.trim())
  text.value = ''
  void nextTick(grow)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.busy) {
    e.preventDefault()
    return emit('stop')
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}
function fill(v: string) {
  text.value = v
  void nextTick(() => {
    grow()
    area.value?.focus()
  })
}
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }
const SR = (window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition
const listening = ref(false)
const interim = ref('')
let rec: Rec | null = null
let base = ''
function toggleVoice() {
  if (listening.value) return rec?.stop()
  if (!SR) return toast('Голосовой ввод не поддерживается в этом браузере — попробуйте Chrome или Edge')
  rec = new SR()
  rec.lang = 'ru-RU'
  rec.interimResults = true
  rec.continuous = true
  base = text.value ? text.value.replace(/\s*$/, ' ') : ''
  rec.onresult = (e) => {
    let fin = ''
    let mid = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!
      if (r.isFinal) fin += r[0]!.transcript
      else mid += r[0]!.transcript
    }
    if (fin) base += fin.trim() + ' '
    interim.value = mid
    text.value = (base + mid).trimStart()
    void nextTick(grow)
  }
  rec.onerror = (e) => {
    if (e.error === 'not-allowed') toast('Нет доступа к микрофону — разрешите его в настройках браузера')
    else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Не удалось распознать речь')
  }
  rec.onend = () => {
    listening.value = false
    interim.value = ''
    text.value = text.value.trim()
    area.value?.focus()
  }
  try {
    rec.start()
    listening.value = true
  } catch {
    listening.value = false
  }
}
onBeforeUnmount(() => rec?.stop())

defineExpose({ fill, focus: () => area.value?.focus() })
onMounted(() => {
  if (text.value) void nextTick(grow)
  if (props.autofocus) area.value?.focus()
})
</script>

<template>
  <div class="cmp" :class="{ 'is-drag': state.dragging, 'is-rec': listening }">
    <Transition name="pop">
      <div v-if="plus" class="plus" role="menu">
        <button type="button" class="plus__item" @click="plusDo(() => picker.open(projectId))"><Icon name="upload" :size="20" />Загрузить PDF</button>
        <button type="button" class="plus__item" @click="plusDo(() => openDeep(router, '/explore'))"><Icon name="chart" :size="20" />Обзор данных</button>
      </div>
    </Transition>
    <div v-if="plus" class="plus__bd" @click="plus = false" />
    <p v-if="listening" class="cmp__rec" aria-live="polite"><span class="cmp__recdot" />Слушаю… говорите, текст появится в поле</p>
    <textarea
      ref="area"
      v-model="text"
      class="cmp__area"
      rows="1"
      :placeholder="state.mobile ? phonePlaceholder : placeholder"
      aria-label="Вопрос к коллекции"
      @input="grow"
      @keydown="onKey"
    />
    <div class="cmp__bar">
      <template v-if="state.mobile">
        <button type="button" class="cmp__plus" :class="{ 'is-open': plus }" :aria-expanded="plus" aria-label="Добавить: загрузить PDF, обзор данных" @click="plus = !plus">
          <Icon name="plus" :size="20" />
        </button>
        <span v-if="lockCollection" class="cmp__chip"><Icon :name="scopeIcon ?? COLLECTIONS[collection].icon" :size="14" />{{ scopeLabel ?? COLLECTIONS[collection].name }}</span>
        <UiSelect v-else :model-value="collection" :options="colOptions" label="Коллекция для поиска" variant="chip" size="sm" @update:model-value="(v) => emit('collection', v as CollectionId)" />
        <span class="cmp__flex" />
      </template>
      <button v-if="!state.mobile" type="button" class="icon-btn" data-tip="Загрузить PDF" aria-label="Загрузить PDF" @click="picker.open(projectId)">
        <Icon name="clip" />
      </button>
      <div v-if="!state.mobile" class="cmp__col">
        <template v-if="lockCollection">
          <Icon :name="scopeIcon ?? COLLECTIONS[collection].icon" :size="16" />
          <span>{{ scopeLabel ?? COLLECTIONS[collection].name }}</span>
        </template>
        <div v-else class="cmp__seg" role="radiogroup" aria-label="Коллекция для поиска">
          <button
            v-for="o in colOptions" :key="o.value" type="button" class="cmp__segb" :class="{ on: collection === o.value }"
            role="radio" :aria-checked="collection === o.value" @click="emit('collection', o.value as CollectionId)"
          ><Icon :name="o.icon" :size="14" />{{ o.label }}</button>
        </div>
      </div>
      <button
        type="button"
        class="cmp__mic"
        :class="{ 'is-on': listening }"
        :aria-label="listening ? 'Остановить запись' : 'Голосовой ввод'"
        :aria-pressed="listening"
        :data-tip="listening ? 'Остановить' : 'Голосовой ввод'"
        @click="toggleVoice"
      >
        <span v-if="listening" class="wave" aria-hidden="true"><i /><i /><i /><i /></span>
        <Icon v-else name="mic" :size="18" />
      </button>
      <button
        type="button" class="cmp__send" :class="{ 'is-stop': busy }" :disabled="!busy && !can"
        :aria-label="busy ? 'Остановить ответ' : 'Отправить'" :data-tip="busy ? 'Остановить (Esc)' : undefined" @click="send"
      >
        <svg v-if="busy" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="2.5" fill="currentColor" /></svg>
        <Icon v-else name="send" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.cmp {
  width: 100%; padding: 14px 14px 10px 18px; border-radius: var(--r-lg);
  background: var(--card); box-shadow: var(--shadow), 0 0 0 1px var(--line);
  transition: box-shadow var(--t) ease;
}
.cmp:focus-within { box-shadow: var(--shadow), 0 0 0 1.5px var(--line-2); }
.cmp.is-drag { box-shadow: 0 0 0 2px var(--blue); }
.cmp__area {
  display: block; width: 100%; min-height: 26px; max-height: 220px; resize: none; border: 0; outline: 0; background: none;
  font-size: 16px; line-height: 1.55; padding: 2px 0 8px;
}
.cmp__bar { display: flex; align-items: center; gap: 8px; margin-left: -8px; }
.cmp__col { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--s1); color: var(--muted); font-size: var(--fs-sm); }
.cmp__col > span { margin-left: 2px; }
.cmp__seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--r); background: var(--bg-2); }
.cmp__segb { display: inline-flex; align-items: center; gap: var(--s1); height: 28px; padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; transition: background-color var(--t) ease, color var(--t) ease; }
.cmp__segb:hover { color: var(--ink); }
.cmp__segb.on { background: var(--card); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.cmp__send {
  width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex: none;
  background: var(--ink); color: var(--bg); transition: opacity var(--t) ease, transform 120ms var(--ease);
}
.cmp__send:disabled { opacity: 0.18; cursor: default; }
.cmp__send.is-stop { background: var(--ink); }
.cmp__send:not(:disabled):active { transform: scale(0.94); }
.cmp.is-rec { box-shadow: var(--shadow), 0 0 0 1.5px var(--red); }
.cmp__rec { display: flex; align-items: center; gap: 8px; margin: -2px 0 8px; font-size: var(--fs-xs); color: var(--red); }
.cmp__recdot { width: 7px; height: 7px; border-radius: 50%; background: var(--red); animation: rec 1.2s ease-in-out infinite; }
@keyframes rec { 50% { opacity: 0.3; } }
.cmp__mic {
  width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; color: var(--ink-2);
  transition: background-color var(--t) ease, color var(--t) ease;
}
.cmp__mic:hover { background: var(--bg-2); color: var(--ink); }
.cmp__mic.is-on { background: var(--red-soft); color: var(--red); }
.wave { display: flex; align-items: center; gap: 2px; height: 16px; }
.wave i { width: 3px; height: 100%; border-radius: var(--r-pill); background: currentColor; animation: wave 900ms ease-in-out infinite; }
.wave i:nth-child(2) { animation-delay: 120ms; }
.wave i:nth-child(3) { animation-delay: 240ms; }
.wave i:nth-child(4) { animation-delay: 360ms; }
@keyframes wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
@media (max-width: 768px) {
  .cmp { padding: 10px 8px 6px 14px; border-radius: var(--r-lg); }
  .cmp__area { font-size: 16px; max-height: 160px; }
  .cmp__bar { margin-left: -4px; gap: 2px; }
  .cmp__mic, .cmp__send, .cmp__plus { width: 44px; height: 44px; }
  .cmp__chip { height: 44px; padding: 0 var(--s3); background: none; }
  .cmp :deep(.us--chip) { min-height: 44px; }
}
.cmp { position: relative; }
.cmp__plus {
  width: 44px; height: 44px; flex: none; display: grid; place-items: center; border-radius: 50%;
  background: var(--bg-2); color: var(--ink); transition: rotate 220ms var(--ease), background-color var(--t) ease;
}
.cmp__plus.is-open { rotate: 45deg; }
.cmp__chip { min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 5px; height: 30px; margin-left: 6px; padding: 0 10px; border-radius: var(--r-pill); font-size: var(--fs-sm); color: var(--muted); background: var(--bg-2); }
.cmp__flex { flex: 1; }
.plus {
  position: absolute; z-index: 30; left: 0; bottom: calc(100% + 8px); width: min(300px, 100%); padding: 6px;
  border-radius: var(--r-lg); background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line);
}
.plus__bd { position: fixed; inset: 0; z-index: 25; }
.plus__item { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: var(--r); font-size: 16px; color: var(--ink); }
.plus__item:active, .plus__item.is-on { background: var(--bg-2); }
.plus__item :deep(.ico) { color: var(--muted); }
.plus__check { margin-left: auto; color: var(--blue) !important; }
</style>
