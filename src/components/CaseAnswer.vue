<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import IssuesList from './IssuesList.vue'
import {
  CLASS_RU, deviceName, fmtValue, labelOfField, metricLabel, paperPath, placeOf, result, reviewMark, valueClass, valueOf,
  type Domain, type ResultRow,
} from '../case'
import { ragPublication, ragResult, ragSummaryOf } from '../case/rag'
import { openInSubmission, TAB_RU } from '../case/submissionFocus'
import { compareTable, paperSummary, type CaseAnswer, type CaseCard, type RagTableRow } from '../case/ask'
import { plural } from '../search'
import { fmtInt } from '../fmt'

const props = withDefaults(defineProps<{ answer: CaseAnswer; animate?: boolean; asked?: string[] }>(), { animate: true, asked: () => [] })
const emit = defineEmits<{ ask: [q: string] }>()
const router = useRouter()
const route = useRoute()

type Seg = { t: 'text'; s: string; from: number } | { t: 'cite'; n: number; from: number }
const segs = computed<Seg[]>(() => {
  const out: Seg[] = []
  let pos = 0
  for (const part of props.answer.text.split(/(\[\d+\])/)) {
    if (!part) continue
    const m = part.match(/^\[(\d+)\]$/)
    if (m && props.answer.cites[+m[1]! - 1]) { out.push({ t: 'cite', n: +m[1]!, from: pos }); pos += 1 }
    else { out.push({ t: 'text', s: part, from: pos }); pos += part.length }
  }
  return out
})
const total = computed(() => segs.value.reduce((s, x) => s + (x.t === 'text' ? x.s.length : 1), 0))

