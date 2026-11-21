<script setup lang="ts">
import UiSpinner from './UiSpinner.vue'
import { useBusy } from '../useBusy'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import UiEmpty from './UiEmpty.vue'
import UiSearch from './UiSearch.vue'
import UiSelect from './UiSelect.vue'
import { NODATA_TEXT, RAG_COLUMNS, isRejected, labelOfField, metricLabel, paperPath, publication, resetReview, resultsOf, reviewMark, reviewOf, ruValue, setReview, type RagTableName, type Review } from '../case'
import { ragIsRejected, ragPublication, ragResultsOf } from '../case/rag'
import { GOLD_COLUMNS } from '../case/goldTables'
import { buildRagSubmission, buildSubmission, ragTableCsv, tableCsv, type Row, type TableName } from '../case/export'
import { KEY_COL, LINKS, TABS, TAB_RU, submissionFocus } from '../case/submissionFocus'
import { download } from '../exporters'
import { downloadRunPassport } from '../case/runSet'
import { fmtInt } from '../fmt'
import { toast } from '../store'
import { plural } from '../search'

const props = defineProps<{
  runId: string; domain: 'solar' | 'rag'; pids: string[]; setBusy?: boolean
  bulk?: boolean
}>()
const emit = defineEmits<{ 'download-set': [] }>()
const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)

const tabs = computed(() => TABS[props.domain])
const cols = (t: string): string[] => (props.domain === 'rag' ? RAG_COLUMNS[t] : GOLD_COLUMNS[t as TableName]) ?? []
const tab = ref('results')
const pidSel = ref('')
const q = ref('')
const qd = ref('')
let qt = 0
watch(q, (v) => { window.clearTimeout(qt); qt = window.setTimeout(() => (qd.value = v), v ? 150 : 0) })
onBeforeUnmount(() => window.clearTimeout(qt))

const tables = computed<Record<string, Row[]>>(() =>
  (props.domain === 'rag' ? buildRagSubmission(props.pids, { scope: props.runId }) : buildSubmission(props.pids, { scope: props.runId })) as unknown as Record<string, Row[]>)
const pubIds = computed(() => (tables.value.publications ?? []).map((r) => r.publication_id!))
const titleOf = (pid: string) => (props.domain === 'rag' ? ragPublication(pid) : publication(pid))?.title ?? pid
const rowKey = (t: string, r: Row) => r.publication_id + ':' + r[KEY_COL[t]!]
const byKey = computed(() => {
  const o: Record<string, Map<string, number>> = {}
  for (const t of tabs.value) o[t] = new Map((tables.value[t] ?? []).map((r, i) => [rowKey(t, r), i]))
  return o
})
const forPid = computed<Record<string, Row[]>>(() =>
  Object.fromEntries(tabs.value.map((t) => [t, pidSel.value ? (tables.value[t] ?? []).filter((r) => r.publication_id === pidSel.value) : (tables.value[t] ?? [])])))
const total = computed(() => tabs.value.reduce((a, t) => a + (tables.value[t]?.length ?? 0), 0))
const rejected = computed(() => props.pids.reduce((n, p) => n + (props.domain === 'rag' ? ragResultsOf(p).filter(ragIsRejected).length : resultsOf(p).filter(isRejected).length), 0))

const hay = new WeakMap<Row, string>()
const hayOf = (r: Row) => {
  let s = hay.get(r)
  if (s == null) { s = Object.values(r).join('\u0001').toLowerCase().replace(/ё/g, 'е'); hay.set(r, s) }
  return s
}
const metric = ref('')
const metricOpts = computed(() => {
  const n = new Map<string, number>()
  for (const r of forPid.value.results ?? []) n.set(r.metric_name!, (n.get(r.metric_name!) ?? 0) + 1)
  const name = (m: string) => (props.domain === 'rag' ? m : metricLabel(m))
  return [{ value: '', label: 'Все показатели' }, ...[...n].sort((a, b) => b[1] - a[1]).map(([m, c]) => ({ value: m, label: `${name(m)} · ${fmtInt(c)}` }))]
})
const metricOn = computed(() => (props.bulk && tab.value === 'results' && metricOpts.value.some((o) => o.value === metric.value) ? metric.value : ''))
const view = computed(() => {
  let rows = forPid.value[tab.value] ?? []
  if (metricOn.value) rows = rows.filter((r) => r.metric_name === metricOn.value)
  const s = qd.value.trim().toLowerCase().replace(/ё/g, 'е')
  return s ? rows.filter((r) => hayOf(r).includes(s)) : rows
})

