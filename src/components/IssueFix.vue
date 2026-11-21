<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from './Icon.vue'
import UiSpinner from './UiSpinner.vue'
import { metricLabel, refreshEdits, reviewScope, unitRu } from '../case'
import { isRemoteScope } from '../api/papers'
import { applyFix, dropFixes, fixAvailable, loadFix, undoAction, type FixInfo, type FixItem } from '../api/fixes'
import { errText } from '../api/edits'
import { toast } from '../store'

const props = defineProps<{ pid: string; iid: string; domain: 'solar' | 'rag' }>()

const run = computed(() => reviewScope.value)
const can = computed(() => isRemoteScope(run.value) && fixAvailable(run.value, props.domain, props.pid, props.iid))
const open = ref(false)
const loading = ref(false)
const busy = ref(false)
const info = ref<FixInfo | null>(null)
const pick = ref(0)

const variants = computed(() => {
  const f = info.value
  if (!f) return []
  const v: { title: string; items: FixItem[]; confidence?: string }[] = []
  if (f.suggestions.length) v.push({ title: 'Основной вариант', items: f.suggestions, confidence: f.suggestions[0]?.confidence })
  for (const a of f.alternatives) v.push(a)
  return v
})
const chosen = computed(() => variants.value[pick.value])

async function toggle() {
  open.value = !open.value
  if (!open.value || info.value) return
  loading.value = true
  try {
    info.value = await loadFix(run.value, props.domain, props.pid, props.iid)
    pick.value = 0
  } catch (e) {
    open.value = false
    toast(errText(e, 'Не удалось получить исправление'))
  } finally { loading.value = false }
}

const num = (v: number | null | undefined) => (v == null ? '—' : String(+Number(v).toPrecision(6)).replace('.', ','))
const unit = (u?: string | null) => (u ? ' ' + unitRu(u) : '')
const CONF: Record<string, string> = { high: 'высокая уверенность', medium: 'средняя уверенность', low: 'низкая уверенность' }

async function apply(items: FixItem[], state: 'fixed' | 'ok') {
  if (busy.value) return
  busy.value = true
  const r = run.value
  try {
    const res = await applyFix(r, props.domain, props.pid, props.iid, items, state)
    open.value = false
    info.value = null
    dropFixes(r, props.pid)
    refreshEdits(r, props.domain, props.pid)
    const id = res.action_id
    toast(state === 'ok' && !items.length ? 'Замечание закрыто как проверенное' : `Исправлено: ${items.length} ${items.length === 1 ? 'значение' : 'значения'}`, id ? {
      label: 'Вернуть',
      run: () => void undoAction(id).then(() => { dropFixes(r, props.pid); refreshEdits(r, props.domain, props.pid) }).catch((e) => toast(errText(e, 'Не удалось отменить'))),
    } : undefined)
  } catch (e) {
    toast(errText(e, 'Не удалось применить исправление'))
  } finally { busy.value = false }
}
</script>

<template>
  <template v-if="can">
    <button type="button" class="btn btn--soft btn--sm" :aria-expanded="open" @click.stop="toggle">
      <UiSpinner v-if="loading" :size="12" tone="current" /><Icon v-else name="edit" :size="16" />Исправить
    </button>
    <div v-if="open && info" class="fx" @click.stop>
      <template v-if="variants.length">
        <div v-if="variants.length > 1" class="fx__vars" role="radiogroup" aria-label="Вариант исправления">
          <label v-for="(v, i) in variants" :key="i" class="fx__var" :class="{ 'is-on': pick === i }">
            <input v-model="pick" type="radio" :value="i" class="visually-hidden" />
            <span class="fx__dot" aria-hidden="true" />{{ v.title }}<small v-if="v.confidence">{{ CONF[v.confidence] ?? '' }}</small>
          </label>
        </div>
        <ul v-if="chosen" class="fx__l" role="list">
          <li v-for="it in chosen.items" :key="it.rid" class="fx__r">
            <p class="fx__h"><b>{{ it.metric ? metricLabel(it.metric) : it.rid }}</b><span class="fx__rid">{{ it.rid }}</span></p>
            <p v-if="it.action === 'reject'" class="fx__v">Отклонить строку</p>
            <p v-else-if="it.action === 'note'" class="fx__v">Отметить проверенной, значение не меняется</p>
            <p v-else class="fx__v num"><s>{{ num(it.current) }}{{ unit(it.unit) }}</s><Icon name="arrow-right" :size="14" /><b>{{ num(it.suggested) }}{{ unit(it.unit) }}</b></p>
            <p v-if="it.reason" class="fx__why">{{ it.reason }}</p>
          </li>
        </ul>
        <div class="fx__acts">
          <button type="button" class="btn btn--dark btn--sm" :disabled="busy || !chosen" @click="apply(chosen!.items, 'fixed')">
            <UiSpinner v-if="busy" :size="12" tone="current" /><Icon v-else name="check" :size="16" />Применить
          </button>
          <button type="button" class="btn btn--ghost btn--sm" @click="open = false">Отмена</button>
        </div>
      </template>
      <template v-else-if="info.resolution">
        <p class="fx__why">{{ info.resolution.reason }}</p>
        <div class="fx__acts">
          <button type="button" class="btn btn--dark btn--sm" :disabled="busy" @click="apply([], 'ok')"><Icon name="check" :size="16" />Закрыть как проверенное</button>
          <button type="button" class="btn btn--ghost btn--sm" @click="open = false">Отмена</button>
        </div>
      </template>
      <p v-else class="fx__why">Автоматического исправления для этого замечания нет — проверьте значение в статье.</p>
      <p v-if="info.note" class="fx__note">{{ info.note }}</p>
    </div>
  </template>
</template>

<style scoped>
.fx { flex-basis: 100%; grid-column: 1 / -1; display: grid; gap: var(--s3); margin-top: var(--s2); padding: var(--s4); border-radius: var(--r); background: var(--bg-2); }
.fx__vars { display: flex; flex-wrap: wrap; gap: var(--s2); }
.fx__var { display: inline-flex; align-items: center; gap: var(--s2); min-height: 32px; padding: 0 var(--s3); border-radius: var(--r-pill); background: var(--card); box-shadow: 0 0 0 1px var(--line); font-size: var(--fs-sm); cursor: pointer; }
.fx__var small { color: var(--muted); font-size: var(--fs-xs); }
.fx__var.is-on { box-shadow: 0 0 0 1.5px var(--ink); }
.fx__dot { width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--muted); }
.fx__var.is-on .fx__dot { box-shadow: inset 0 0 0 3px var(--ink); }
.fx__var:has(:focus-visible) { outline: 2px solid var(--blue); outline-offset: 2px; }
.fx__l { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s3); }
.fx__r { display: grid; gap: 2px; }
.fx__h { display: flex; align-items: baseline; gap: var(--s2); }
.fx__rid { font-size: var(--fs-xs); color: var(--muted); font-family: var(--mono, monospace); }
.fx__v { display: inline-flex; align-items: center; gap: var(--s2); color: var(--muted); }
.fx__v s { text-decoration-color: var(--faint); }
.fx__v b { color: var(--ink); font-weight: 600; }
.fx__why { font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
.fx__note { font-size: var(--fs-xs); color: var(--muted); }
.fx__acts { display: flex; flex-wrap: wrap; gap: var(--s2); }
</style>