const shown = ref(0)
let raf = 0
const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
function play() {
  cancelAnimationFrame(raf)
  if (!props.animate || reduce || document.documentElement.dataset.motion === 'off') { shown.value = total.value; return }
  shown.value = 0
  const dur = Math.min(900, Math.max(250, total.value * 8))
  const t0 = performance.now()
  const tick = (t: number) => {
    shown.value = Math.ceil(total.value * Math.min(1, (t - t0) / dur))
    if (shown.value < total.value) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}
watch(() => props.answer, play, { immediate: true })
onBeforeUnmount(() => cancelAnimationFrame(raf))
const done = computed(() => shown.value >= total.value)
const textOf = (s: Extract<Seg, { t: 'text' }>) => s.s.slice(0, Math.max(0, shown.value - s.from))

const runId = computed(() => (route.path.startsWith('/run/') ? String(route.params.id ?? '') : typeof route.query.run === 'string' ? route.query.run : ''))
const paperTo = (pid: string, q: Record<string, string> = {}, domain: Domain = 'solar') => ({ path: paperPath(pid, domain), query: { ...q, ...(runId.value ? { run: runId.value } : {}) } })
const openPaper = (pid: string, domain: Domain = 'solar') => router.push(paperTo(pid, {}, domain))
const openResult = (pid: string, rid: string, domain: Domain = 'solar') => router.push(paperTo(pid, { r: rid }, domain))
const openIssue = (pid: string, iid: string, domain: Domain = 'solar') => router.push(paperTo(pid, { i: iid }, domain))
function openRef(table: string, row: string, pid: string, d: Domain = 'solar') {
  if (runId.value) openInSubmission(router, runId.value, table, row, pid)
  else if (table === 'results') void openResult(pid, row, d)
  else if (table === 'issues') void openIssue(pid, row, d)
  else void openPaper(pid, d)
}
const refText = (rid: string, page?: string) => ['results', rid, page && 'стр. ' + page].filter(Boolean).join(' · ')
function openCite(n: number) {
  tip.value = null
  const c = props.answer.cites[n - 1]
  if (!c) return
  const d: Domain = c.domain ?? 'solar'
  if (c.table && c.row) return openRef(c.table, c.row, c.pid, d)
  if (c.rid) void openResult(c.pid, c.rid, d)
  else if (c.iid) void openIssue(c.pid, c.iid, d)
  else void openPaper(c.pid, d)
}

const tip = ref<{ n: number; x: number; y: number; below: boolean } | null>(null)
function showTip(e: Event, n: number) {
  if (e instanceof PointerEvent && e.pointerType === 'touch') return
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const half = Math.min(150, window.innerWidth / 2 - 8)
  const below = r.top < 96
  tip.value = { n, x: Math.min(Math.max(r.left + r.width / 2, half + 8), window.innerWidth - half - 8), y: below ? r.bottom + 8 : r.top - 8, below }
}
const hideTip = () => (tip.value = null)
onBeforeUnmount(() => window.removeEventListener('scroll', hideTip, true))
watch(tip, (t) => (t ? window.addEventListener('scroll', hideTip, true) : window.removeEventListener('scroll', hideTip, true)))

const LIMIT = 8
const expanded = reactive(new Set<number>())
type View =
  | { kind: 'results'; title: string; rows: ResultRow[] }
  | { kind: 'compare'; title: string; pids: string[]; metrics: string[]; t: ReturnType<typeof compareTable> }
  | { kind: 'issues'; title: string; items: { pid: string; iid: string }[]; domain: Domain }
  | { kind: 'ragTable'; title: string; cols: string[]; rows: RagTableRow[]; note?: string }
  | { kind: 'ragPaper'; pid: string; title: string; year: string; results: number; configurations: number; issues: number }
  | { kind: 'paper'; s: ReturnType<typeof paperSummary> }
  | Extract<CaseCard, { kind: 'tableRows' | 'schema' }>
const views = computed<View[]>(() => props.answer.cards.map((c: CaseCard): View => {
  if (c.kind === 'results') return { kind: 'results', title: c.title, rows: c.rows.map((x) => result(x.pid, x.rid)).filter((r): r is ResultRow => !!r) }
  if (c.kind === 'compare') return { ...c, t: compareTable(c.pids, c.metrics) }
  if (c.kind === 'issues') return { kind: 'issues', title: c.title, items: c.items, domain: c.domain ?? 'solar' }
  if (c.kind === 'ragTable' || c.kind === 'tableRows' || c.kind === 'schema') return c
  if (c.kind === 'ragPaper') {
    const sm = ragSummaryOf(c.pid)
    return { kind: 'ragPaper', pid: c.pid, title: ragPublication(c.pid)?.title ?? c.pid, year: ragPublication(c.pid)?.year ?? '', results: sm.results, configurations: sm.configurations, issues: sm.issues }
  }
  return { kind: 'paper', s: paperSummary(c.pid) }
}))
const visible = <T,>(list: T[], i: number) => (expanded.has(i) ? list : list.slice(0, LIMIT))
const devLabel = (r: ResultRow) => (r.device_id ? deviceName(r.publication_id, r.device_id) : r.result_origin === 'cited' ? 'из другой работы' : '—')
const isTop = (v: Extract<View, { kind: 'compare' }>, i: number, j: number) => {
  const r = v.t.cells[i]![j]
  return !!r && v.t.top[j] != null && valueOf(r) === v.t.top[j]
}
const tipOf = (r: ResultRow) => reviewMark(r.publication_id, r.result_id)?.tip
function onRowKey(e: KeyboardEvent, r: ResultRow) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openResult(r.publication_id, r.result_id) }
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%]+/g, ' ').trim()
const pairOf = (s: string) => {
  const m = /^сравни (\S+) и (\S+)$/.exec(norm(s))
  return m ? [m[1], m[2]].sort().join('|') : ''
}
const suggestions = computed(() => {
  const asked = props.asked.map(norm)
  const pairs = new Set(props.asked.map(pairOf).filter(Boolean))
  return props.answer.suggestions.filter((q) => !asked.includes(norm(q)) && !(pairOf(q) && pairs.has(pairOf(q))))
})
</script>

