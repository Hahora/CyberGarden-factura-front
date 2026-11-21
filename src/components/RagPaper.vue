<script setup lang="ts">
import { FEATURES } from '../features'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import IssuesList from './IssuesList.vue'
import UiEmpty from './UiEmpty.vue'
import UiSearch from './UiSearch.vue'
import UiSelect from './UiSelect.vue'
import UiLoad from './UiLoad.vue'
import UiSkeleton from './UiSkeleton.vue'
import { ORIGIN_RU, STATUS_RU, issueState, labelOfField, markClass, paperPath, resetReview, setReview, type Review } from '../case'
import {
  RAG_FIGURE_TEXT, RAG_TOPK_HINT, ragTidyText, ragCheckLabel, ragConfigName, ragConfigNameOf, ragConfigsOf, ragDatasetNameOf, ragDatasetsOf, ragDirection, ragDirectionText,
  ragExperimentsOf, ragFmtRaw, ragFmtValue, ragFromFigure, ragIsRejected, ragIssuesForResult, ragIssuesOf, ragLoad, ragLoadError, ragLoaded,
  ragMetricName, ragPlaceOf, ragResult, ragResultsOf, ragReviewMark, ragTaskNameOf, ragTasksOf, ragUnitRu, ragValueClass, ragValueOf,
} from '../case/rag'
import type { RagConfigRow, RagResultRow } from '../case/types'
import { toast } from '../store'
import { REJECT_CSV_NOTE, editCsvNote } from '../case/csvNote'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { ragRelated, type RagRelated } from '../case/ragLinks'

const props = defineProps<{ pid: string; mobile: boolean }>()
const emit = defineEmits<{ show: [p: { page: number | null; fragment: string; label: string | null; toPdf: boolean; kind: 'result' | 'issue'; value?: string; table?: string }] }>()
const route = useRoute()
const router = useRouter()

const pid = computed(() => props.pid)
const loaded = computed(() => ragLoaded(pid.value))
const loadErr = computed(() => ragLoadError(pid.value))
watch(pid, (p) => void ragLoad(p), { immediate: true })

const results = computed(() => ragResultsOf(pid.value))
const configs = computed(() => ragConfigsOf(pid.value))
const datasets = computed(() => ragDatasetsOf(pid.value))
const tasks = computed(() => ragTasksOf(pid.value))
const experiments = computed(() => ragExperimentsOf(pid.value))
const issues = computed(() => ragIssuesOf(pid.value))
const stOf = (iid: string) => issueState(pid.value, iid, 'rag')
const openCount = computed(() => issues.value.filter((i) => stOf(i.issue_id) === 'open').length)

type Tab = 'val' | 'cond' | 'iss' | 'links'
const tab = ref<Tab>('val')
const tabs = computed(() => [
  { id: 'val' as Tab, label: 'Значения', n: results.value.length, tip: '' },
  { id: 'cond' as Tab, label: 'Условия', n: 0, tip: 'Конфигурации, датасеты и задачи, эксперименты' },
  { id: 'iss' as Tab, label: 'Замечания', n: openCount.value, tip: openCount.value ? 'Нужно проверить' : '' },
  ...(FEATURES.graph ? [{ id: 'links' as Tab, label: 'Связи', n: 0, tip: '' }] : []),
])
const count = (n: number, f: [string, string, string]) => `${fmtInt(n)} ${plural(n, f)}`

const fMetric = ref('')
const fDataset = ref('')
const fConfig = ref('')
const fQ = ref('')
const fFigure = ref(false)
const anyFilter = computed(() => !!(fMetric.value || fDataset.value || fConfig.value || fQ.value.trim() || fFigure.value))
function resetFilters() { fMetric.value = ''; fDataset.value = ''; fConfig.value = ''; fQ.value = ''; fFigure.value = false }
watch(pid, resetFilters)

const metricOpts = computed(() => {
  const m = new Map<string, number>()
  for (const r of results.value) { const k = ragMetricName(r); m.set(k, (m.get(k) ?? 0) + 1) }
  return [{ value: '', label: 'Все метрики' }, ...[...m].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ value: v, label: v, hint: fmtInt(n) }))]
})
const datasetOpts = computed(() => [
  { value: '', label: 'Все датасеты' },
  ...datasets.value.map((d) => ({ value: d.dataset_id, label: d.dataset_name || d.dataset_id })),
])
const configLabel = computed(() => (fConfig.value ? ragConfigNameOf(pid.value, fConfig.value) : ''))
const cfgName = computed(() => new Map(configs.value.map((c) => [c.config_id, ragConfigName(c)])))

const filtered = computed(() => {
  const q = fQ.value.trim().toLowerCase()
  const dn = new Map(datasets.value.map((d) => [d.dataset_id, (d.dataset_name || d.dataset_id).toLowerCase()]))
  return results.value.filter((r) =>
    (!fMetric.value || ragMetricName(r) === fMetric.value) &&
    (!fDataset.value || r.dataset_id === fDataset.value) &&
    (!fConfig.value || r.config_id === fConfig.value) &&
    (!fFigure.value || ragFromFigure(r)) &&
    (!q || (cfgName.value.get(r.config_id) ?? '').toLowerCase().includes(q) || ragMetricName(r).toLowerCase().includes(q) || (dn.get(r.dataset_id) ?? '').includes(q)),
  )
})

type Item =
  | { t: 'exp'; key: string; title: string; sub: string; n: number }
  | { t: 'cfg'; key: string; title: string; sub: string; n: number }
  | { t: 'ds'; key: string; title: string }
  | { t: 'row'; key: string; r: RagResultRow }