const bulkOn = computed(() => !!props.bulk && tab.value === 'results')
const sel = ref<Set<string>>(new Set())
const allOn = computed(() => view.value.length > 0 && view.value.every((r) => sel.value.has(rowKey('results', r))))
const someOn = computed(() => !allOn.value && view.value.some((r) => sel.value.has(rowKey('results', r))))
function toggle(r: Row) {
  const s = new Set(sel.value)
  const k = rowKey('results', r)
  if (s.has(k)) s.delete(k)
  else s.add(k)
  sel.value = s
}
const toggleAll = () => (sel.value = allOn.value ? new Set() : new Set(view.value.map((r) => rowKey('results', r))))
const clearSel = () => (sel.value = new Set())
watch([() => props.runId, () => props.pids.join(',')], clearSel)
const selRows = computed(() => (tables.value.results ?? []).filter((r) => sel.value.has(rowKey('results', r))))
function review(status: 'accepted' | 'rejected') {
  const d = props.domain
  const list = selRows.value.filter((r) => reviewOf(r.publication_id!, r.result_id!, d).status !== status)
  if (!list.length) return clearSel()
  const prev: [Row, Review][] = list.map((r) => [r, { ...reviewOf(r.publication_id!, r.result_id!, d) }])
  for (const r of list) setReview(r.publication_id!, r.result_id!, { status }, d)
  clearSel()
  toast(`${status === 'accepted' ? 'Принято' : 'Отклонено'}: ${list.length}${status === 'rejected' ? ' · строки не попадут в results.csv' : ''}`, {
    label: 'Вернуть',
    run: () => {
      for (const [r, p] of prev) {
        if (p.status === 'new' && p.corrected == null) resetReview(r.publication_id!, r.result_id!, d)
        else setReview(r.publication_id!, r.result_id!, { status: p.status, corrected: p.corrected, digits: p.digits }, d)
      }
    },
  })
}
const markOf = (r: Row) => (tab.value === 'results' ? reviewMark(r.publication_id!, r.result_id!, props.domain) : null)

const ROW = 40
const sc = ref<HTMLElement | null>(null)
const top = ref(0)
const vh = ref(520)
const more = ref(false)
function onScroll() {
  const el = sc.value
  if (!el) return
  top.value = el.scrollTop
  vh.value = el.clientHeight || 520
  more.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
const win = computed(() => {
  const n = view.value.length
  const a = Math.max(0, Math.floor(top.value / ROW) - 6)
  const b = Math.min(n, Math.ceil((top.value + vh.value) / ROW) + 6)
  return { a, b, rows: view.value.slice(a, b) }
})
let ro: ResizeObserver | undefined
watch(sc, (el) => { ro?.disconnect(); if (el && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onScroll); ro.observe(el); onScroll() } })
onBeforeUnmount(() => ro?.disconnect())
watch([tab, pidSel, qd, metricOn], async () => { await nextTick(); if (sc.value) sc.value.scrollTop = 0; onScroll() })

