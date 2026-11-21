<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import UiSelect from './UiSelect.vue'
import { COLLECTIONS, type CollectionId } from '../data'
import {
  addEntrySynonym, addParamSynonym, dictionary, entryPapers, paramUsage, removeEntrySynonym, removeParamSynonym, unitRows,
  type ConditionEntry, type MaterialEntry,
} from '../dictionary'
import { plural } from '../search'
import { state, toast } from '../store'
import { openDeep, useViewState } from '../viewState'

type Tab = 'params' | 'units' | 'materials' | 'conditions'
const TABS: { id: Tab; label: string }[] = [
  { id: 'params', label: 'Параметры' },
  { id: 'units', label: 'Единицы' },
  { id: 'materials', label: 'Материалы' },
  { id: 'conditions', label: 'Условия' },
]

const router = useRouter()
const COLL_OPTIONS = Object.values(COLLECTIONS).map((c) => ({ value: c.id, label: c.name, icon: c.icon, hint: c.hint }))
const setCollection = (v: CollectionId | CollectionId[]) => (state.collection = v as CollectionId)
const ui = useViewState('dictionary', () => ({ tab: 'params' as Tab, q: '', drafts: {} as Record<string, string> }))
const tab = toRef(ui, 'tab')
const q = toRef(ui, 'q')
const cid = computed<CollectionId>(() => state.collection)
const col = computed(() => COLLECTIONS[cid.value])
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const hit = (...parts: string[]) => !q.value.trim() || parts.some((p) => norm(p).includes(norm(q.value.trim())))

const params = computed(() =>
  col.value.params
    .map((p) => {
      const syn = dictionary.params[cid.value][p.key] ?? []
      return { p, syn, use: paramUsage(cid.value, p.key) }
    })
    .filter((r) => hit(r.p.label, r.p.unit, r.p.key, ...r.syn.map((s) => s.text))),
)
const toExplore = (label: string) => void openDeep(router, { path: '/explore', query: { q: label } })

const drafts = ui.drafts
function addParam(key: string) {
  const text = (drafts[key] ?? '').trim()
  if (!text) return
  const n = addParamSynonym(cid.value, key, text)
  if (n == null) return toast(`«${text}» уже есть в словаре`)
  drafts[key] = ''
  toast(`Синоним «${text}» добавлен — пересчитано ${n} ${plural(n, ['статья', 'статьи', 'статей'])}`)
}
function addEntry(entry: MaterialEntry | ConditionEntry) {
  const text = (drafts[entry.id] ?? '').trim()
  if (!text) return
  if (!addEntrySynonym(entry, text)) return toast(`«${text}» уже есть в словаре`)
  drafts[entry.id] = ''
  toast(`Синоним «${text}» добавлен`)
}

function delParam(key: string, text: string) {
  const c = cid.value
  removeParamSynonym(c, key, text)
  toast(`Синоним «${text}» удалён`, { label: 'Вернуть', run: () => void addParamSynonym(c, key, text) })
}
function delEntry(entry: MaterialEntry | ConditionEntry, text: string) {
  removeEntrySynonym(entry, text)
  toast(`Синоним «${text}» удалён`, { label: 'Вернуть', run: () => void addEntrySynonym(entry, text) })
}

const units = computed(() => unitRows(cid.value).filter((r) => hit(r.label, r.unit, r.canon)))
const unitGroups = computed(() => {
  const g: { label: string; canon: string; rows: typeof units.value }[] = []
  for (const r of units.value) {
    let x = g.find((i) => i.label === r.label)
    if (!x) g.push((x = { label: r.label, canon: r.canon, rows: [] }))
    x.rows.push(r)
  }
  return g
})
const unitName = (u: string) => (u === '' ? 'без единицы' : u)

const materials = computed(() =>
  dictionary.materials
    .filter((m) => m.collection === cid.value && hit(m.canon, m.name, ...m.synonyms.map((s) => s.text)))
    .map((m) => ({ m, n: entryPapers(m, cid.value) })),
)
const conditions = computed(() =>
  dictionary.conditions
    .filter((c) => hit(c.canon, c.name, ...c.synonyms.map((s) => s.text)))
    .map((c) => ({ c, n: entryPapers(c) })),
)