const H = { exp: 40, cfg: 34, ds: 28, row: 56 } as const
const detH = ref(220)
const hOf = (it: Item | { t: 'det'; key: string }) => (it.t === 'det' ? detH.value : H[it.t])
const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
type Entry = Item | { t: 'det'; key: string; r: RagResultRow }
const base = computed<Item[]>(() => {
  const list = [...filtered.value]
  const eo = new Map(experiments.value.map((e, i) => [e.experiment_id, i]))
  list.sort((a, b) => (eo.get(a.experiment_id) ?? 999) - (eo.get(b.experiment_id) ?? 999) || a.experiment_id.localeCompare(b.experiment_id) || a.config_id.localeCompare(b.config_id, undefined, { numeric: true }) || a.dataset_id.localeCompare(b.dataset_id) || a.task_id.localeCompare(b.task_id))
  const out: Item[] = []
  const exps = new Map(experiments.value.map((e) => [e.experiment_id, e]))
  let ke = '', kc = '', kd = ''
  const cnt = (f: (r: RagResultRow) => boolean) => list.filter(f).length
  const ce = new Map<string, number>(), cc = new Map<string, number>()
  for (const r of list) { ce.set(r.experiment_id, (ce.get(r.experiment_id) ?? 0) + 1); const k = r.experiment_id + '|' + r.config_id; cc.set(k, (cc.get(k) ?? 0) + 1) }
  void cnt
  for (const r of list) {
    if (r.experiment_id !== ke) {
      ke = r.experiment_id; kc = ''; kd = ''
      const e = exps.get(ke)
      out.push({ t: 'exp', key: 'e' + ke, title: ke ? `Эксперимент ${ke}` : 'Эксперимент не указан', sub: trim(ragTidyText(e?.evaluation_protocol ?? ''), 120), n: ce.get(ke) ?? 0 })
    }
    if (r.config_id !== kc) {
      kc = r.config_id; kd = ''
      out.push({ t: 'cfg', key: 'c' + ke + kc, title: ragConfigNameOf(pid.value, kc), sub: kc, n: cc.get(ke + '|' + kc) ?? 0 })
    }
    const dk = r.dataset_id + '|' + r.task_id
    if (dk !== kd) {
      kd = dk
      out.push({ t: 'ds', key: 'd' + ke + kc + dk, title: [ragDatasetNameOf(pid.value, r.dataset_id), ragTaskNameOf(pid.value, r.task_id)].join(' · ') })
    }
    out.push({ t: 'row', key: r.result_id, r })
  }
  return out
})
const items = computed<Entry[]>(() => {
  const r = selRow.value
  if (!r) return base.value
  const i = base.value.findIndex((x) => x.t === 'row' && x.key === r.result_id)
  if (i < 0) return base.value
  const out: Entry[] = base.value.slice()
  out.splice(i + 1, 0, { t: 'det', key: 'det' + r.result_id, r })
  return out
})
const tops = computed(() => {
  const a = new Float64Array(items.value.length + 1)
  items.value.forEach((it, i) => { a[i + 1] = a[i]! + hOf(it) })
  return a
})
const totalH = computed(() => tops.value[items.value.length] ?? 0)

const vlEl = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewH = ref(480)
let ro: ResizeObserver | null = null
function onScroll() { if (vlEl.value) scrollTop.value = vlEl.value.scrollTop }
watch(vlEl, (el, old) => {
  ro?.disconnect()
  if (old) old.removeEventListener('scroll', onScroll)
  if (el) {
    el.addEventListener('scroll', onScroll, { passive: true })
    viewH.value = el.clientHeight || 480
    scrollTop.value = el.scrollTop
    ro = new ResizeObserver(() => { viewH.value = el.clientHeight || 480 })
    ro.observe(el)
  }
})
onBeforeUnmount(() => ro?.disconnect())
const OVER = 8
const range = computed(() => {
  const t = tops.value
  const n = items.value.length
  let lo = 0, hi = n
  const y0 = Math.max(0, scrollTop.value)
  while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid + 1]! <= y0) lo = mid + 1; else hi = mid }
  const from = Math.max(0, lo - OVER)
  let end = lo
  const y1 = y0 + viewH.value
  while (end < n && t[end]! < y1) end++
  return { from, to: Math.min(n, end + OVER) }
})
const visible = computed(() => items.value.slice(range.value.from, range.value.to).map((it, k) => ({ it, top: tops.value[range.value.from + k]! })))
watch(filtered, () => { if (vlEl.value) { vlEl.value.scrollTop = 0; scrollTop.value = 0 } })

let detRo: ResizeObserver | null = null
function setDetEl(el: unknown) {
  detRo?.disconnect()
  detRo = null
  if (el instanceof HTMLElement) {
    const upd = () => { const h = Math.ceil(el.offsetHeight) + 6; if (h > 6 && Math.abs(h - detH.value) > 1) detH.value = h }
    upd()
    detRo = new ResizeObserver(upd)
    detRo.observe(el)
  }
}
onBeforeUnmount(() => detRo?.disconnect())
function revealDet() {
  const el = vlEl.value
  const r = selRow.value
  if (!el || !r) return
  const i = items.value.findIndex((x) => x.t === 'det' && x.r === r)
  if (i < 0) return
  const rowTop = tops.value[i - 1]!
  const bottom = tops.value[i]! + detH.value
  if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, Math.min(rowTop - 8, bottom - el.clientHeight + 4))
  scrollTop.value = el.scrollTop
}
const editing = ref(false)
const closeSel = () => { sel.value = null; editing.value = false; setQuery({ r: undefined }) }
const sel = ref<string | null>(null)
const selRow = computed(() => (sel.value ? ragResult(pid.value, sel.value) : undefined))
const selIssue = ref<string | null>(null)
const reviewed = (r: RagResultRow) => ragReviewMark(r)
const label = (r: RagResultRow) => `${ragMetricName(r)} ${ragFmtValue(r)}`
const issuesOfRow = (r: RagResultRow) => ragIssuesForResult(pid.value, r.result_id)
const openIssuesOfRow = (r: RagResultRow) => issuesOfRow(r).filter((i) => stOf(i.issue_id) === 'open')

