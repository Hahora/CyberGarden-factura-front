<script setup lang="ts">
import { computed, watch } from 'vue'
import DataPage from './DataPage.vue'
import UiEmpty from './UiEmpty.vue'
import UiSelect, { type Option } from './UiSelect.vue'
import { markClass, resultLink } from '../case'
import {
  RAG_FIGURE_TEXT, ragTidyText, ragBestAmong, ragBestIndex, ragCompareKey, ragCompareParts, ragConfigNameOf, ragDatasetNameOf, ragDirection, ragDirectionText, ragExperiment,
  ragFmtValue, ragFromFigure, ragInScope, ragIsSim, ragPublication, ragMetricName, ragPlaceOf, ragReviewMark, ragTaskNameOf, ragUsableResults, ragValueOf, ragWhyNotComparable,
  type RagDirection,
} from '../case/rag'
import type { RagResultRow } from '../case'
import { dataPids, useDataReady } from '../dataTabs'
import { plural } from '../search'
import { state } from '../store'
import { useViewState } from '../viewState'

const ui = useViewState('compare-rag', () => ({ metric: '', dataset: '', papers: [] as string[] }))
const pool = computed(() => dataPids.value.filter(ragInScope))
const ready = useDataReady(pool)

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const metricKey = (r: RagResultRow) => `${norm(r.metric_name)}|${norm(r.metric_variant)}|${r.metric_k.trim()}`
const dsKey = (pid: string, r: RagResultRow) => norm(ragDatasetNameOf(pid, r.dataset_id))

interface Entry { pid: string; r: RagResultRow; ds: string; dsName: string }
const entries = computed<Map<string, Entry[]>>(() => {
  const m = new Map<string, Entry[]>()
  if (!ready.value) return m
  for (const pid of pool.value) {
    for (const r of ragUsableResults(pid)) {
      const k = metricKey(r)
      let l = m.get(k)
      if (!l) m.set(k, (l = []))
      l.push({ pid, r, ds: dsKey(pid, r), dsName: ragDatasetNameOf(pid, r.dataset_id) })
    }
  }
  return m
})
const papersOf = (l: Entry[]) => new Set(l.map((e) => e.pid)).size
const metricOpts = computed<Option[]>(() =>
  [...entries.value]
    .map(([key, l]) => {
      const r = l[0]!.r
      return { key, papers: papersOf(l), label: ragMetricName(r) + (r.metric_variant ? ' · ' + r.metric_variant : '') }
    })
    .filter((x) => x.papers >= 2)
    .sort((a, b) => b.papers - a.papers || a.label.localeCompare(b.label, 'ru'))
    .map((x) => ({ value: x.key, label: x.label, hint: `${x.papers} ${plural(x.papers, ['статья', 'статьи', 'статей'])}` })),
)
const metric = computed(() => (metricOpts.value.some((o) => o.value === ui.metric) ? ui.metric : metricOpts.value[0]?.value ?? ''))
const metricEntries = computed(() => entries.value.get(metric.value) ?? [])
const datasetOpts = computed<Option[]>(() => {
  const m = new Map<string, { name: string; pids: Set<string> }>()
  for (const e of metricEntries.value) {
    let d = m.get(e.ds)
    if (!d) m.set(e.ds, (d = { name: e.dsName, pids: new Set() }))
    d.pids.add(e.pid)
  }
  return [...m]
    .filter(([, d]) => d.pids.size >= 2)
    .sort((a, b) => b[1].pids.size - a[1].pids.size || a[1].name.localeCompare(b[1].name, 'ru'))
    .map(([k, d]) => ({ value: k, label: d.name, hint: `${d.pids.size} ${plural(d.pids.size, ['статья', 'статьи', 'статей'])}` }))
})
const dataset = computed(() => (datasetOpts.value.some((o) => o.value === ui.dataset) ? ui.dataset : datasetOpts.value[0]?.value ?? ''))
watch(metric, (m) => { if (ui.metric !== m) ui.metric = m })