const total = computed(() => {
  if (tab.value === 'params') return params.value.length
  if (tab.value === 'units') return units.value.length
  if (tab.value === 'materials') return materials.value.length
  return conditions.value.length
})
const customCount = computed(
  () =>
    Object.values(dictionary.params).reduce((n, c) => n + Object.values(c).reduce((m, l) => m + l.filter((s) => s.custom).length, 0), 0) +
    [...dictionary.materials, ...dictionary.conditions].reduce((n, e) => n + e.synonyms.filter((s) => s.custom).length, 0),
)
</script>

<template>
  <div class="dict">
    <p class="note">Все написания сводятся к одному виду — поэтому поиск и сравнение работают.</p>
    <div class="tools">
      <div class="seg" role="tablist" aria-label="Раздел словаря">
        <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
      </div>
      <UiSelect :model-value="cid" :options="COLL_OPTIONS" label="Коллекция" variant="soft" size="sm" :min-width="240" @update:model-value="setCollection" />
    </div>

    <div class="find">
      <label class="search">
        <Icon name="search" :size="18" />
        <input v-model="q" type="text" placeholder="Найти по названию, синониму или единице" aria-label="Поиск по словарю" spellcheck="false" autocomplete="off" />
        <button v-if="q" class="clear" aria-label="Очистить" @click="q = ''"><Icon name="x" :size="14" /></button>
      </label>
      <p class="meta num">
        {{ total }} {{ plural(total, ['запись', 'записи', 'записей']) }}<template v-if="customCount"> · ваших синонимов: {{ customCount }}</template>
      </p>
    </div>

    <ul v-if="tab === 'params'" class="list">
      <li v-for="r in params" :key="r.p.key" class="card">
        <div class="head">
          <h3>{{ r.p.label }}</h3>
          <span v-if="r.p.unit" class="unit">{{ r.p.unit }}</span>
          <span v-else-if="r.p.text" class="unit">текст</span>
        </div>
        <p class="use num">
          <button v-if="r.use.facts" class="link" :aria-label="`Показать ${r.use.facts} фактов в обзоре`" @click="toExplore(r.p.label)">
            Встречается в {{ r.use.facts }} {{ plural(r.use.facts, ['факте', 'фактах', 'фактах']) }} из {{ r.use.papers }} {{ plural(r.use.papers, ['статьи', 'статей', 'статей']) }}<Icon name="arrow-right" :size="15" />
          </button>
          <template v-else>Пока не встречается в фактах</template>
        </p>
        <div class="chips">
          <span v-for="s in r.syn" :key="s.text" class="chip" :class="{ custom: s.custom }">
            {{ s.text }}
            <button v-if="s.custom" class="x" :aria-label="'Удалить синоним ' + s.text" @click="delParam(r.p.key, s.text)"><Icon name="x" :size="12" /></button>
          </span>
          <form class="add" @submit.prevent="addParam(r.p.key)">
            <input v-model="drafts[r.p.key]" type="text" placeholder="Добавить синоним" aria-label="Новый синоним" autocomplete="off" spellcheck="false" />
            <button type="submit" class="plus" aria-label="Добавить" :disabled="!(drafts[r.p.key] ?? '').trim()"><Icon name="plus" :size="14" /></button>
          </form>
        </div>
      </li>
    </ul>

    <template v-else-if="tab === 'units'">
      <p class="note">Число из статьи умножается на множитель и получает каноническую единицу — так значения можно сравнивать.</p>
      <section v-for="g in unitGroups" :key="g.label" class="card">
        <div class="head">
          <h3>{{ g.label }}</h3>
          <span class="unit">{{ g.canon || 'без единицы' }}</span>
        </div>
        <div class="tw">
          <table class="tb">
            <thead><tr><th>Как в статье</th><th>Каноническая</th><th class="r">Множитель</th><th>Пример</th><th class="r">В фактах</th></tr></thead>
            <tbody>
              <tr v-for="r in g.rows" :key="r.key">
                <td>{{ unitName(r.unit) }}</td>
                <td>{{ r.canon || '—' }}</td>
                <td class="r num">{{ r.k === 1 ? '× 1' : '× ' + String(r.k).replace('.', ',') }}</td>
                <td class="num ex">{{ r.example }}</td>
                <td class="r num">{{ r.count }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <ul v-else-if="tab === 'materials'" class="list">
      <li v-for="{ m, n } in materials" :key="m.id" class="card">
        <div class="head">
          <h3>{{ m.canon }}</h3>
          <span v-if="n" class="unit num">{{ n }} {{ plural(n, ['статья', 'статьи', 'статей']) }}</span>
        </div>
        <p class="use">{{ m.name }}</p>
        <div class="chips">
          <span v-for="s in m.synonyms" :key="s.text" class="chip" :class="{ custom: s.custom }">
            {{ s.text }}
            <button v-if="s.custom" class="x" :aria-label="'Удалить синоним ' + s.text" @click="delEntry(m, s.text)"><Icon name="x" :size="12" /></button>
          </span>
          <form class="add" @submit.prevent="addEntry(m)">
            <input v-model="drafts[m.id]" type="text" placeholder="Добавить синоним" aria-label="Новый синоним" autocomplete="off" spellcheck="false" />
            <button type="submit" class="plus" aria-label="Добавить" :disabled="!(drafts[m.id] ?? '').trim()"><Icon name="plus" :size="14" /></button>
          </form>
        </div>
      </li>
    </ul>

    <ul v-else class="list">
      <li v-for="{ c, n } in conditions" :key="c.id" class="card">
        <div class="head">
          <h3>{{ c.canon }}</h3>
          <span v-if="n" class="unit num">{{ n }} {{ plural(n, ['статья', 'статьи', 'статей']) }}</span>
        </div>
        <p class="use">{{ c.name }}</p>
        <div class="chips">
          <span v-for="s in c.synonyms" :key="s.text" class="chip" :class="{ custom: s.custom }">
            {{ s.text }}
            <button v-if="s.custom" class="x" :aria-label="'Удалить синоним ' + s.text" @click="delEntry(c, s.text)"><Icon name="x" :size="12" /></button>
          </span>
          <form class="add" @submit.prevent="addEntry(c)">
            <input v-model="drafts[c.id]" type="text" placeholder="Добавить синоним" aria-label="Новый синоним" autocomplete="off" spellcheck="false" />
            <button type="submit" class="plus" aria-label="Добавить" :disabled="!(drafts[c.id] ?? '').trim()"><Icon name="plus" :size="14" /></button>
          </form>
        </div>
      </li>
    </ul>

    <div v-if="!total" class="empty">
      <Icon name="search" :size="28" />
      <b>Ничего не нашлось</b>
      <p>Попробуйте другое слово или сбросьте поиск.</p>
      <button v-if="q" class="btn btn--soft btn--sm" @click="q = ''">Сбросить поиск</button>
    </div>
  </div>
</template>

<style scoped>
.dict { display: flex; flex-direction: column; gap: var(--s4); min-width: 0; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s3); }
.seg { display: inline-flex; padding: 3px; border-radius: var(--r); background: var(--bg-2); max-width: 100%; }
.seg button { height: 32px; padding: 0 var(--s4); border-radius: var(--r-sm); font-size: var(--fs-body); color: var(--muted); white-space: nowrap; transition: background-color var(--t), color var(--t); }
.seg button:hover { color: var(--ink); }
.seg button.on { background: var(--card); color: var(--ink); font-weight: 500; box-shadow: 0 0 0 1px var(--line), 0 1px 2px rgb(0 0 0 / 0.06); }