function setQuery(q: Record<string, string | undefined>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...q })) if (typeof v === 'string' && v) next[k] = v
  void router.replace({ query: next })
}
function scrollToRow(rid: string) {
  const el = vlEl.value
  if (!el) return
  const i = items.value.findIndex((x) => x.t === 'row' && x.key === rid)
  if (i < 0) return
  const top = tops.value[i]!
  const h = H.row
  const prev = items.value[i - 1]
  const prev2 = items.value[i - 2]
  const above = (prev && prev.t !== 'row' && prev.t !== 'det' ? hOf(prev) : 0) + (prev2 && prev2.t !== 'row' && prev2.t !== 'det' && prev && prev.t !== 'row' ? hOf(prev2) : 0)
  if (top - above < el.scrollTop) el.scrollTop = Math.max(0, top - above)
  else if (top + h > el.scrollTop + el.clientHeight) el.scrollTop = top + h - el.clientHeight + 4
  scrollTop.value = el.scrollTop
}
function pick(r: RagResultRow, o: { toPdf?: boolean; reveal?: boolean } = {}) {
  sel.value = r.result_id
  selIssue.value = null
  tab.value = 'val'
  editing.value = false
  emit('show', { page: Number(r.source_page) || null, fragment: r.source_fragment || r.source_table || r.source_figure || '', label: label(r), toPdf: o.toPdf !== false, kind: 'result', value: r.raw_value || r.normalized_value || '', table: r.source_table || '' })
  setQuery({ r: r.result_id, i: undefined, page: undefined })
  void nextTick(() => { if (o.reveal) scrollToRow(r.result_id); setTimeout(revealDet, 60) })
}
function pickIssue(i: { issue_id: string; source_page: string; source_fragment: string; check_name: string }) {
  selIssue.value = i.issue_id
  sel.value = null
  tab.value = 'iss'
  if (i.source_page || i.source_fragment) emit('show', { page: Number(i.source_page) || null, fragment: i.source_fragment, label: ragCheckLabel(i.check_name), toPdf: true, kind: 'issue' })
  setQuery({ i: i.issue_id, r: undefined, page: undefined })
}
watch(
  () => [route.query.m, route.query.cfg, route.query.ds, loaded.value] as const,
  ([m, c, d, ok]) => {
    if (!ok || (typeof m !== 'string' && typeof c !== 'string' && typeof d !== 'string')) return
    resetFilters()
    if (typeof m === 'string' && metricOpts.value.some((o) => o.value === m)) fMetric.value = m
    if (typeof c === 'string' && ragConfigsOf(pid.value).some((x) => x.config_id === c)) fConfig.value = c
    if (typeof d === 'string' && datasets.value.some((x) => x.dataset_id === d)) fDataset.value = d
    tab.value = 'val'
  },
  { immediate: true },
)
watch(
  () => [route.query.r, route.query.i, loaded.value] as const,
  ([r, i, ok]) => {
    if (!ok) return
    if (typeof r === 'string' && r !== sel.value) {
      const row = ragResult(pid.value, r)
      if (row) {
        if (!filtered.value.includes(row)) resetFilters()
        pick(row, { reveal: true })
      }
    } else if (typeof i === 'string' && i !== selIssue.value) {
      const row = issues.value.find((x) => x.issue_id === i)
      if (row) pickIssue(row)
    }
  },
  { immediate: true },
)

const editVal = ref('')
let editInput: HTMLInputElement | null = null
const setEditInput = (el: unknown) => (editInput = el instanceof HTMLInputElement ? el : null)
function restore(r: RagResultRow, prev: Review) {
  resetReview(r.publication_id, r.result_id, 'rag')
  if (prev.status !== 'new' || prev.corrected != null) setReview(r.publication_id, r.result_id, prev, 'rag')
}
function say(what: string, r: RagResultRow, prev: Review) {
  toast(`${what}: ${label(r)}`, { label: 'Вернуть', run: () => restore(r, prev) })
}
function accept(r: RagResultRow, next = false) {
  const prev = setReview(r.publication_id, r.result_id, { status: 'accepted' }, 'rag')
  say('Принято', r, prev)
  if (next) move(1)
}
function reject(r: RagResultRow) {
  const prev = setReview(r.publication_id, r.result_id, { status: 'rejected' }, 'rag')
  say('Отклонено', r, prev)
}
async function startEdit(r: RagResultRow) {
  editing.value = true
  const v = ragValueOf(r)
  editVal.value = v == null ? '' : String(v).replace('.', ',')
  await nextTick()
  editInput?.focus({ preventScroll: true })
  editInput?.select()
}
function saveEdit(r: RagResultRow) {
  const raw = editVal.value.replace(',', '.').replace('−', '-').trim()
  const v = parseFloat(raw)
  const digits = (/^-?\d*\.(\d+)$/.exec(raw)?.[1] ?? '').length
  if (!Number.isFinite(v)) { toast('Введите число'); return }
  const prev = setReview(r.publication_id, r.result_id, { status: 'accepted', corrected: v, digits }, 'rag')
  editing.value = false
  say('Исправлено', r, prev)
}
const rowsOnly = computed(() => base.value.flatMap((x) => (x.t === 'row' ? [x.r] : [])))
function move(d: number) {
  const list = rowsOnly.value
  if (!list.length) return
  const i = list.findIndex((r) => r.result_id === sel.value)
  const next = list[i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + d))]
  if (next && next.result_id !== sel.value) pick(next, { reveal: true, toPdf: false })
}
function onKey(e: KeyboardEvent) {
  if (tab.value !== 'val' || e.altKey || e.ctrlKey || e.metaKey || props.mobile) return
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable="true"], [role="separator"], .pv')) return
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1) }
  else if (e.key === 'Enter' && selRow.value && !t?.closest('button, a')) { e.preventDefault(); accept(selRow.value, true) }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const originText = (r: RagResultRow) => ORIGIN_RU[r.result_origin] ?? r.result_origin