<template>
  <div class="ca">
    <p class="ca__text">
      <template v-for="(s, k) in segs" :key="k">
        <template v-if="s.t === 'text'">{{ textOf(s) }}</template>
        <button
          v-else-if="shown > s.from" type="button" class="cite num" :aria-label="'Источник ' + s.n + ': ' + answer.cites[s.n - 1]!.label"
          @click="openCite(s.n)" @pointerenter="showTip($event, s.n)" @pointerleave="hideTip" @focus="showTip($event, s.n)" @blur="hideTip"
        >{{ s.n }}</button>
      </template>
    </p>
    <Teleport to="body">
      <p
        v-if="tip && answer.cites[tip.n - 1]" class="ac__tip" :class="{ 'is-below': tip.below }" role="tooltip"
        :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
      >{{ answer.cites[tip.n - 1]!.label }}</p>
    </Teleport>

    <template v-if="done">
      <section v-for="(v, i) in views" :key="i" class="ac rise" :class="v.kind === 'issues' ? 'ac--bare' : 'card'">
        <template v-if="v.kind === 'results'">
          <h3 class="ac__title">{{ v.title }}<span class="ac__n num">{{ fmtInt(v.rows.length) }}</span></h3>
          <div class="ac__scroll">
            <table class="tbl tbl--sm ac__table ac__table--res">
              <thead>
                <tr><th>Статья</th><th>Прибор</th><th>Показатель</th><th class="n">Значение</th><th class="ac__place">В наборе</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in visible(v.rows, i)" :key="r.publication_id + r.result_id" class="ac__row" tabindex="0"
                  :aria-label="`${metricLabel(r.metric_name)} ${fmtValue(r)}, ${r.publication_id}: открыть в статье`"
                  @click="openResult(r.publication_id, r.result_id)" @keydown="onRowKey($event, r)"
                >
                  <td class="ac__code">{{ r.publication_id }}</td>
                  <td class="ac__dev" :data-tip="devLabel(r) || undefined">{{ devLabel(r) }}</td>
                  <td>{{ metricLabel(r.metric_name) }}<small v-if="r.aggregation === 'mean'" class="ac__agg">среднее</small></td>
                  <td class="n ac__v">
                    <span :class="valueClass(r)" :data-tip="tipOf(r)">{{ fmtValue(r) }}</span>
                    <button type="button" class="ac__ref ac__pm" @click.stop="openRef('results', r.result_id, r.publication_id)">{{ refText(r.result_id, r.source_page) }}</button>
                  </td>
                  <td class="ac__place" :data-tip="placeOf(r) || undefined"><button type="button" class="ac__ref" @click.stop="openRef('results', r.result_id, r.publication_id)">{{ refText(r.result_id, r.source_page) }}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <button v-if="v.rows.length > LIMIT && !expanded.has(i)" type="button" class="btn btn--soft btn--sm ac__more" @click="expanded.add(i)">Показать все {{ fmtInt(v.rows.length) }}</button>
        </template>

        <template v-else-if="v.kind === 'compare'">
          <h3 class="ac__title">{{ v.title }}</h3>
          <div class="ac__scroll">
            <table class="tbl tbl--sm ac__table ac__table--cmp">
              <thead>
                <tr><th>Статья</th><th v-for="m in v.metrics" :key="m" class="n">{{ metricLabel(m) }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(pid, pi) in v.pids" :key="pid">
                  <td class="ac__first">
                    <button type="button" class="link ac__paperlink" @click="openPaper(pid)">{{ pid }}</button>
                  </td>
                  <td v-for="(m, mj) in v.metrics" :key="m" class="n">
                    <button
                      v-if="v.t.cells[pi]![mj]" type="button" class="ac__val"
                      :data-tip="[devLabel(v.t.cells[pi]![mj]!), tipOf(v.t.cells[pi]![mj]!)].filter(Boolean).join(' · ')"
                      @click="openResult(pid, v.t.cells[pi]![mj]!.result_id)"
                    >
                      <span class="ac__num" :class="[valueClass(v.t.cells[pi]![mj]!), { best: isTop(v, pi, mj) }]">{{ fmtValue(v.t.cells[pi]![mj]!) }}</span>
                      <small v-if="placeOf(v.t.cells[pi]![mj]!)" class="ac__src">{{ placeOf(v.t.cells[pi]![mj]!) }}</small>
                    </button>
                    <span v-else class="ac__none">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="ac__legend"><span class="best best--pre">лучшее в столбце</span> · значения с прибора лучшего КПД каждой статьи<template v-if="v.t.notes.length"> · {{ v.t.notes.join('; ') }}</template></p>
        </template>

        <template v-else-if="v.kind === 'issues'">
          <h3 class="ac__title">{{ v.title }}<span class="ac__n num">{{ v.items.length }}</span></h3>
          <IssuesList :items="v.items" :group="false" :limit="LIMIT" :domain="v.domain" />
        </template>

        <template v-else-if="v.kind === 'ragTable'">
          <h3 class="ac__title">{{ v.title }}<span class="ac__n num">{{ fmtInt(v.rows.length) }}</span></h3>
          <div class="ac__scroll">
            <table class="tbl tbl--sm ac__table">
              <thead><tr><th v-for="(c, ci) in v.cols" :key="c" :class="{ n: ci === 1 && v.cols[1] === 'Значение' }">{{ c }}</th><th v-if="v.rows.some((x) => x.rid)">В наборе</th></tr></thead>
              <tbody>
                <tr
                  v-for="(r, ri) in visible(v.rows, i)" :key="ri" :class="{ ac__row: !!r.pid }" :tabindex="r.pid ? 0 : undefined"
                  @click="r.pid && (r.rid ? openResult(r.pid, r.rid, 'rag') : openPaper(r.pid, 'rag'))"
                  @keydown.enter.prevent="r.pid && (r.rid ? openResult(r.pid, r.rid, 'rag') : openPaper(r.pid, 'rag'))"
                >
                  <td v-for="(c, ci) in r.cells" :key="ci" :class="{ ac__code: ci === 0 && v.cols[0] === 'Статья', n: ci === 1 && v.cols[1] === 'Значение', ac__v: ci === 1 && v.cols[1] === 'Значение', ac__wrap: ci === 2 }">
                    <span v-if="ci === 1 && v.cols[1] === 'Значение'" class="ac__tv" :class="{ best: r.best }">{{ c }}</span><template v-else>{{ c }}</template>
                  </td>
                  <td v-if="v.rows.some((x) => x.rid)" class="ac__place">
                    <button v-if="r.rid && r.pid" type="button" class="ac__ref" @click.stop="openRef('results', r.rid, r.pid, 'rag')">{{ refText(r.rid, ragResult(r.pid, r.rid)?.source_page) }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button v-if="v.rows.length > LIMIT && !expanded.has(i)" type="button" class="btn btn--soft btn--sm ac__more" @click="expanded.add(i)">Показать все {{ fmtInt(v.rows.length) }}</button>
          <p v-if="v.note" class="ac__legend"><template v-if="v.rows.some((r) => r.best)"><span class="best best--pre">лучшее</span> · </template>{{ v.note }}</p>
        </template>

        <template v-else-if="v.kind === 'tableRows'">
          <h3 class="ac__title">{{ v.title }}<span class="ac__n num">{{ v.rows.length }}</span></h3>
          <div class="ac__scroll">
            <table class="tbl tbl--sm ac__table">
              <thead><tr><th v-for="c in v.cols" :key="c"><span class="ac__fn">{{ labelOfField(c) }}</span><code class="ac__mn">{{ c }}</code></th></tr></thead>
              <tbody>
                <tr v-for="r in v.rows" :key="r.pid + r.id" class="ac__row" tabindex="0" :aria-label="`${v.table} ${r.id}: открыть в наборе`" @click="openRef(v.table, r.id, r.pid, v.domain)" @keydown.enter.prevent="openRef(v.table, r.id, r.pid, v.domain)">
                  <td v-for="(c, ci) in r.cells" :key="ci" class="ac__cell"><template v-if="c">{{ c }}</template><span v-else class="ac__none">—</span></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="ac__legend">Строки — из набора этого разбора ({{ TAB_RU[v.table] }}). Нажмите на строку, чтобы увидеть её в таблице.</p>
        </template>

        <template v-else-if="v.kind === 'schema'">
          <h3 class="ac__title">{{ v.title }}<span class="ac__n num">{{ v.fields.length }}</span></h3>
          <ul class="ac__fl" role="list">
            <li v-for="f in v.fields" :key="f.name" :data-tip="f.desc">
              <code>{{ f.name }}</code><span>{{ f.ru }}</span><b v-if="f.required" class="mark mark--ok">обязательное</b><small v-if="f.ref">→ {{ f.ref }}</small>
            </li>
          </ul>
        </template>

        <template v-else-if="v.kind === 'ragPaper'">
          <div class="ac__pp"><span class="ac__code">{{ v.pid }}</span><span v-if="v.year" class="ac__meta">{{ v.year }}</span></div>
          <h3 class="ac__ptitle">{{ v.title }}</h3>
          <p class="ac__meta num">{{ fmtInt(v.results) }} {{ plural(v.results, ['значение', 'значения', 'значений']) }} · {{ fmtInt(v.configurations) }} {{ plural(v.configurations, ['конфигурация', 'конфигурации', 'конфигураций']) }} · {{ v.issues }} {{ plural(v.issues, ['замечание', 'замечания', 'замечаний']) }}</p>
          <RouterLink :to="paperTo(v.pid, {}, 'rag')" class="link ac__open">Открыть статью<Icon name="arrow-right" :size="15" /></RouterLink>
        </template>

        <template v-else>
          <div class="ac__pp">
            <span class="ac__code">{{ v.s.pid }}</span>
            <span v-if="v.s.year" class="ac__meta">{{ v.s.year }}</span>
            <span v-if="v.s.cls" class="ac__meta">{{ CLASS_RU[v.s.cls] ?? v.s.cls }}</span>
            <span v-if="!v.s.inScope" class="mark">не по теме</span>
          </div>
          <h3 class="ac__ptitle">{{ v.s.title }}</h3>
          <p v-if="!v.s.inScope && v.s.reason" class="ac__reason">{{ v.s.reason }}</p>
          <p v-else class="ac__meta num">
            {{ fmtInt(v.s.values) }} {{ plural(v.s.values, ['значение', 'значения', 'значений']) }} ·
            {{ v.s.issues }} {{ plural(v.s.issues, ['замечание', 'замечания', 'замечаний']) }}<template v-if="v.s.best"> · КПД до {{ fmtValue(v.s.best) }}</template>
          </p>
          <RouterLink :to="paperTo(v.s.pid)" class="link ac__open">Открыть статью<Icon name="arrow-right" :size="15" /></RouterLink>
        </template>
      </section>

      <div v-if="suggestions.length" class="next rise" role="group" aria-label="Можно спросить дальше">
        <button v-for="q in suggestions" :key="q" type="button" class="chip" @click="emit('ask', q)">{{ q }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ca { display: grid; gap: var(--s3); min-width: 0; font-size: var(--fs-body); line-height: 1.65; }
.ca__text { color: var(--ink); white-space: pre-line; overflow-wrap: anywhere; }
.cite {
  position: relative; display: inline-grid; place-items: center; min-width: 20px; height: 20px; margin-left: 2px; padding: 0 var(--s1);
  vertical-align: middle; border-radius: var(--r-pill); font-size: var(--fs-xs); font-weight: 500; line-height: 1; color: var(--muted); background: var(--bg-2);
  transition: background-color var(--t-fast) ease, color var(--t-fast) ease;
}
.cite::after { content: ''; position: absolute; inset: calc(-1 * var(--s2)) calc(-1 * var(--s1)); }
.cite:hover, .cite:focus-visible { background: var(--ink); color: var(--bg); }
.ac { display: grid; gap: var(--s3); min-width: 0; margin-top: var(--s1); padding: var(--s5); }
.ac--bare { padding: 0; }
.ac__title { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; }
.ac__n { font-size: var(--fs-sm); font-weight: 400; color: var(--muted); }
.ac__scroll {
  overflow-x: auto; margin: 0 calc(-1 * var(--s5));
  background:
    linear-gradient(to right, var(--card) 30%, transparent) left / var(--s6) 100% no-repeat local,
    linear-gradient(to left, var(--card) 30%, transparent) right / var(--s6) 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, color-mix(in srgb, var(--ink) 14%, transparent), transparent) left / var(--s3) 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, color-mix(in srgb, var(--ink) 14%, transparent), transparent) right / var(--s3) 100% no-repeat scroll;
}
.ac__table { font-size: var(--fs-sm); }
.ac__table :where(th, td) { white-space: nowrap; }
.ac__table :where(th:first-child, td:first-child) { padding-left: var(--s5); }
.ac__table :where(th:last-child, td:last-child) { padding-right: var(--s5); }
.ac__row { cursor: pointer; }
.ac__row:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.ac__code { font-weight: 600; color: var(--ink); }
.ac__dev { max-width: 180px; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2); }
.ac__agg { margin-left: var(--s2); font-size: var(--fs-xs); color: var(--muted); }
.ac__v { font-weight: 500; }
.ac__pm { display: none; }
.ac__place { color: var(--muted); max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.ac__first { font-weight: 600; }
.ac__paperlink { color: var(--ink); font-weight: 600; }
.ac__val {
  display: inline-grid; justify-items: end; padding: var(--s1) var(--s2); margin: calc(-1 * var(--s1)) calc(-1 * var(--s2));
  border-radius: var(--r-xs); text-align: right; transition: background-color var(--t-fast) ease;
}
.ac__num { position: relative; margin-right: 1.15em; }
.ac__num.best::after, .ac__tv.best::after { position: absolute; left: 100%; top: 50%; translate: 0 -50%; margin-left: 0.25em; }
.ac__tv { position: relative; display: inline-block; margin-right: 1.15em; }
.ac__src { font-size: var(--fs-xs); font-weight: 400; line-height: 1.3; color: var(--muted); }
.ac__tip {
  position: fixed; z-index: var(--z-tip); width: max-content; max-width: min(300px, calc(100vw - 16px)); translate: -50% -100%;
  padding: 6px 10px; border-radius: var(--r-sm); background: var(--solid); color: var(--on-solid); box-shadow: var(--shadow-pop);
  font-size: var(--fs-xs); font-weight: 500; line-height: 1.4; pointer-events: none; overflow-wrap: anywhere;
}
.ac__tip.is-below { translate: -50% 0; }
.ac__val:hover { background: var(--bg-2); }
.ac__none { color: var(--faint); }
.ac__ref { font-family: var(--mono); font-size: var(--fs-xs); color: var(--lk); text-align: left; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent); text-underline-offset: 3px; }
.ac__ref:hover { text-decoration-color: currentColor; }
.ac__fn { display: block; font-size: var(--fs-xs); color: var(--ink); font-weight: 600; }
.ac__mn { display: block; font-family: var(--mono); font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
.ac__cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.ac__fl { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s2) var(--s4); }
.ac__fl li { display: inline-flex; align-items: baseline; gap: var(--s2); font-size: var(--fs-sm); color: var(--ink-2); }
.ac__fl code { font-family: var(--mono); font-size: var(--fs-xs); color: var(--ink); }
.ac__fl small { color: var(--muted); font-size: var(--fs-xs); }
.ac__legend { font-size: var(--fs-xs); color: var(--muted); line-height: 1.45; }
.ac__legend .best { font-weight: 500; color: var(--ink-2); }
.ac__more { justify-self: start; }
.ac__wrap { white-space: normal !important; min-width: 12em; max-width: 280px; }

