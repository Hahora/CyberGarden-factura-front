<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import UiSelect from './UiSelect.vue'
import { COLLECTIONS, sampleWords } from '../data'
import { previewRaw, type Guess } from '../norm'
import { addFact, display, factsOf, labelOf, state, toast, undo, type Paper } from '../store'

const props = defineProps<{
  paper: Paper
  text: string
  rect: { top: number; left: number; bottom: number; right: number } | null
  guess: Guess
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'added', factId: string): void
}>()

const mobile = computed(() => state.mobile)
const row = ref(props.guess.row)
const param = ref(props.guess.param)
const raw = ref(props.guess.raw)
watch(
  () => props.guess,
  (g) => {
    row.value = g.row
    param.value = g.param
    raw.value = g.raw
  },
)

const params = computed(() => COLLECTIONS[props.paper.collection].params)
const words = computed(() => sampleWords(props.paper.collection))
const rowOpts = computed(() => [...props.paper.rows.map((r) => ({ value: r.id, label: r.label })), { value: '*', label: words.value.allCap }])
const example = computed(() => {
  const f = factsOf(props.paper.id).find((x) => x.param === param.value)
  if (f) return display(f)
  const pr = params.value.find((x) => x.key === param.value)
  return pr?.unit ? `1 ${pr.unit}` : '0,5'
})
const tried = ref(false)
watch([raw, param], () => (tried.value = false))
const paramOpts = computed(() => params.value.map((p) => ({ value: p.key, label: p.label })))
const prev = computed(() => previewRaw(props.paper, param.value, raw.value))
const quote = computed(() => props.text.replace(/\s+/g, ' ').trim().slice(0, 300))

function submit() {
  if (!prev.value.ok) {
    tried.value = true
    return
  }
  const f = addFact(props.paper.id, row.value, param.value, raw.value.trim(), { quote: quote.value })
  if (!f) return
  toast(`Добавлено: ${labelOf(f)} ${display(f)}`, { label: 'Отменить', run: undo })
  emit('added', f.id)
  emit('close')
}

const W = 340
const style = computed(() => {
  const r = props.rect
  if (mobile.value || !r) return undefined
  const left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8)
  const below = r.bottom + 10
  const top = below + 250 > window.innerHeight ? Math.max(8, r.top - 250 - 10) : below
  return { left: left + 'px', top: top + 'px', width: W + 'px' }
})

const root = ref<HTMLElement | null>(null)
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
}
const onDown = (e: Event) => {
  if (mobile.value) return
  const t = e.target as Element
  if (t.closest?.('.us__pop, .us__sheet, .us__bd')) return
  if (root.value && !root.value.contains(t)) emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  setTimeout(() => document.addEventListener('pointerdown', onDown, true))
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('pointerdown', onDown, true)
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="root"
      class="add"
      :class="{ 'add--sheet': mobile }"
      :style="style"
      role="dialog"
      aria-label="Добавить как факт"
      @keydown.stop
    >
      <header class="add__head">
        <i v-if="mobile" class="add__grip" />
        <b>Добавить как факт</b>
        <button class="icon-btn icon-btn--sm add__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" :size="16" /></button>
      </header>
      <p class="add__quote" :title="quote">«{{ quote }}»</p>

      <div class="add__grid">
        <div class="add__f">
          <span>{{ words.cap }}</span>
          <div class="add__sel"><UiSelect :model-value="row" :options="rowOpts" :label="words.cap" size="md" @update:model-value="row = $event as string" /></div>
        </div>
        <div class="add__f">
          <span>Параметр</span>
          <div class="add__sel"><UiSelect :model-value="param" :options="paramOpts" label="Параметр" size="md" @update:model-value="param = $event as string" /></div>
        </div>
      </div>
      <label class="add__val">
        <span>Значение</span>
        <input v-model="raw" class="num" :class="{ bad: !prev.ok && tried }" spellcheck="false" enterkeyhint="done" @keydown.enter.prevent="submit" />
      </label>
      <p class="add__prev num" :class="{ bad: !prev.ok && tried }" aria-live="polite">
        <template v-if="prev.ok">{{ prev.text }}</template>
        <template v-else-if="tried">Не распознано — например, {{ example }}</template>
        <template v-else>Введите число с единицей, например {{ example }}</template>
      </p>

      <div class="add__act">
        <button class="btn btn--dark btn--sm" :class="{ 'is-soft': !prev.ok }" @click="submit">Добавить</button>
        <button class="btn btn--ghost btn--sm" @click="emit('close')">Отмена <kbd>Esc</kbd></button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.add {
  position: fixed; z-index: 72; padding: var(--s3) var(--s4) var(--s4); border-radius: var(--r); background: var(--card); color: var(--ink);
  box-shadow: var(--shadow-pop), 0 0 0 1px var(--line); animation: add-in 140ms var(--ease);
}
@keyframes add-in { from { opacity: 0; translate: 0 4px; } }
.add__head { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-body); }
.add__head b { font-weight: 600; }
.add__x { margin: -4px -6px -4px 0; }
.add__quote {
  margin: var(--s1) 0 var(--s3); font-size: var(--fs-sm); color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere;
}
.add__grid { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: var(--s2); }
.add__f { min-width: 0; }
.add__sel :deep(.us) { width: 100%; height: 36px; }
label { display: block; min-width: 0; }
label > span, .add__f > span { display: block; margin-bottom: var(--s1); font-size: var(--fs-xs); color: var(--muted); }
input {
  width: 100%; height: 36px; padding: 0 var(--s3); border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--bg);
  font-size: var(--fs-body); color: var(--ink); outline: none; transition: border-color var(--t) ease, box-shadow var(--t) ease;
}
input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
input.bad { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
.add__val { margin-top: var(--s2); }
.add__prev { margin: var(--s2) 0 0; min-height: 20px; font-size: var(--fs-body); font-weight: 500; }
.btn.is-soft { opacity: 0.55; }
.add__prev.bad { font-weight: 400; color: var(--red); }
.add__act { margin-top: var(--s3); display: flex; gap: var(--s2); }
.add__act .btn { height: 36px; }
.add__act kbd { margin-left: 2px; height: 18px; min-width: 18px; font-size: var(--fs-xs); }
.btn--dark kbd { background: color-mix(in srgb, var(--on-solid) 14%, transparent); }
.add--sheet {
  left: 0; right: 0; bottom: 0; top: auto; width: auto; padding: var(--s2) var(--s4) calc(var(--s4) + var(--safe-b)); border-radius: var(--r-lg) var(--r-lg) 0 0;
  animation: add-up 240ms var(--ease);
}
@keyframes add-up { from { translate: 0 100%; } }
.add--sheet .add__head { position: relative; padding-top: var(--s3); font-size: var(--fs-h2); }
.add__grip { position: absolute; top: 0; left: 50%; width: 40px; height: 5px; margin-left: -20px; border-radius: var(--r-pill); background: var(--line-2); }
.add--sheet .add__x { width: 44px; height: 44px; margin: -8px -12px -8px 0; }
.add--sheet .add__quote { font-size: var(--fs-body); margin-bottom: var(--s3); }
.add--sheet label > span, .add--sheet .add__f > span { font-size: var(--fs-sm); margin-bottom: var(--s1); }
.add--sheet .add__sel :deep(.us) { height: 48px; font-size: 16px; border-radius: var(--r); }
.add--sheet input { height: 48px; font-size: 16px; border-radius: var(--r); }
.add--sheet .add__prev { font-size: 15px; }
.add--sheet .add__act .btn { flex: 1; height: 48px; font-size: 15px; justify-content: center; }
.add--sheet kbd { display: none; }
</style>