const statusText = (r: RagResultRow) => (r.extraction_status && r.extraction_status !== 'extracted' ? (STATUS_RU[r.extraction_status] ?? r.extraction_status) : '')
const dirIcon = (r: RagResultRow) => (ragDirection(r) === 'higher' ? '↑' : ragDirection(r) === 'lower' ? '↓' : '')
const rawDiffers = (r: RagResultRow) => !!r.raw_value && ragFmtRaw(r) !== ragFmtValue(r)
const dsVersion = (id: string) => ragDatasetsOf(pid.value).find((d) => d.dataset_id === id)?.dataset_version ?? ''
const detail = (r: RagResultRow) =>
  ([
    ['Конфигурация', ragConfigNameOf(pid.value, r.config_id)],
    ['Датасет', ragDatasetNameOf(pid.value, r.dataset_id) + (dsVersion(r.dataset_id) ? ' · ' + dsVersion(r.dataset_id) : '')],
    ['Задача', ragTaskNameOf(pid.value, r.task_id)],
    ['Эксперимент', r.experiment_id],
    [labelOfField('metric_variant'), r.metric_variant],
    [labelOfField('metric_k'), r.metric_k],
    ['Что лучше', ragDirectionText(r)],
    [labelOfField('baseline_value'), r.baseline_value],
    [labelOfField('aggregation'), r.aggregation],
    [labelOfField('sample_size'), r.sample_size],
    ['Чьё значение', r.result_origin === 'cited' ? originText(r) + (r.cited_publication_id ? ' (' + r.cited_publication_id + ')' : '') : ''],
    ['Примечание', r.note],
  ] as [string, string][]).filter((x) => x[1])

const cQ = ref('')
const cLimit = ref(30)
watch([cQ, pid], () => { cLimit.value = 30 })
const resultsPerConfig = computed(() => {
  const m = new Map<string, number>()
  for (const r of results.value) m.set(r.config_id, (m.get(r.config_id) ?? 0) + 1)
  return m
})
const cfgFiltered = computed(() => {
  const q = cQ.value.trim().toLowerCase()
  if (!q) return configs.value
  return configs.value.filter((c) => Object.values(c).some((v) => v.toLowerCase().includes(q)) || ragConfigName(c).toLowerCase().includes(q))
})
const cfgRows = (c: RagConfigRow): [string, string, string?][] => {
  const chunk = [c.chunking_method, [c.chunk_size, c.chunk_overlap && `перекрытие ${c.chunk_overlap}`].filter(Boolean).join(', ') + (c.chunk_size && c.chunk_unit ? ' ' + c.chunk_unit : '')].filter((x) => x && x.trim()).join(' · ')
  return ([
    [labelOfField('retrieval_method'), c.retrieval_method],
    [labelOfField('retriever_model'), c.retriever_model],
    [labelOfField('embedding_model'), [c.embedding_model, c.embedding_version].filter(Boolean).join(' · ')],
    ['Разбиение на фрагменты', chunk],
    [labelOfField('index_type'), [c.index_type, c.vector_store].filter(Boolean).join(' · ')],
    [labelOfField('top_k'), c.top_k, RAG_TOPK_HINT],
    [labelOfField('reranker_model'), c.reranker_model],
    [labelOfField('generator_model'), [c.generator_model, c.generator_version].filter(Boolean).join(' · ')],
    [labelOfField('prompt_strategy'), c.prompt_strategy],
    [labelOfField('context_strategy'), c.context_strategy],
    [labelOfField('note'), c.note],
  ] as [string, string, string?][]).filter((x) => x[1] && x[1].trim())
}
function toValues(f: { config?: string; dataset?: string }) {
  resetFilters()
  if (f.config) fConfig.value = f.config
  if (f.dataset) fDataset.value = f.dataset
  tab.value = 'val'
}
const condEl = ref<HTMLElement | null>(null)
function jump(id: 'cfg' | 'ds' | 'exp') {
  const el = condEl.value?.querySelector<HTMLElement>('#rg-' + id)
  const box = condEl.value
  if (el && box) box.scrollTo({ top: el.offsetTop - box.offsetTop - 8, behavior: 'smooth' })
}
const cfgOnly = (f: string) => { fConfig.value = f; tab.value = 'val' }

const perDataset = computed(() => { const m = new Map<string, number>(); for (const r of results.value) m.set(r.dataset_id, (m.get(r.dataset_id) ?? 0) + 1); return m })
const perTask = computed(() => { const m = new Map<string, number>(); for (const r of results.value) m.set(r.task_id, (m.get(r.task_id) ?? 0) + 1); return m })
const perExp = computed(() => { const m = new Map<string, number>(); for (const r of results.value) m.set(r.experiment_id, (m.get(r.experiment_id) ?? 0) + 1); return m })
const dsRows = (d: (typeof datasets.value)[number]) =>
  ([
    [labelOfField('dataset_version'), d.dataset_version], [labelOfField('language'), d.language], [labelOfField('data_split'), d.data_split],
    [labelOfField('scientific_domain'), d.scientific_domain],
  ] as [string, string][]).filter((x) => x[1])
const expRows = (e: (typeof experiments.value)[number]) =>
  ([
    [labelOfField('baseline_name'), e.baseline_name], [labelOfField('hardware'), e.hardware], [labelOfField('latency_ms'), e.latency_ms && `${e.latency_ms.replace('.', ',')} мс`],
    [labelOfField('tokens_per_query'), e.tokens_per_query], [labelOfField('sample_size'), e.sample_size],
  ] as [string, string][]).filter((x) => x[1])
function toExperiment(id: string) { resetFilters(); tab.value = 'val'; void nextTick(() => { vlEl.value?.scrollTo({ top: tops.value[items.value.findIndex((x) => x.t === 'exp' && x.key === 'e' + id)] ?? 0 }) }) }

const rel = ref<RagRelated[]>([])
const relBusy = ref(false)
async function loadLinks() {
  relBusy.value = true
  rel.value = []
  const p = pid.value
  try { rel.value = await ragRelated(p, (list) => { if (pid.value === p) rel.value = list }) } finally { if (pid.value === p) relBusy.value = false }
}
watch([tab, pid], ([t]) => { if (t === 'links') void loadLinks() }, { immediate: true })
const openPaper = (id: string) => {
  const run = typeof route.query.run === 'string' ? route.query.run : ''
  void router.push({ path: paperPath(id, 'rag'), query: run ? { run } : {} })
}
const KIND_RU: Record<string, string> = { dataset: 'Датасет', generator: 'Генератор', embedding: 'Эмбеддинги', retriever: 'Ретривер' }
const MAXCHIPS = 6
</script>