interface Line {
  pid: string
  title: string
  best: RagResultRow
  sim: string
  n: number
  value: number | null
  text: string
  config: string
  task: string
  protocol: string
  place: string
  fig: boolean
  mark: ReturnType<typeof ragReviewMark>
  main: boolean
  why: string
}
const lines = computed<Line[]>(() => {
  const by = new Map<string, Entry[]>()
  for (const e of metricEntries.value) {
    if (e.ds !== dataset.value) continue
    let l = by.get(e.pid)
    if (!l) by.set(e.pid, (l = []))
    l.push(e)
  }
  const out: Line[] = []
  for (const [pid, l] of by) {
    const g = new Map<string, RagResultRow[]>()
    for (const e of l) {
      const k = ragCompareKey(e.r)
      const list = g.get(k)
      if (list) list.push(e.r)
      else g.set(k, [e.r])
    }
    const group0 = [...g.values()].sort((a, b) => b.length - a.length)[0]!
    const real = group0.filter((r) => !ragIsSim(pid, r))
    const group = real.length ? real : group0
    const best = ragBestAmong(group) ?? group[0]!
    const simAll = ragBestAmong(group0)
    out.push({
      pid, title: ragPublication(pid)?.title ?? '', best, n: group.length, value: ragValueOf(best), text: ragFmtValue(best),
      config: ragConfigNameOf(pid, best.config_id), task: ragTaskNameOf(pid, best.task_id),
      protocol: ragTidyText(ragExperiment(pid, best.experiment_id)?.evaluation_protocol ?? ''), place: ragPlaceOf(best), fig: ragFromFigure(best), mark: ragReviewMark(best),
      main: true, why: '',
      sim: real.length ? (simAll && simAll !== best && ragValueOf(simAll) !== ragValueOf(best) ? 'Без симуляций; с ними — ' + ragFmtValue(simAll) : '') : 'значение из симуляции',
    })
  }
  const keyOf = (x: Line) => { const p = ragCompareParts(x.best); return p.task + '\u0001' + p.unit }
  const cnt = new Map<string, number>()
  for (const x of out) cnt.set(keyOf(x), (cnt.get(keyOf(x)) ?? 0) + 1)
  const top = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0]
  const ref = out.find((x) => keyOf(x) === top)
  for (const x of out) {
    if (keyOf(x) === top || !ref) continue
    x.main = false
    x.why = ragWhyNotComparable(ref.best, x.best, { ignoreProtocol: true }).join(', ')
  }
  return out
})
const dir = computed<RagDirection>(() => ragDirection(lines.value[0]?.best ?? { metric_direction: '' }))
const filtered = computed(() => {
  const only = new Set(ui.papers)
  const l = only.size ? lines.value.filter((x) => only.has(x.pid)) : lines.value
  const sign = dir.value === 'lower' ? 1 : -1
  return [...l].sort((a, b) => Number(b.main) - Number(a.main) || (a.value == null ? 1 : b.value == null ? -1 : sign * (a.value - b.value)) || a.pid.localeCompare(b.pid))
})
const bestIdx = computed(() => ragBestIndex(filtered.value.map((x) => (x.main ? x.value : null)), dir.value))
const paperOpts = computed<Option[]>(() => lines.value.map((x) => ({ value: x.pid, label: `${x.pid} · ${x.title}` })))
const papersN = (n: number) => `${n} ${plural(n, ['статья', 'статьи', 'статей'])}`
const asArr = (v: string | string[]) => (Array.isArray(v) ? v : [v])

const whyText = (why: string) => {
  const t = why.includes('задач'), u = why.includes('единиц')
  return t && u ? 'другая задача и единица измерения' : t ? 'другая задача' : u ? 'другая единица измерения' : why
}
const reasons = computed(() => {
  const out: string[] = []
  const l = filtered.value
  if (l.length < 2) return out
  const odd = l.filter((x) => !x.main)
  if (odd.length) out.push(`У ${odd.map((x) => x.pid).join(', ')} ${whyText([...new Set(odd.flatMap((x) => x.why.split(', ')))].join(', '))}: они внизу списка и в сравнении «лучшего» не участвуют.`)
  if (dir.value !== 'higher' && dir.value !== 'lower') out.push('У метрики в статьях не указано, что лучше (больше или меньше), поэтому «лучшее» не отмечено.')
  const protocols = new Set(l.map((x) => ragCompareParts(x.best).protocol).filter(Boolean))
  if (protocols.size > 1) out.push('Протоколы оценки в статьях описаны по-разному, смотрите колонку «Протокол»: числа сравнивайте как ориентир, а не как точное превосходство.')
  if (l.some((x) => x.fig)) out.push('Часть значений считана с графика, они приблизительные.')
  return out
})
const short = (t: string, n = 110) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
</script>

