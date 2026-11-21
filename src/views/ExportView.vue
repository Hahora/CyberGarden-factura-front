<script setup lang="ts">
import UiSpinner from '../components/UiSpinner.vue'
import { useBusy } from '../useBusy'
import { fmtInt } from '../fmt'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DataPage from '../components/DataPage.vue'
import Icon from '../components/Icon.vue'
import UiEmpty from '../components/UiEmpty.vue'
import { GOLD_COLUMNS } from '../case/goldTables'
import { RAG_COLUMNS, RAG_TABLE_NAMES, labelOfField, labelOfTable, ragResultsOf, reviewInherited, reviewOf, resultsOf, ruValue } from '../case'
import {
  TABLE_NAMES, buildRagSubmission, buildSubmission, downloadJson, downloadXlsx, downloadZip, ragSubmissionZip, ragSummaryOfTables, submissionToast, summaryOf, type Row,
} from '../case/export'
import { download, toXlsx, type ExportTable } from '../exporters'
import { dataDomain, dataPids, dataRun, exportPick, setDataRun, useDataReady } from '../dataTabs'
import { runOf } from '../case/runs'
import { plural } from '../search'
import { state, toast } from '../store'
import { useViewState } from '../viewState'

const route = useRoute()
const router = useRouter()
if (typeof route.query.run === 'string' && route.query.run && runOf(route.query.run)) setDataRun(route.query.run)

const ui = useViewState('export', () => ({ table: 'results', all: false }))

const isRag = computed(() => dataDomain.value === 'rag')
const only = computed(() => {
  if (route.query.pick && exportPick.value) return exportPick.value
  const ids = route.query.ids
  return typeof ids === 'string' && ids ? new Set(ids.split(',')) : null
})
const pids = computed(() => {
  const p = route.query.pids
  if (typeof p === 'string' && p) return p.split(',')
  return dataPids.value
})
const ready = useDataReady(pids)
const names = computed<readonly string[]>(() => (isRag.value ? RAG_TABLE_NAMES : TABLE_NAMES))
const tables = computed<Record<string, Row[]>>(() => {
  const o = { only: only.value ?? undefined }
  if (isRag.value) return ready.value ? buildRagSubmission(pids.value, o) : Object.fromEntries(RAG_TABLE_NAMES.map((n) => [n, [] as Row[]]))
  return buildSubmission(pids.value, o)
})
const total = computed(() => names.value.reduce((a, n) => a + (tables.value[n]?.length ?? 0), 0))
const values = computed(() => tables.value.results?.length ?? 0)
const name = computed(() => (dataRun.value ? (runOf(dataRun.value)?.title ?? '') : 'Все разборы'))
const skipped = computed(() => {
  let rejected = 0
  let corrected = 0
  for (const p of pids.value) {
    for (const r of isRag.value ? ragResultsOf(p) : resultsOf(p)) {
      const dom = isRag.value ? 'rag' : 'solar'
      if (reviewInherited(p, r.result_id, dom)) continue
      const v = reviewOf(p, r.result_id, dom)
      if (v.status === 'rejected') rejected++
      else if (v.corrected != null) corrected++
    }
  }
  return { rejected, corrected }
})

const cur = computed<string>(() => (names.value.includes(ui.table) ? ui.table : 'results'))
const previewCols = (c: string[]) => {
  const head = ['publication_id', 'result_id', 'metric_name', 'metric_value', 'metric_unit', 'metric_variant', 'metric_k']
  return [...head.filter((h) => c.includes(h)), ...c.filter((h) => !head.includes(h))]
}
const cols = computed<string[]>(() => (isRag.value ? (cur.value === 'results' ? previewCols(RAG_COLUMNS[cur.value]!) : RAG_COLUMNS[cur.value]!) : GOLD_COLUMNS[cur.value as keyof typeof GOLD_COLUMNS]))
const sample = computed(() => tables.value[cur.value]?.slice(0, 5) ?? [])
const open = computed(() => ui.all || cur.value !== 'results')
const tabs = computed<readonly string[]>(() => (open.value ? names.value : ['results']))
const hidden = computed(() => names.value.length - 1)
function pick(t: string) {
  ui.table = t
  if (t !== 'results') ui.all = true
}
const showAll = () => (ui.all = true)
const colLabel = (h: string) => (h === 'result_id' ? 'ID значения' : labelOfField(h))
const tw = ref<HTMLElement>()
const moreRight = ref(false)
function checkScroll() {
  const e = tw.value
  moreRight.value = !!e && e.scrollLeft + e.clientWidth < e.scrollWidth - 2
}
let ro: ResizeObserver | undefined
watch(tw, (el) => { ro?.disconnect(); ro = new ResizeObserver(checkScroll); if (el) { ro.observe(el); const t = el.querySelector('table'); if (t) ro.observe(t); checkScroll(); requestAnimationFrame(checkScroll) } })
onBeforeUnmount(() => ro?.disconnect())
watch([cur, tables], () => void nextTick(checkScroll), { flush: 'post' })