<template>
  <div class="rg">
    <div class="rg__tabs">
      <div class="seg rg__seg" :class="{ 'seg--full': mobile }" role="tablist" aria-label="Данные статьи">
        <button
          v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }"
          :data-tip="t.tip || undefined" @click="tab = t.id"
        >{{ t.label }}<span v-if="t.n" class="seg__n num">{{ fmtInt(t.n) }}</span></button>
      </div>
    </div>

    <UiLoad :loading="!loaded && !loadErr" class="rg__body">
      <template #skeleton><div class="rg__pad rg__sk"><UiSkeleton variant="block" height="32px" /><UiSkeleton variant="row" :lines="7" /></div></template>
    <div v-if="loadErr" class="rg__pad">
      <UiEmpty icon="warn" title="Не удалось загрузить данные статьи" text="Данные для RAG лежат в public/case/rag и готовятся командой npm run gen:rag. PDF можно читать и сейчас." compact action="Повторить" @action="ragLoad(pid)" />
    </div>

    <div v-else-if="tab === 'val'" class="rg__val">
      <div class="rg__filters">
        <div class="rg__frow">
          <UiSelect v-model="fMetric" :options="metricOpts" label="Метрика" size="sm" :class="{ 'filter-on': !!fMetric }" :min-width="240" />
          <UiSelect v-if="datasets.length > 1" v-model="fDataset" :options="datasetOpts" label="Датасет" size="sm" :class="{ 'filter-on': !!fDataset }" :min-width="240" />
          <button type="button" class="chip" :class="{ 'chip--on': fFigure }" :aria-pressed="fFigure" @click="fFigure = !fFigure">Считано с графика</button>
        </div>
        <UiSearch v-model="fQ" label="Поиск по конфигурации, метрике, датасету" placeholder="Конфигурация, модель, метрика">
          <template #end>{{ filtered.length === results.length ? fmtInt(results.length) : fmtInt(filtered.length) + ' из ' + fmtInt(results.length) }}</template>
        </UiSearch>
        <div v-if="fConfig || anyFilter" class="rg__chips">
          <button v-if="fConfig" type="button" class="chip chip--sm chip--on" @click="fConfig = ''"><span class="chip__t">Конфигурация: {{ configLabel }}</span><Icon name="x" :size="12" class="chip__x" /></button>
          <button type="button" class="link link--muted" @click="resetFilters">Сбросить фильтры</button>
        </div>
      </div>

      <UiEmpty v-if="!results.length" icon="table" title="Значений нет" text="В статье не нашлось значений метрик." compact plain />
      <UiEmpty v-else-if="!filtered.length" icon="search" title="Ничего не нашлось" text="Смените фильтры." action="Сбросить фильтры" compact plain @action="resetFilters" />
      <div v-else ref="vlEl" class="rg__vl" tabindex="0" aria-label="Значения статьи">
        <div class="rg__sp" :style="{ height: totalH + 'px' }">
          <template v-for="v in visible" :key="v.it.key">
            <div v-if="v.it.t === 'exp'" class="gh gh--exp" :style="{ transform: `translateY(${v.top}px)`, height: H.exp + 'px' }">
              <span class="gh__t">{{ v.it.title }}</span><span v-if="v.it.sub" class="gh__s">{{ v.it.sub }}</span><span class="gh__n num">{{ v.it.n }}</span>
            </div>
            <div v-else-if="v.it.t === 'cfg'" class="gh gh--cfg" :style="{ transform: `translateY(${v.top}px)`, height: H.cfg + 'px' }">
              <span class="gh__t">{{ v.it.title }}</span><span class="gh__s num">{{ v.it.sub }}</span><span class="gh__n num">{{ v.it.n }}</span>
            </div>
            <div v-else-if="v.it.t === 'ds'" class="gh gh--ds" :style="{ transform: `translateY(${v.top}px)`, height: H.ds + 'px' }">
              <span class="gh__t">{{ v.it.title }}</span>
            </div>
            <div v-else-if="v.it.t === 'det'" :ref="setDetEl" class="det" data-det :style="{ transform: `translateY(${v.top}px)` }">
              <p v-if="rawDiffers(v.it.r)" class="det__raw">в статье: <span class="num">{{ ragFmtRaw(v.it.r) }}</span></p>
              <p v-if="ragFromFigure(v.it.r)" class="det__fig"><Icon name="info" :size="14" />Значение {{ RAG_FIGURE_TEXT }}: точность ограничена</p>
              <dl class="kv det__kv">
                <template v-for="[k, val] in detail(v.it.r)" :key="k"><dt>{{ k }}</dt><dd>{{ val }}</dd></template>
                <template v-if="ragPlaceOf(v.it.r)"><dt>Место в статье</dt><dd>{{ ragPlaceOf(v.it.r) }}</dd></template>
              </dl>
              <p class="rowid">results · {{ v.it.r.result_id }}<template v-if="v.it.r.config_id"> · config {{ v.it.r.config_id }}</template><template v-if="v.it.r.dataset_id"> · dataset {{ v.it.r.dataset_id }}</template><template v-if="v.it.r.experiment_id"> · experiment {{ v.it.r.experiment_id }}</template></p>
              <div v-if="issuesOfRow(v.it.r).length" class="det__is">
                <button v-for="i in issuesOfRow(v.it.r)" :key="i.issue_id" type="button" class="chip chip--sm chip--link" @click="pickIssue(i)">
                  <span class="dot" :class="stOf(i.issue_id) === 'open' ? 'dot--warn' : 'dot--ok'" aria-hidden="true" /><span class="chip__t">{{ ragCheckLabel(i.check_name) }}</span>
                </button>
              </div>
              <div class="det__act">
                <form v-if="editing" class="det__edit" @submit.prevent="saveEdit(v.it.r)">
                  <input :ref="setEditInput" v-model="editVal" class="det__in num" inputmode="decimal" aria-label="Новое значение" @keydown.esc.prevent="editing = false" />
                  <span class="det__unit">{{ ragUnitRu(v.it.r.normalized_unit) }}</span>
                  <button type="submit" class="btn btn--dark btn--sm">Сохранить</button>
                  <button type="button" class="btn btn--ghost btn--sm" @click="editing = false">Отмена</button>
                  <p v-if="editCsvNote(editVal, v.it.r.normalized_value)" class="csvnote">{{ editCsvNote(editVal, v.it.r.normalized_value) }}</p>
                </form>
                <template v-else>
                  <button v-if="mobile && (v.it.r.source_page || v.it.r.source_fragment)" type="button" class="btn btn--soft btn--sm det__pdf" @click="pick(v.it.r)"><Icon name="eye" :size="16" />Показать в PDF</button>
                  <button type="button" class="btn btn--sm" :class="reviewed(v.it.r)?.kind === 'accepted' ? 'btn--dark' : 'btn--soft'" @click="accept(v.it.r)"><Icon name="check" :size="16" />Принять<kbd v-if="!mobile">Enter</kbd></button>
                  <button type="button" class="btn btn--soft btn--sm" @click="startEdit(v.it.r)"><Icon name="edit" :size="16" />Исправить</button>
                  <button type="button" class="btn btn--sm" :class="reviewed(v.it.r)?.kind === 'rejected' ? 'btn--dark' : 'btn--ghost'" @click="reject(v.it.r)"><Icon name="x" :size="16" />Отклонить</button>
                  <p v-if="reviewed(v.it.r)?.kind === 'rejected'" class="csvnote">{{ REJECT_CSV_NOTE }}</p>
                </template>
              </div>
            </div>
            <div
              v-else class="rr" :aria-current="sel === v.it.r.result_id || undefined"
              :class="{ 'is-sel': sel === v.it.r.result_id, 'is-rejected': ragIsRejected(v.it.r) }"
              :style="{ transform: `translateY(${v.top}px)`, height: H.row + 'px' }" @click="v.it.r.result_id === sel ? closeSel() : pick(v.it.r, { toPdf: false })"
            >
              <div class="rr__top">
                <span class="rr__m" :data-tip="ragMetricName(v.it.r)">{{ ragMetricName(v.it.r) }}<small v-if="v.it.r.metric_variant" class="rr__var">{{ v.it.r.metric_variant }}</small></span>
                <span v-if="openIssuesOfRow(v.it.r).length" class="dot dot--warn" data-tip="Есть замечание" role="img" aria-label="Есть замечание" />
                <span class="rr__v num">
                  <span v-if="reviewed(v.it.r)" class="mark" :class="markClass(reviewed(v.it.r)!)">{{ reviewed(v.it.r)!.text }}</span>
                  <span :class="ragValueClass(v.it.r)">{{ ragFmtValue(v.it.r) }}</span><span v-if="dirIcon(v.it.r)" class="rr__dir" :data-tip="ragDirectionText(v.it.r)">{{ dirIcon(v.it.r) }}</span>
                </span>
              </div>
              <div class="rr__sub">
                <span v-if="ragFromFigure(v.it.r)" class="chip chip--sm chip--soft">{{ RAG_FIGURE_TEXT }}</span>
                <span v-if="v.it.r.result_origin === 'cited'" class="chip chip--sm chip--soft">из другой работы</span>
                <span v-if="statusText(v.it.r)" class="chip chip--sm chip--soft">{{ statusText(v.it.r) }}</span>
                <span v-if="v.it.r.aggregation" class="rr__agg">{{ v.it.r.aggregation }}</span>
                <span class="rowid rr__id">results · {{ v.it.r.result_id }}</span>
                <span class="rr__place">{{ ragPlaceOf(v.it.r) }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

    </div>

    <div v-else-if="tab === 'cond'" ref="condEl" class="rg__scroll">
      <nav class="rg__jump" aria-label="Разделы условий">
        <button type="button" class="chip chip--sm" @click="jump('cfg')">Конфигурации<span class="chip__n num">{{ fmtInt(configs.length) }}</span></button>
        <button type="button" class="chip chip--sm" @click="jump('ds')">Датасеты и задачи<span class="chip__n num">{{ fmtInt(datasets.length + tasks.length) }}</span></button>
        <button type="button" class="chip chip--sm" @click="jump('exp')">Эксперименты<span class="chip__n num">{{ fmtInt(experiments.length) }}</span></button>
      </nav>
      <section id="rg-cfg" class="sec">
        <h2 class="sec__h">Конфигурации<span class="num">{{ fmtInt(configs.length) }}</span><span class="srcnote">из configurations.csv</span></h2>
        <UiSearch v-model="cQ" label="Поиск по конфигурациям" placeholder="Модель, вариант, ретривер…">
        <template #end>{{ cfgFiltered.length === configs.length ? configs.length : cfgFiltered.length + ' из ' + configs.length }}</template>
        </UiSearch>
        <UiEmpty v-if="!configs.length" icon="layers" title="Конфигурации не описаны" text="В статье нет описания систем." compact plain />
        <UiEmpty v-else-if="!cfgFiltered.length" icon="search" title="Ничего не нашлось" text="Смените запрос." action="Сбросить" compact plain @action="cQ = ''" />
        <ul v-else class="cards" role="list">
        <li v-for="c in cfgFiltered.slice(0, cLimit)" :key="c.config_id" class="card dc">
          <header class="dc__h">
            <div class="dc__ttl"><b>{{ ragConfigName(c) }}</b><span class="chip chip--sm chip--soft num">{{ c.config_id }}</span></div>
            <p v-if="c.rag_variant" class="dc__m">{{ labelOfField('rag_variant') }}: {{ c.rag_variant }}</p>
          </header>
          <dl v-if="cfgRows(c).length" class="kv">
            <template v-for="[k, v, tip] in cfgRows(c)" :key="k"><dt :data-tip="tip">{{ k }}</dt><dd>{{ v }}</dd></template>
          </dl>
          <div class="dc__links">
            <button v-if="resultsPerConfig.get(c.config_id)" type="button" class="chip chip--sm chip--link" @click="cfgOnly(c.config_id)">значения<span class="chip__n">{{ fmtInt(resultsPerConfig.get(c.config_id) ?? 0) }}</span></button>
          </div>
        </li>
        </ul>
        <button v-if="cfgFiltered.length > cLimit" type="button" class="btn btn--soft btn--sm rg__more" @click="cLimit += 30">Показать ещё {{ Math.min(30, cfgFiltered.length - cLimit) }} из {{ fmtInt(cfgFiltered.length - cLimit) }}</button>
      </section>
      <section id="rg-ds" class="sec">
        <h2 class="sec__h">Датасеты<span class="num">{{ datasets.length }}</span><span class="srcnote">из datasets.csv</span></h2>
        <UiEmpty v-if="!datasets.length" icon="table" title="Датасеты не описаны" compact plain />
        <article v-for="d in datasets" :key="d.dataset_id" class="card dc">
          <header class="dc__h"><div class="dc__ttl"><b>{{ d.dataset_name || d.dataset_id }}</b><span class="chip chip--sm chip--soft num">{{ d.dataset_id }}</span></div></header>
          <dl v-if="dsRows(d).length" class="kv"><template v-for="[k, v] in dsRows(d)" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
          <p v-if="d.note" class="dc__note">{{ ragTidyText(d.note) }}</p>
          <div class="dc__links"><button v-if="perDataset.get(d.dataset_id)" type="button" class="chip chip--sm chip--link" @click="toValues({ dataset: d.dataset_id })">значения<span class="chip__n">{{ fmtInt(perDataset.get(d.dataset_id) ?? 0) }}</span></button></div>
        </article>
      </section>
      <section class="sec">
        <h2 class="sec__h">Задачи<span class="num">{{ tasks.length }}</span><span class="srcnote">из tasks.csv</span></h2>
        <UiEmpty v-if="!tasks.length" icon="table" title="Задачи не описаны" compact plain />
        <article v-for="t in tasks" :key="t.task_id" class="card dc">
          <header class="dc__h"><div class="dc__ttl"><b>{{ t.task_type || t.task_id }}</b><span class="chip chip--sm chip--soft num">{{ t.task_id }}</span></div></header>
          <p v-if="t.note" class="dc__note">{{ ragTidyText(t.note) }}</p>
          <p class="dc__m num">{{ count(perTask.get(t.task_id) ?? 0, ['значение', 'значения', 'значений']) }}</p>
        </article>
      </section>
      <section id="rg-exp" class="sec">
        <h2 class="sec__h">Эксперименты<span class="num">{{ experiments.length }}</span><span class="srcnote">из experiments.csv</span></h2>
      <UiEmpty v-if="!experiments.length" icon="layers" title="Эксперименты не описаны" text="В статье нет описания протокола оценки." compact plain />
      <article v-for="e in experiments" :key="e.experiment_id" class="card dc">
        <header class="dc__h">
          <div class="dc__ttl"><b>Эксперимент {{ e.experiment_id }}</b><span class="rowid">experiments · {{ e.experiment_id }}</span></div>
          <p v-if="e.evaluation_protocol" class="dc__m">{{ ragTidyText(e.evaluation_protocol) }}</p>
        </header>
        <dl v-if="expRows(e).length" class="kv"><template v-for="[k, v] in expRows(e)" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template></dl>
        <p v-if="e.note" class="dc__note">{{ ragTidyText(e.note) }}</p>
        <div class="dc__links"><button v-if="perExp.get(e.experiment_id)" type="button" class="chip chip--sm chip--link" @click="toExperiment(e.experiment_id)">значения<span class="chip__n">{{ fmtInt(perExp.get(e.experiment_id) ?? 0) }}</span></button></div>
      </article>
      </section>
    </div>

    <div v-else-if="tab === 'iss'" class="rg__scroll">
      <IssuesList :pids="[pid]" domain="rag" :group="false" :show-paper="false" cards in-paper :selected="selIssue ?? undefined" @show="pickIssue" />
    </div>

    <div v-else class="rg__scroll">
      <p class="rg__cap">Другие статьи набора с теми же датасетами, генераторами, моделями эмбеддингов и ретриверами.</p>
      <UiLoad :loading="relBusy && !rel.length">
        <template #skeleton><div class="cards"><UiSkeleton variant="block" height="72px" /><UiSkeleton variant="block" height="72px" /><UiSkeleton variant="block" height="72px" /></div></template>
      <UiEmpty v-if="!rel.length" icon="graph" title="Общего не нашлось" text="Других статей с теми же датасетами и моделями в наборе нет." compact plain />
      <ul v-else class="cards" role="list">
        <li v-for="r in rel" :key="r.pid">
          <button type="button" class="card rl" @click="openPaper(r.pid)">
            <span class="rl__code num">{{ r.pid }}</span>
            <span class="rl__body">
              <span class="rl__t">{{ r.title }}</span>
              <span class="rl__chips">
                <span v-for="s in r.shared.slice(0, MAXCHIPS)" :key="s.kind + s.label" class="chip chip--sm chip--soft" :data-tip="KIND_RU[s.kind]"><span class="chip__t">{{ s.label }}</span></span>
                <span v-if="r.shared.length > MAXCHIPS" class="chip chip--sm chip--soft">ещё {{ r.shared.length - MAXCHIPS }}</span>
              </span>
            </span>
            <Icon name="arrow-right" :size="16" class="rl__go" />
          </button>
        </li>
      </ul>
      </UiLoad>
      <UiSkeleton v-if="relBusy && rel.length" variant="block" height="72px" />
    </div>
    </UiLoad>
  </div>
</template>

<style scoped>
.rg { flex: 1; min-height: 0; display: flex; flex-direction: column; min-width: 0; }
.rg__tabs { flex: none; padding: var(--s3) var(--s4) var(--s2); min-width: 0; }
.rg__seg { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.rg__seg::-webkit-scrollbar { display: none; }
.rg__seg > button { flex: none; white-space: nowrap; }
.rg__pad { padding: var(--s4); }
.rg__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.rg__sk { display: grid; gap: var(--s3); }
.rg__load { display: flex; align-items: center; gap: var(--s2); color: var(--muted); font-size: var(--fs-sm); }
.rg__scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: var(--s2) var(--s4) var(--s8); display: grid; align-content: start; gap: var(--s4); }
.rg__cap { font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; }
.rg__more { justify-self: start; }
.rg__jump { display: flex; flex-wrap: wrap; gap: var(--s2); }
.cards { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s3); min-width: 0; }
.rg__val { flex: 1; min-height: 0; display: flex; flex-direction: column; min-width: 0; }
.rg__filters { flex: none; display: grid; gap: var(--s2); padding: 0 var(--s4) var(--s2); min-width: 0; }
.rg__frow { display: flex; flex-wrap: wrap; gap: var(--s2); min-width: 0; }
.rg__frow > * { min-width: 0; max-width: 100%; }
.rg__chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
.rg__vl { flex: 1; min-height: 120px; overflow-y: auto; overflow-x: hidden; position: relative; padding: 0 var(--s2) 0 var(--s4); outline: none; }
.rg__sp { position: relative; width: 100%; }
.rg__sp > * { position: absolute; left: 0; right: 0; top: 0; }
.gh { display: flex; align-items: center; gap: var(--s2); min-width: 0; overflow: hidden; font-size: var(--fs-sm); background: var(--bg); }
.gh__t { font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
.gh__s { flex: 1 1 0; min-width: 0; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gh__n { margin-left: auto; flex: none; font-size: var(--fs-xs); color: var(--faint); }
.gh--exp { border-top: 1px solid var(--line); padding-top: var(--s2); }
.gh--exp .gh__t { font-size: var(--fs-body); }
.gh--cfg { padding-left: var(--s2); }
.gh--cfg .gh__t { font-weight: 500; }
.gh--ds { padding-left: var(--s4); color: var(--muted); }
.gh--ds .gh__t { font-weight: 400; font-size: var(--fs-xs); color: var(--muted); }
.rr {
  display: grid; align-content: center; gap: 2px; padding: 0 var(--s3) 0 var(--s4); margin-left: var(--s1); border-radius: var(--r); cursor: pointer; overflow: hidden;
  transition: background-color var(--t-fast) ease, box-shadow var(--t-fast) ease;
}
@media (hover: hover) { .rr:hover { background: var(--bg-2); } }
.rr.is-sel { background: var(--card); box-shadow: 0 0 0 1px var(--line-2), var(--shadow); }
.rr__top { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.rr__m { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.rr__var { margin-left: var(--s2); font-weight: 400; color: var(--muted); font-size: var(--fs-xs); }
.rr__v { margin-left: auto; display: inline-flex; align-items: center; gap: var(--s2); font-weight: 600; white-space: nowrap; }
.rr__dir { font-weight: 400; color: var(--faint); font-size: var(--fs-xs); }
.rr.is-rejected .rr__m { color: var(--faint); }
.rr__sub { display: flex; align-items: center; gap: var(--s1); font-size: var(--fs-xs); color: var(--muted); min-width: 0; overflow: hidden; white-space: nowrap; }
.rr__agg { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.rr__id { flex: none; margin-left: var(--s2); }
.rr__place { margin-left: auto; color: var(--faint); white-space: nowrap; flex: none; }
.det { display: grid; gap: var(--s2); align-content: start; padding: var(--s3) var(--s4) var(--s3); margin: 0 0 var(--s1) var(--s1); border-radius: 0 0 var(--r) var(--r); background: var(--card); box-shadow: -1px 0 0 var(--line-2), 1px 0 0 var(--line-2), 0 1px 0 var(--line-2); }
.rr.is-sel { border-bottom-left-radius: 0; border-bottom-right-radius: 0; box-shadow: -1px 0 0 var(--line-2), 1px 0 0 var(--line-2), 0 -1px 0 var(--line-2); }
.det__act { padding-top: var(--s2); margin-top: var(--s1); border-top: 1px solid var(--line); }
.det__raw, .det__fig { font-size: var(--fs-xs); color: var(--muted); display: flex; align-items: center; gap: var(--s1); }
.det__kv { grid-template-columns: minmax(96px, auto) 1fr; gap: 4px var(--s3); }
.det__is { display: flex; flex-wrap: wrap; gap: var(--s1); }
.det__act { display: flex; flex-wrap: wrap; gap: var(--s1); }
.det__act kbd { margin-left: var(--s1); background: transparent; }
.det__act .btn--dark kbd { color: var(--on-solid); border-color: color-mix(in srgb, var(--on-solid) 30%, transparent); }
.det__edit { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1); width: 100%; }
.det__in { width: 120px; height: 32px; padding: 0 var(--s2); border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--card); }
.det__in:focus-visible { outline: 2px solid var(--blue); border-color: transparent; }
.det__unit { color: var(--muted); font-size: var(--fs-sm); margin-right: var(--s1); }
.sec { display: grid; gap: var(--s3); min-width: 0; }
.sec__h { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
.sec__h .num { font-weight: 400; color: var(--faint); }
.dc { padding: var(--s4); display: grid; gap: var(--s3); min-width: 0; }
.dc__h { display: grid; gap: 2px; min-width: 0; }
.dc__ttl { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s3); align-items: center; min-width: 0; overflow-wrap: anywhere; }
.dc__ttl b { font-weight: 600; }
.dc__m { font-size: var(--fs-sm); color: var(--muted); overflow-wrap: anywhere; }
.dc__note { font-size: var(--fs-xs); color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
.dc__links { display: flex; flex-wrap: wrap; gap: var(--s1); }
.dc__links:empty { display: none; }
.kv { display: grid; grid-template-columns: minmax(96px, auto) 1fr; gap: var(--s2) var(--s4); font-size: var(--fs-sm); }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.rl { display: flex; align-items: center; gap: var(--s3); width: 100%; padding: var(--s3) var(--s4); text-align: left; min-width: 0; }
.rl__code { flex: none; font-weight: 600; }
.rl__body { flex: 1; min-width: 0; display: grid; gap: var(--s2); }
.rl__t { font-size: var(--fs-sm); line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
.rl__chips { display: flex; flex-wrap: wrap; gap: var(--s1); min-width: 0; }
.rl__go { flex: none; color: var(--faint); }

@media (max-width: 768px) {
  .rg__tabs { padding: var(--s2) var(--s4); }
  .rg__seg > button { padding: 0 var(--s2); }
  .det__act .btn { flex: 1 1 auto; }
  .det__pdf { flex-basis: 100%; }
}
</style>