<template>
  <DataPage title="Сравнение" :loading="!ready" :flow="state.mobile">
    <template v-if="ready && metricOpts.length" #toolbar>
      <UiSelect :model-value="metric" :options="metricOpts" label="Метрика" placeholder="Метрика" searchable variant="chip" :size="state.mobile ? 'md' : 'sm'" :min-width="300" @update:model-value="(v) => { ui.metric = v as string; ui.dataset = ''; ui.papers = [] }" />
      <UiSelect :model-value="dataset" :options="datasetOpts" label="Датасет" placeholder="Датасет" searchable variant="chip" :size="state.mobile ? 'md' : 'sm'" :min-width="280" @update:model-value="(v) => { ui.dataset = v as string; ui.papers = [] }" />
      <UiSelect
        :class="{ 'filter-on': ui.papers.length }" :model-value="ui.papers" :options="paperOpts" label="Статьи" placeholder="Все статьи" multiple searchable variant="chip"
        :size="state.mobile ? 'md' : 'sm'" :min-width="340" :summary="papersN" @update:model-value="(v) => (ui.papers = asArr(v))"
      />
    </template>

    <UiEmpty v-if="pool.length < 2 || !metricOpts.length" icon="columns" title="Нечего сравнивать" text="Нужны хотя бы две статьи с одной и той же метрикой." />
    <UiEmpty v-else-if="!datasetOpts.length" icon="columns" title="Нет общего датасета" text="У этой метрики нет датасета, по которому есть значения хотя бы двух статей. Выберите другую метрику." />
    <div v-else class="cr">
      <p class="cr__note">
        Сравниваются значения метрики <b>{{ metricOpts.find((o) => o.value === metric)?.label }}</b> на датасете <b>{{ datasetOpts.find((o) => o.value === dataset)?.label }}</b>.
        <template v-if="filtered[0]"> Что лучше: {{ ragDirectionText(filtered[0].best) }}.</template>
      </p>
      <section v-if="reasons.length" class="cr__warn" aria-label="Сравнивать напрямую нужно осторожно">
        <h2>Сравнивать напрямую нужно осторожно</h2>
        <ul><li v-for="r in reasons" :key="r">{{ r }}</li></ul>
      </section>

      <div v-if="!state.mobile" class="cr__w card">
        <table class="tbl tbl--sm cr__t">
          <thead>
            <tr><th>Статья</th><th>Конфигурация</th><th class="n">Значение</th><th>Задача</th><th>Протокол</th><th>Источник</th></tr>
          </thead>
          <tbody>
            <tr v-for="(x, i) in filtered" :key="x.pid">
              <td>
                <RouterLink :to="'/paper/rag/' + x.pid" class="th"><b class="num">{{ x.pid }}</b><span>{{ short(x.title, 70) }}</span></RouterLink>
              </td>
              <td>{{ x.config }}<small v-if="x.n > 1" class="pl">лучшее из {{ x.n }} {{ plural(x.n, ['конфигурации', 'конфигураций', 'конфигураций']) }}</small></td>
              <td class="n">
                <RouterLink :to="resultLink(x.pid, x.best.result_id, 'rag')" class="v num" :class="{ best: bestIdx === i }">{{ x.text }}</RouterLink>
                <span v-if="x.mark?.kind === 'fixed'" class="mark" :class="markClass(x.mark)">{{ x.mark.text }}</span>
                <small v-if="x.fig" class="pl">{{ RAG_FIGURE_TEXT }}</small>
                <small v-if="x.sim" class="pl">{{ x.sim }}</small>
                <small v-if="!x.main" class="pl">не сравнимо: {{ whyText(x.why) }}</small>
              </td>
              <td>{{ x.task }}</td>
              <td class="cr__p" :data-tip="x.protocol || undefined">{{ x.protocol ? short(x.protocol) : '—' }}</td>
              <td class="num">{{ x.place || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="cr__cards">
        <article v-for="(x, i) in filtered" :key="x.pid" class="pc card">
          <RouterLink :to="'/paper/rag/' + x.pid" class="th"><b class="num">{{ x.pid }}</b><span>{{ short(x.title, 70) }}</span></RouterLink>
          <p class="pc__v">
            <RouterLink :to="resultLink(x.pid, x.best.result_id, 'rag')" class="v num" :class="{ best: bestIdx === i }">{{ x.text }}</RouterLink>
            <span v-if="x.mark?.kind === 'fixed'" class="mark" :class="markClass(x.mark)">{{ x.mark.text }}</span>
            <small v-if="x.sim" class="pl">{{ x.sim }}</small>
          </p>
          <dl>
            <dt>Конфигурация</dt><dd>{{ x.config }}<template v-if="x.n > 1"> · лучшее из {{ x.n }} {{ plural(x.n, ['конфигурации', 'конфигураций', 'конфигураций']) }}</template></dd>
            <dt>Задача</dt><dd>{{ x.task }}</dd>
            <dt>Протокол</dt><dd>{{ x.protocol ? short(x.protocol, 140) : '—' }}</dd>
            <dt v-if="!x.main">Сравнимо</dt><dd v-if="!x.main">нет: {{ whyText(x.why) }}</dd>
            <dt>Источник</dt><dd class="num">{{ x.place || '—' }}<template v-if="x.fig"> · {{ RAG_FIGURE_TEXT }}</template></dd>
          </dl>
        </article>
      </div>
    </div>
  </DataPage>
</template>

<style scoped>
.cr { display: grid; gap: var(--s4); min-width: 0; }
.cr__note { font-size: var(--fs-sm); color: var(--muted); }
.cr__note b { color: var(--ink); font-weight: 600; }
.cr__warn { padding: var(--s4); border-radius: var(--r-lg); background: var(--amber-soft, var(--bg-2)); display: grid; gap: var(--s2); }
.cr__warn h2 { font-size: var(--fs-body); font-weight: 600; color: var(--amber); }
.cr__warn ul { margin: 0; padding-left: var(--s5); display: grid; gap: var(--s1); font-size: var(--fs-sm); color: var(--ink-2); }
.cr__w { overflow-x: auto; }
.cr__t { table-layout: fixed; min-width: 900px; font-size: var(--fs-sm); }
.cr__t th:nth-child(1) { width: 22%; }
.cr__t th:nth-child(2) { width: 18%; }
.cr__t th:nth-child(3) { width: 130px; }
.cr__t th:nth-child(4) { width: 12%; }
.cr__t th:nth-child(6) { width: 12%; }
.cr__t thead th { height: auto; padding-block: var(--s3); white-space: normal; font-size: inherit; }
.cr__t td { vertical-align: top; overflow-wrap: anywhere; padding-block: var(--s2); height: auto; }
.cr__p { color: var(--ink-2); }
.th { display: grid; gap: 2px; color: inherit; }
.th b { font-weight: 600; font-size: var(--fs-body); color: var(--ink); }
.th span { color: var(--ink-2); font-weight: 400; line-height: 1.3; }
.th:hover b { text-decoration: underline; }
.v { color: var(--ink); font-size: var(--fs-body); font-weight: 500; }
.v:hover { text-decoration: underline; }
.v { position: relative; display: inline-block; margin-right: 1.15em; }
.v.best::after { position: absolute; left: 100%; top: 50%; translate: 0 -50%; margin-left: 0.25em; }
.mark { margin-left: var(--s2); }
.pl { display: block; font-size: var(--fs-xs); color: var(--muted); line-height: 1.3; }

.cr__cards { display: grid; gap: var(--s3); }
.pc { display: grid; gap: var(--s3); padding: var(--s4); }
.pc__v { margin: 0; }
.pc dl { margin: 0; display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--s2) var(--s3); font-size: var(--fs-sm); }
.pc dt { color: var(--muted); }
.pc dd { margin: 0; overflow-wrap: anywhere; }
.pc .v { display: inline-flex; align-items: center; min-height: 44px; font-size: var(--fs-h2); }
</style>