const stem = computed(() => (dataRun.value ? dataRun.value : 'all'))
const solarTables = () => tables.value as unknown as ReturnType<typeof buildSubmission>
const ragTables = () => tables.value as unknown as ReturnType<typeof buildRagSubmission>
const { busy: zipBusy, run: zipRun } = useBusy()
function zipNow() {
  if (isRag.value) {
    download(`submission-rag-${stem.value}.zip`, ragSubmissionZip(ragTables()), 'application/zip')
    toast(submissionToast(ragSummaryOfTables(ragTables())))
    return
  }
  downloadZip(solarTables(), `submission-${stem.value}.zip`)
  toast(submissionToast(summaryOf(solarTables())))
}
const NUMERIC = new Set(['year', 'source_page', 'metric_value', 'normalized_value', 'baseline_value', 'metric_k', 'top_k', 'chunk_size', 'chunk_overlap', 'latency_ms', 'tokens_per_query', 'sample_size'])
function ragJson() {
  const typed = (n: string) => (tables.value[n] ?? []).map((r) => Object.fromEntries(RAG_COLUMNS[n]!.map((c) => {
    const v = r[c] ?? ''
    if (v === '') return [c, null]
    if (c === 'in_scope') return [c, v === 'true']
    if (NUMERIC.has(c) && Number.isFinite(Number(v))) return [c, Number(v)]
    if (c === 'record_ids' || c === 'authors') return [c, v.split(';').map((x) => x.trim())]
    return [c, v]
  })))
  return { meta: { generated_by: 'Фактура AI', area: 'rag', tables: Object.fromEntries(RAG_TABLE_NAMES.map((n) => [n, tables.value[n]?.length ?? 0])) }, ...Object.fromEntries(RAG_TABLE_NAMES.map((n) => [n, typed(n)])) }
}
function getJson() {
  if (!total.value) return
  if (isRag.value) download(`submission-rag-${stem.value}.json`, JSON.stringify(ragJson(), null, 2), 'application/json')
  else downloadJson(solarTables(), `submission-${stem.value}.json`)
  toast(`Скачан файл JSON: ${fmtInt(values.value)} ${plural(values.value, ['значение', 'значения', 'значений'])}`)
}
function getXlsx() {
  if (!values.value) return
  if (isRag.value) {
    const head = RAG_COLUMNS.results!
    const rows = tables.value.results ?? []
    const tbl: ExportTable = { head, rows: rows.map((r) => head.map((c) => r[c] ?? '')), facts: rows.length, papers: new Set(rows.map((r) => r.publication_id)).size }
    download(`results-rag-${stem.value}.xlsx`, toXlsx(tbl), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  } else downloadXlsx(solarTables(), `results-${stem.value}.xlsx`)
  toast(`Скачан файл Excel: ${fmtInt(values.value)} ${plural(values.value, ['значение', 'значения', 'значений'])}`)
}
const OTHER = [
  { id: 'json', name: 'Один файл JSON', hint: 'Для программ: все таблицы вместе, пустые поля — null', icon: 'code', run: getJson },
  { id: 'xlsx', name: 'Файл Excel', hint: 'Только значения, одним листом', icon: 'sheet', run: getXlsx },
] as const
const clearOnly = () => { exportPick.value = null; void router.replace({ path: '/export', query: dataRun.value ? { run: dataRun.value } : {} }) }
const rowsWord = (n: number) => `${fmtInt(n)} ${plural(n, ['строка', 'строки', 'строк'])}`
</script>

<template>
  <DataPage title="Экспорт" :loading="!ready" :flow="state.mobile">
    <template #actions>
      <button type="button" class="btn btn--dark btn--sm" :disabled="!total || zipBusy" @click="zipRun(zipNow, $event)"><UiSpinner v-if="zipBusy" :size="14" tone="current" /><Icon v-else name="export" :size="16" />{{ zipBusy ? 'Готовим архив…' : 'Скачать набор для сдачи' }}</button>
    </template>

    <UiEmpty v-if="!pids.length" icon="export" title="Выгружать пока нечего" text="Набор появится, когда статьи будут разобраны." />
    <div v-else class="grid">
      <div class="left">
        <section class="card box">
          <h2>Что выгрузить</h2>
          <p class="what"><b>{{ only ? 'Выбранные значения' : name }}</b><span class="num">{{ pids.length }} {{ plural(pids.length, ['статья', 'статьи', 'статей']) }}<template v-if="only"> · {{ fmtInt(only.size) }} {{ plural(only.size, ['значение', 'значения', 'значений']) }}</template> · 7 таблиц и паспорт · {{ fmtInt(values) }} {{ plural(values, ['значение', 'значения', 'значений']) }}</span></p>
          <button v-if="only || route.query.pids" type="button" class="link" @click="clearOnly">Выгрузить весь разбор</button>
          <p v-if="skipped.rejected || skipped.corrected" class="what what--s num">
            <template v-if="skipped.rejected">Отклонено вами: {{ skipped.rejected }}, в файл не попадёт.</template>
            <template v-if="skipped.corrected"> Исправлено вами: {{ skipped.corrected }}, в файле ваши значения.</template>
          </p>
          <p class="what what--s">Сдаются набор данных (7 CSV) и паспорт (PASSPORT.md, passport.json): оба файла лежат в одном ZIP. Проверка организаторов читает только таблицы.</p>
          <p class="what what--s">Статус замечаний («проверено», «исправлено») в файл не входит: у набора для сдачи фиксированный формат.</p>
        </section>
        <section class="card box">
          <h2>Другие форматы</h2>
          <div class="fmts">
            <button v-for="f in OTHER" :key="f.id" type="button" class="fmt" :disabled="!total" @click="f.run()">
              <Icon :name="f.icon" :size="16" /><span><b>{{ f.name }}</b><small>{{ f.hint }}</small></span>
            </button>
          </div>
        </section>
        <RouterLink to="/passport" class="fmt pass">
          <Icon name="book" :size="16" /><span><b>Паспорт набора</b><small>Поля, правила и критерии. Уже лежит в ZIP: PASSPORT.md и passport.json</small></span><Icon name="arrow-right" :size="16" class="pass__go" />
        </RouterLink>
      </div>

      <section class="card box right">
        <div class="prev__top">
          <h2>Предпросмотр</h2>
          <span class="cnt num"><b>{{ fmtInt(total) }}</b> {{ plural(total, ['строка', 'строки', 'строк']) }}</span>
        </div>
        <div class="tabs">
          <div class="seg" role="tablist" aria-label="Таблицы набора">
            <button v-for="t in tabs" :key="t" type="button" role="tab" :aria-selected="cur === t" @click="pick(t)">
              {{ labelOfTable(t) }}<span class="seg__n">{{ fmtInt(tables[t]?.length ?? 0) }}</span>
            </button>
          </div>
          <button v-if="!open" type="button" class="link" @click="showAll">Ещё {{ hidden }} таблиц</button>
        </div>
        <p class="file">Файл <code>{{ cur }}.csv</code></p>
        <div v-if="sample.length" class="twrap" :class="{ 'is-more': moreRight }">
        <div ref="tw" class="tw" @scroll.passive="checkScroll">
          <table class="tbl tbl--sm tb">
            <thead>
              <tr><th v-for="h in cols" :key="h"><span>{{ colLabel(h) }}</span><small>{{ h }}</small></th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in sample" :key="i"><td v-for="h in cols" :key="h" :data-tip="r[h] || undefined">{{ ruValue(h, r[h] ?? '') }}</td></tr>
            </tbody>
          </table>
        </div>
        <span class="hs" :class="{ 'is-on': moreRight }" aria-hidden="true">прокрутите вбок →</span>
        </div>
        <p v-else class="more">В таблице нет строк.</p>
        <p v-if="(tables[cur]?.length ?? 0) > 5" class="more num">и ещё {{ rowsWord(tables[cur]!.length - 5) }}</p>
      </section>
    </div>
  </DataPage>
</template>

<style scoped>
.load { display: grid; gap: var(--s3); }
.load p { font-size: var(--fs-sm); color: var(--muted); }
.grid { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 8fr); gap: var(--block); align-items: start; }
.left { display: grid; gap: var(--s3); min-width: 0; }
.right { position: sticky; top: 0; }
.box { min-width: 0; padding: var(--s5); }
.box h2 { font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; margin-bottom: var(--s3); }
.what { display: grid; gap: 2px; }
.what b { font-weight: 500; }
.what span { font-size: var(--fs-sm); color: var(--muted); }
.what--s { margin-top: var(--s3); font-size: var(--fs-sm); color: var(--muted); }
.box .link { margin-top: var(--s2); font-size: var(--fs-sm); }
.cnt { font-size: var(--fs-sm); color: var(--muted); }
.cnt b { color: var(--ink); font-weight: 600; }
.fmts { display: grid; gap: var(--s2); }
.fmt, .pass { display: flex; align-items: flex-start; gap: var(--s3); text-align: left; color: var(--ink); }
.fmt { padding: var(--s3); border-radius: var(--r); background: color-mix(in srgb, var(--ink) 5%, transparent); transition: background-color var(--t-fast) ease; }
.fmt:hover:not(:disabled) { background: color-mix(in srgb, var(--ink) 9%, transparent); }
.fmt:disabled { opacity: 0.5; cursor: default; }
.pass { align-items: center; }
.fmt > :first-child, .pass > :first-child { flex: none; margin-top: 2px; }
.pass > :first-child { margin-top: 0; }
.fmt span, .pass span { display: grid; gap: 1px; min-width: 0; flex: 1; }
.fmt b, .pass b { font-weight: 500; font-size: var(--fs-body); }
.fmt small, .pass small { font-size: var(--fs-sm); color: var(--muted); }
.pass__go { flex: none; color: var(--muted); }
.prev__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; margin-bottom: var(--s3); }
.prev__top h2 { margin: 0; }
.tabs .seg { flex-wrap: wrap; overflow: visible; }
.tabs { display: flex; align-items: center; gap: var(--s3); flex-wrap: wrap; min-width: 0; }
.file { margin: var(--s2) 0 var(--s3); font-size: var(--fs-xs); color: var(--muted); }
.file code, .tb small { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.twrap { position: relative; }
.twrap::after { content: ''; position: absolute; top: 1px; right: 1px; bottom: 1px; width: 64px; border-radius: 0 var(--r) var(--r) 0; background: linear-gradient(to right, transparent, var(--card)); pointer-events: none; opacity: 0; transition: opacity var(--t); }
.twrap.is-more::after { opacity: 1; }
.hs { position: absolute; right: 2px; top: -22px; font-size: var(--fs-xs); color: var(--muted); pointer-events: none; opacity: 0; transition: opacity var(--t); }
.hs.is-on { opacity: 1; }
.tw { overflow-x: auto; max-width: 100%; border-radius: var(--r); box-shadow: inset 0 0 0 1px var(--line); }
.tb { width: max-content; min-width: 100%; font-size: var(--fs-sm); }
.tb th { height: auto; padding-block: var(--s2); }
.tb th span { display: block; font-weight: 600; color: var(--ink-2); }
.tb th small { display: block; font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
.tb td { white-space: nowrap; max-width: 14rem; overflow: hidden; text-overflow: ellipsis; }
.more { margin-top: var(--s2); font-size: var(--fs-sm); color: var(--muted); }

@media (max-width: 960px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .right { position: static; }
}
@media (max-width: 768px) {
  .box { padding: var(--s4); }
  .fmt { min-height: 56px; }
}
</style>