const WIDE: Record<string, number> = {
  title: 320, source_fragment: 320, description: 360, note: 240, authors: 240, evaluation_protocol: 300, stress_conditions: 220, hardware: 200, DOI: 200,
  record_ids: 170, exclusion_reason: 240, retriever_model: 180, embedding_model: 180, generator_model: 180, reranker_model: 180, dataset_name: 200,
  material_name_raw: 200, device_label: 220, check_name: 160, task_type: 200, chunking_method: 180, prompt_strategy: 180, context_strategy: 180, metric_name: 160,
}
const SHORT = new Set(['year', 'source_page', 'layer_order', 'n_devices', 'in_scope', 'mask_used', 'certified', 'metric_k', 'top_k', 'sample_size', 'aggregation'])
const wOf = (c: string) => WIDE[c] ?? (SHORT.has(c) ? 100 : /_id$/.test(c) ? 120 : /_unit$/.test(c) ? 100 : 150)
const cur = computed(() => cols(tab.value))
const CK = 44
const tableW = computed(() => cur.value.reduce((s, c) => s + wOf(c), 0) + (bulkOn.value ? CK : 0))
const links = computed(() => LINKS[props.domain][tab.value] ?? {})
const rowOpens = computed(() => ['results', 'issues', 'publications'].includes(tab.value))

const parts = (v: string) => v.split(';').map((s) => s.trim()).filter(Boolean)
const targetOk = (c: string, r: Row, id: string) => byKey.value[links.value[c]!]?.has(r.publication_id + ':' + id) ?? false
const isFixed = (r: Row) => tab.value === 'results' && reviewMark(r.publication_id!, r.result_id!, props.domain)?.kind === 'fixed'
const tipOf = (c: string, v: string) => {
  if (!v) return undefined
  const ru = ruValue(c, v)
  return v.length > 24 ? v : ru !== v && ru !== '—' ? ru : undefined
}

const hl = ref('')
async function goTo(t: string, key: string) {
  tab.value = t
  q.value = ''; qd.value = ''
  const pid = key.split(':')[0]!
  if (pidSel.value && pidSel.value !== pid) pidSel.value = ''
  hl.value = t + '|' + key
  await nextTick()
  const i = view.value.findIndex((r) => rowKey(t, r) === key)
  if (i >= 0 && sc.value) {
    sc.value.scrollTop = Math.max(0, i * ROW - sc.value.clientHeight / 2 + ROW * 2)
    onScroll()
  }
}
function follow(c: string, r: Row, id: string) { void goTo(links.value[c]!, r.publication_id + ':' + id) }
function openRow(r: Row) {
  const query: Record<string, string> = { run: props.runId }
  if (tab.value === 'results') query.r = r.result_id!
  else if (tab.value === 'issues') query.i = r.issue_id!
  void router.push({ path: paperPath(r.publication_id!, props.domain), query })
}
const isHl = (r: Row) => hl.value === tab.value + '|' + rowKey(tab.value, r)