.find { display: grid; gap: var(--s3); }
.search { display: flex; align-items: center; gap: var(--s3); height: 44px; padding: 0 var(--s4); border-radius: var(--r); background: var(--card); box-shadow: 0 0 0 1px var(--line-2); color: var(--muted); }
.search:focus-within { box-shadow: 0 0 0 1.5px var(--blue); color: var(--ink); }
.search input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; color: var(--ink); font-size: var(--fs-body); }
.clear { width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--r-sm); color: var(--muted); }
.clear:hover { background: var(--bg-2); color: var(--ink); }
.meta { padding: 0 var(--s1); font-size: var(--fs-sm); color: var(--muted); }

.list { list-style: none; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s3); }
.card { min-width: 0; padding: var(--s5); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.head { display: flex; align-items: center; gap: var(--s3); min-width: 0; }
.head h3 { font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; min-width: 0; overflow-wrap: anywhere; }
.unit { flex: none; padding: 2px var(--s2); border-radius: var(--r-pill); background: var(--bg-2); color: var(--muted); font-size: var(--fs-xs); }
.use { margin-top: var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.link { display: inline-flex; align-items: center; gap: var(--s1); min-height: 32px; font-size: var(--fs-sm); font-weight: 500; color: var(--blue); text-align: left; }
.link:hover { text-decoration: underline; text-underline-offset: 3px; }

.chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s3); }
.chip { display: inline-flex; align-items: center; gap: var(--s1); min-height: 30px; padding: 0 var(--s3); border-radius: var(--r-pill); background: var(--bg-2); font-size: var(--fs-sm); color: var(--ink-2); max-width: 100%; overflow-wrap: anywhere; }
.chip.custom { background: var(--blue-soft); color: var(--blue-2); padding-right: var(--s1); }
:root[data-theme='dark'] .chip.custom { color: var(--ink); }
.x { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; }
.x:hover { background: rgb(0 0 0 / 0.12); }
.add { display: inline-flex; align-items: center; gap: var(--s1); height: 30px; padding: 0 3px 0 var(--s3); border-radius: var(--r-pill); box-shadow: inset 0 0 0 1px var(--line-2); }
.add:focus-within { box-shadow: inset 0 0 0 1.5px var(--blue); }
.add input { width: 128px; min-width: 0; border: 0; outline: 0; background: none; font-size: var(--fs-sm); color: var(--ink); }
.plus { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--solid); color: var(--on-solid); }
.plus:disabled { opacity: 0.3; cursor: default; }