.ac__pp { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s1) var(--s3); }
.ac__meta { font-size: var(--fs-sm); color: var(--muted); }
.ac__ptitle { font-size: var(--fs-body); font-weight: 500; line-height: 1.45; margin-top: calc(var(--s2) * -1); }
.ac__reason { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.45; }
.ac__open { justify-self: start; }

.next { display: flex; flex-wrap: wrap; gap: var(--s2); margin-top: var(--s1); }
@media (max-width: 768px) {
  .ac { padding: var(--s4); }
  .ac--bare { padding: 0; }
  .ac__scroll { margin: 0 calc(-1 * var(--s4)); }
  .ac__table :where(th:first-child, td:first-child) { padding-left: var(--s4); }
  .ac__table :where(th:last-child, td:last-child) { padding-right: var(--s4); }
  .cite { min-width: 28px; height: 28px; }
  .cite::after { inset: calc(-1 * var(--s2)); }
  .ac__table--res .ac__place, .ac__table--res th:nth-child(2), .ac__table--res .ac__dev { display: none; }
  .ac__table--res td, .ac__table--res th { white-space: normal; }
  .ac__pm { display: block; font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
  .ac__table--cmp .ac__first, .ac__table--cmp th:first-child { position: sticky; left: 0; z-index: 1; background: var(--card); }
  .ac__val { align-content: center; min-height: 44px; padding: 0 var(--s2); margin: 0 calc(-1 * var(--s2)); }
  .ac__paperlink { min-height: 44px; }
  .next .chip { max-width: 100%; height: auto; min-height: var(--chip-h); padding-block: var(--s1); white-space: normal; text-align: left; line-height: 1.35; }
}
</style>