function apply(t: string, row: string, pid: string) {
  if (!tabs.value.includes(t)) return
  let key = pid && row ? pid + ':' + row : ''
  if (!key || !byKey.value[t]?.has(key)) {
    const r = row ? (tables.value[t] ?? []).find((x) => x[KEY_COL[t]!] === row) : undefined
    key = r ? rowKey(t, r) : ''
  }
  if (!key) { tab.value = t; return }
  void goTo(t, key).then(() => root.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
}
watch(() => submissionFocus.value?.n, () => { const f = submissionFocus.value; if (f) apply(f.tab, f.row, f.pid) })
onMounted(() => {
  const { tab: t, row, pid, paper } = route.query
  if (typeof paper === 'string' && paper) pidSel.value = paper
  if (typeof t !== 'string') return
  if (typeof paper === 'string' && paper && typeof row !== 'string') { tab.value = t; return }
  const go = () => apply(t, typeof row === 'string' ? row : '', typeof pid === 'string' ? pid : '')
  void nextTick(go)
})

const { busy: tblBusy, run: runTable0 } = useBusy()
const runTable = (e: Event) => runTable0(downloadTable, e)
function downloadTable() {
  const rows = forPid.value[tab.value] ?? []
  const csv = props.domain === 'rag' ? ragTableCsv(tab.value as RagTableName, rows) : tableCsv(tab.value as TableName, rows)
  download(`${tab.value}${pidSel.value ? '_' + pidSel.value : ''}.csv`, csv, 'text/csv')
}
const noData = computed(() => total.value === 0)
const countOf = (t: string) => forPid.value[t]?.length ?? 0
const emptyTitle = computed(() => (noData.value ? 'Таблицы пока пусты' : 'Нет строк'))
const emptyText = computed(() => {
  if (noData.value) return NODATA_TEXT
  if (qd.value) return 'Ничего не найдено. Измените запрос.'
  if (tab.value === 'issues') return pidSel.value ? 'У этой статьи замечаний нет.' : 'Замечаний нет.'
  return pidSel.value ? 'У этой статьи в этой таблице строк нет.' : 'В этой таблице строк нет.'
})
function onTabKey(e: KeyboardEvent) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
  const i = tabs.value.indexOf(tab.value) + (e.key === 'ArrowRight' ? 1 : -1)
  tab.value = tabs.value[(i + tabs.value.length) % tabs.value.length]!
  const el = e.currentTarget as HTMLElement
  void nextTick(() => el.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
}
</script>

<template>
  <div ref="root" class="sv">
    <div class="sv__bar">
      <button type="button" class="btn btn--soft btn--sm" :disabled="noData || setBusy" @click="emit('download-set')">
        <UiSpinner v-if="setBusy" :size="14" tone="current" /><Icon v-else name="export" :size="16" />{{ setBusy ? 'Готовим архив…' : 'Скачать набор' }}<span v-if="!setBusy" class="sv__long"> (ZIP: 7 таблиц и паспорт)</span>
      </button>
      <button type="button" class="btn btn--ghost btn--sm" :disabled="!countOf(tab) || tblBusy" :data-tip="pidSel ? 'Только строки выбранной статьи' : undefined" @click="runTable($event)">
        <UiSpinner v-if="tblBusy" :size="14" tone="current" /><Icon v-else name="table" :size="16" />{{ tblBusy ? 'Готовим таблицу…' : 'Скачать эту таблицу (CSV)' }}
      </button>
      <button type="button" class="btn btn--ghost btn--sm" data-tip="Поля, правила и критерии набора — тот же PASSPORT.md, что лежит в ZIP" @click="downloadRunPassport(runId, 'md')">
        <Icon name="book" :size="16" />Паспорт (Markdown)
      </button>
      <span v-if="rejected" class="sv__rej">В набор не вошли отклонённые вами значения: {{ fmtInt(rejected) }}</span>
    </div>

    <div v-if="bulkOn && sel.size" class="sv__sel" role="group" aria-label="Выбранные значения">
      <span class="sv__seln num">Выбрано: {{ fmtInt(sel.size) }}</span>
      <button type="button" class="btn btn--soft btn--sm" @click="review('accepted')"><Icon name="check" :size="16" />Принять</button>
      <button type="button" class="btn btn--ghost btn--sm" data-tip="Строки не попадут в results.csv" @click="review('rejected')"><Icon name="x" :size="16" />Отклонить</button>
      <button type="button" class="btn btn--ghost btn--sm" @click="clearSel">Снять выбор</button>
    </div>

    <ul v-if="pubIds.length > 1" class="sv__papers" role="list" aria-label="Статья">
      <li><button type="button" class="chip" :aria-pressed="!pidSel" @click="pidSel = ''">Все статьи</button></li>
      <li v-for="p in pubIds" :key="p">
        <button type="button" class="chip" :aria-pressed="pidSel === p" :data-tip="titleOf(p)" @click="pidSel = pidSel === p ? '' : p">{{ p }}</button>
      </li>
    </ul>

    <div class="sv__tabs" role="tablist" aria-label="Таблицы набора" @keydown="onTabKey">
      <div class="seg">
        <button v-for="t in tabs" :key="t" type="button" role="tab" :aria-selected="tab === t" :tabindex="tab === t ? 0 : -1" @click="tab = t">
          {{ TAB_RU[t] }}<span class="seg__n num">{{ fmtInt(countOf(t)) }}</span>
        </button>
      </div>
    </div>

    <div class="sv__tools">
      <UiSelect
        v-if="bulkOn && metricOpts.length > 2" :model-value="metricOn" :options="metricOpts" label="Показатель" variant="chip" size="sm" :min-width="260"
        :class="{ 'filter-on': !!metricOn }" @update:model-value="(v) => (metric = v as string)"
      />
      <UiSearch v-model="q" class="sv__srch" placeholder="Поиск по таблице" label="Поиск по таблице набора">
        <template v-if="qd" #end>{{ fmtInt(view.length) }} из {{ fmtInt(countOf(tab)) }}</template>
      </UiSearch>
      <p class="sv__hint"><template v-if="rowOpens">Нажмите на строку — откроется место в статье. </template>Подчёркнутые значения ведут к связанной строке.</p>
    </div>

    <UiEmpty v-if="!view.length" :icon="noData ? 'info' : 'table'" :title="emptyTitle" :text="emptyText" compact />
    <div v-else class="sv__wrap" :class="{ 'is-more': more }">
      <div ref="sc" class="sv__sc" tabindex="0" role="region" :aria-label="'Таблица ' + TAB_RU[tab]" @scroll.passive="onScroll">
        <table class="tbl tbl--sm sv__t" :style="{ width: tableW + 'px' }">
          <colgroup><col v-if="bulkOn" :style="{ width: CK + 'px' }" /><col v-for="c in cur" :key="c" :style="{ width: wOf(c) + 'px' }" /></colgroup>
          <thead>
            <tr>
              <th v-if="bulkOn" scope="col" class="sv__ck"><label class="ck"><input type="checkbox" :checked="allOn" :indeterminate="someOn" aria-label="Выбрать все строки" @change="toggleAll"></label></th>
              <th v-for="c in cur" :key="c" scope="col"><span class="sv__h">{{ labelOfField(c) }}</span><code class="sv__m">{{ c }}</code></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="win.a" class="sv__sp" aria-hidden="true"><td :colspan="cur.length + (bulkOn ? 1 : 0)" :style="{ height: win.a * ROW + 'px' }" /></tr>
            <tr
              v-for="r in win.rows" :key="rowKey(tab, r)" class="sv__r" :class="{ 'is-sel': isHl(r), 'is-link': rowOpens }" :style="{ height: ROW + 'px' }"
              :tabindex="rowOpens ? 0 : undefined" @click="rowOpens && openRow(r)" @keydown.enter.self="rowOpens && openRow(r)"
            >
              <td v-if="bulkOn" class="sv__ck" @click.stop><label class="ck"><input type="checkbox" :checked="sel.has(rowKey('results', r))" :aria-label="'Выбрать ' + r.result_id" @change="toggle(r)"></label></td>
              <td v-for="c in cur" :key="c" :class="{ sv__fx: isFixed(r) && (c === 'normalized_value' || c === 'metric_value') }">
                <span v-if="!r[c]" class="sv__none">—</span>
                <span v-else-if="links[c]" class="sv__lk">
                  <template v-for="(id, k) in parts(r[c]!)" :key="k">
                    <button v-if="targetOk(c, r, id)" type="button" class="link sv__a" :data-tip="'Открыть строку в «' + TAB_RU[links[c]!] + '»'" @click.stop="follow(c, r, id)">{{ id }}</button>
                    <span v-else class="sv__plain" data-tip="Этой строки нет в наборе">{{ id }}</span>
                  </template>
                </span>
                <template v-else>
                  <span class="sv__v" :data-tip="tipOf(c, r[c]!)">{{ r[c] }}</span>
                  <span v-if="c === KEY_COL[tab] && isFixed(r)" class="mark mark--fixed sv__mk">исправлено</span>
                  <span v-else-if="bulk && c === KEY_COL[tab] && markOf(r)?.kind === 'accepted'" class="mark mark--ok sv__mk">принято</span>
                </template>
              </td>
            </tr>
            <tr v-if="win.b < view.length" class="sv__sp" aria-hidden="true"><td :colspan="cur.length + (bulkOn ? 1 : 0)" :style="{ height: (view.length - win.b) * ROW + 'px' }" /></tr>
          </tbody>
        </table>
      </div>
    </div>
    <p class="sv__cnt num">{{ fmtInt(view.length) }} {{ plural(view.length, ['строка', 'строки', 'строк']) }}<template v-if="pidSel"> · {{ pidSel }}</template></p>
  </div>
</template>

<style scoped>
.sv { display: grid; gap: var(--s3); min-width: 0; scroll-margin-top: var(--s4); }
.sv__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }

.sv__sel { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); padding: var(--s2) var(--s3); border-radius: var(--r); background: var(--blue-wash); }
.sv__seln { font-size: var(--fs-sm); font-weight: 500; margin-right: var(--s2); }
.sv__ck { padding-inline: 0 !important; }
.ck { display: grid; place-items: center; width: 44px; height: 100%; min-height: 32px; cursor: pointer; }
.ck input { appearance: none; -webkit-appearance: none; position: relative; display: grid; place-items: center; width: 18px; height: 18px; margin: 0; border-radius: var(--r-xs); background: none; box-shadow: inset 0 0 0 1.5px var(--muted); cursor: pointer; transition: background-color var(--t-fast) ease, box-shadow var(--t-fast) ease; }
.ck input:hover { box-shadow: inset 0 0 0 1.5px var(--ink); }
.ck input:checked, .ck input:indeterminate { background: var(--ink); box-shadow: none; }
.ck input:checked::before { content: ''; width: 5px; height: 9px; margin-top: -1px; border: solid var(--bg); border-width: 0 2px 2px 0; rotate: 45deg; }
.ck input:indeterminate::before { content: ''; width: 9px; height: 2px; background: var(--bg); }
.ck input:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.sv__rej { font-size: var(--fs-xs); color: var(--muted); }
.sv__papers { display: flex; flex-wrap: wrap; gap: var(--s2); list-style: none; margin: 0; padding: 0; }
.sv__tabs { min-width: 0; overflow-x: auto; scrollbar-width: none; }
.sv__tabs::-webkit-scrollbar { display: none; }
.sv__tabs .seg { width: max-content; }
.sv__tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); }
.sv__srch { flex: 1 1 280px; max-width: 420px; }
.sv__hint { margin: 0; font-size: var(--fs-xs); color: var(--muted); }
.sv__wrap { position: relative; border-radius: var(--r-lg); background: var(--card); box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; min-width: 0; }
.sv__wrap::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 32px; pointer-events: none; opacity: 0; transition: opacity var(--t); background: linear-gradient(to right, transparent, var(--card)); }
.sv__wrap.is-more::after { opacity: 1; }
.sv__sc { overflow: auto; max-height: min(560px, 70vh); overscroll-behavior: contain; }
.sv__t { table-layout: fixed; }
.sv__t th { position: sticky; top: 0; z-index: var(--z-sticky); background: var(--card); height: 52px; padding-block: 6px; vertical-align: top; box-shadow: inset 0 -1px 0 var(--line); }
.sv__h { display: block; font-size: var(--fs-xs); color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.sv__m { display: block; font-family: var(--mono); font-size: var(--fs-xs); font-weight: 400; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.sv__t td { padding-block: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-sm); }
.sv__sp td { padding: 0; border: 0; }
.sv__r.is-link { cursor: pointer; }
.sv__none { color: var(--muted); opacity: .7; }
.sv__a { text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); text-underline-offset: 3px; }
.sv__lk { display: inline-flex; gap: var(--s2); }
.sv__plain { color: var(--muted); }
.sv__fx { color: var(--lk); font-weight: 600; }
.sv__mk { margin-left: var(--s2); }
.sv__cnt { margin: 0; font-size: var(--fs-xs); color: var(--muted); display: flex; align-items: center; gap: var(--s2); }
@media (max-width: 768px) {
  .sv__long { display: none; }
  .sv__papers { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .sv__papers li { flex: none; }
  .sv__sc { max-height: 65vh; }
}
</style>