.note { font-size: var(--fs-sm); color: var(--muted); }
.tw { margin-top: var(--s3); overflow-x: auto; }
.tb { width: 100%; min-width: 520px; border-collapse: separate; border-spacing: 0; font-size: var(--fs-body); }
.tb th { height: 32px; padding: 0 var(--s2); text-align: left; font-size: var(--fs-xs); font-weight: 500; color: var(--muted); white-space: nowrap; border-bottom: 1px solid var(--line); }
.tb td { height: 44px; padding: 0 var(--s2); border-bottom: 1px solid var(--line); }
.tb tr:last-child td { border-bottom: 0; }
.tb th:first-child, .tb td:first-child { padding-left: 0; position: sticky; left: 0; background: var(--card); z-index: 1; }
.tb th:last-child, .tb td:last-child { padding-right: 0; }
.tb .r { text-align: right; }
.ex { color: var(--ink-2); }

.empty { display: grid; justify-items: center; gap: var(--s2); padding: var(--s8) var(--s4); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); color: var(--muted); text-align: center; }
.empty b { font-size: var(--fs-h2); font-weight: 600; color: var(--ink); }
.empty p { font-size: var(--fs-sm); margin-bottom: var(--s2); }

@media (max-width: 768px) {
  .seg { flex: none; }
  .seg button { height: 40px; padding: 0 var(--s3); }
  .search { height: 48px; }
  .search input { font-size: 16px; }
  .card { padding: var(--s4); }
  .add { flex: 1 1 200px; height: 44px; padding: 0 6px 0 var(--s4); }
  .add input { flex: 1; width: auto; }
  .add input { height: 44px; }
  .plus { width: 44px; height: 44px; }
  .chip { min-height: 44px; }
  .chip.custom { padding-right: 4px; }
  .x { width: 36px; height: 36px; }
  .link { min-height: 44px; }
}
</style>
