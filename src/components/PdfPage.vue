<script setup lang="ts">
import UiHint from './UiHint.vue'
import { hideHint } from '../hints'
import { scrollWithin } from '../scroll'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import AddFact from './AddFact.vue'
import { TOKEN, anchorOf, cellText, paramOf, parseRaw, sampleWords, unitText } from '../data'
import { display, factOf, factsOf, labelOf, state, type Paper } from '../store'
import { guessFact, type Guess } from '../norm'
import { useScrollMemory, useViewState } from '../viewState'

const props = defineProps<{
  paper: Paper
  selectedAnchor: string | null
  hot: string[]
  issueAnchors: Set<string>
}>()
const emit = defineEmits<{
  (e: 'hover', factId: string | null): void
  (e: 'pick', factId: string): void
  (e: 'claim', anchor: string): void
}>()

type Seg = { t: 'text'; s: string } | { t: 'fact' | 'claim' | 'quote'; s: string; a: string }

const manualQuotes = computed(() => factsOf(props.paper.id).filter((f) => f.source.kind === 'manual' && f.quote).map((f) => ({ q: f.quote!, a: f.source.anchor })))
const paragraphs = computed(() =>
  props.paper.paragraphs.map((para) => {
    const out: Seg[] = []
    let last = 0
    for (const m of para.matchAll(TOKEN)) {
      const i = m.index ?? 0
      if (i > last) out.push({ t: 'text', s: para.slice(last, i) })
      const key = m[1]!
      if (key.startsWith('@')) out.push({ t: 'claim', s: m[2]!, a: `${props.paper.id}:claim:${key.slice(1)}` })
      else {
        const [row, param] = key.split('.')
        out.push({ t: 'fact', s: m[2]!, a: anchorOf(props.paper.id, 't', row!, param!) })
      }
      last = i + m[0].length
    }
    if (last < para.length) out.push({ t: 'text', s: para.slice(last) })
    for (const { q, a } of manualQuotes.value) {
      const i = out.findIndex((x) => x.t === 'text' && x.s.includes(q))
      if (i < 0) continue
      const seg = out[i] as { t: 'text'; s: string }
      const at = seg.s.indexOf(q)
      const parts: Seg[] = []
      if (at > 0) parts.push({ t: 'text', s: seg.s.slice(0, at) })
      parts.push({ t: 'quote', s: q, a })
      if (at + q.length < seg.s.length) parts.push({ t: 'text', s: seg.s.slice(at + q.length) })
      out.splice(i, 1, ...parts)
    }
    return out
  }),
)

const keys = computed(() => (props.paper.collection === 'solar' ? ['voc', 'jsc', 'ff', 'pce'] : ['chunk', 'r5', 'r10', 'mrr']))
const columns = computed(() =>
  keys.value.map((k) => ({
    key: k,
    label: paramOf(props.paper.collection, k).label,
    unit: unitText(props.paper.rows[0]?.values[k] ?? ''),
  })),
)
const cell = (rowId: string, key: string) => anchorOf(props.paper.id, 'c', rowId, key)
const legendX = (i: number) => {
  const list = curves.value
  let x = W - 24
  for (let k = list.length - 1; k > i; k--) x -= 40 + list[k]!.label.length * 6
  return x - (list[i]!.label.length * 6 + 2)
}

const W = 520
const H = 190
const tones = ['#0b0b0c', '#6e6e73', '#9a9aa0', '#b8b8bd']
const dashes = ['', '', '5 3', '2 3']

const solarScale = computed(() => {
  if (props.paper.collection !== 'solar') return null
  const P = (k: string) => paramOf('solar', k)
  const list = props.paper.rows.map((r, i) => ({
    label: r.label,
    voc: parseRaw(r.values.voc ?? '', P('voc')) ?? 1,
    jsc: parseRaw(r.values.jsc ?? '', P('jsc')) ?? 20,
    i,
  }))
  const vmax = Math.max(...list.map((c) => c.voc)) * 1.06
  const jmax = Math.max(...list.map((c) => c.jsc)) * 1.1
  return {
    list,
    x: (v: number) => 44 + (v / vmax) * (W - 64),
    y: (j: number) => H - 28 - (j / jmax) * (H - 48),
  }
})
const curves = computed(() => {
  const sc = solarScale.value
  if (!sc) return []
  const { x, y } = sc
  return sc.list.map((c) => {
    const pts: string[] = []
    for (let n = 0; n <= 48; n++) {
      const v = (c.voc * n) / 48
      const j = c.jsc * (1 - Math.exp((v - c.voc) / 0.045))
      pts.push(`${x(v).toFixed(1)},${y(j).toFixed(1)}`)
    }
    return { ...c, d: 'M' + pts.join(' L'), ex: x(c.voc), ey: y(0), tone: tones[c.i % 4]!, dash: dashes[c.i % 4]! }
  })
})
const figFacts = computed(() => factsOf(props.paper.id).filter((f) => f.source.kind === 'figure'))
const bars = computed(() => {
  if (props.paper.collection !== 'rag') return []
  const P = paramOf('rag', 'r5')
  const vals = props.paper.rows.map((r) => ({ id: r.id, label: r.label, v: parseRaw(r.values.r5 ?? '', P) ?? 0 }))
  const slot = (W - 64) / vals.length
  return vals.map((b, i) => {
    const h = b.v * (H - 56)
    const marked = figFacts.value.some((f) => f.row === b.id)
    return { ...b, marked, x: 44 + i * slot + slot * 0.25, w: slot * 0.5, y: H - 28 - h, h, txt: b.v.toFixed(2).replace('.', ',') }
  })
})
const editedAt = computed(() => new Map(factsOf(props.paper.id).filter((f) => f.edited != null).map((f) => [f.id, display(f)])))
const marks = computed(() =>
  figFacts.value.flatMap((f) => {
    const v = f.base
    if (v == null) return []
    const ed = editedAt.value.has(f.id)
    const rej = f.status === 'rejected'
    const sc = solarScale.value
    if (sc) {
      const t = `${labelOf(f)} ${f.raw}`
      if (f.param === 'voc') return [{ id: f.id, rej, cx: sc.x(v), cy: sc.y(0), lx: sc.x(v) + 2, ly: sc.y(0) - 24, anchor: 'end', t, ed }]
      return [{ id: f.id, rej, cx: sc.x(0), cy: sc.y(v), lx: sc.x(0) + 9, ly: sc.y(v) - 8, anchor: 'start', t, ed }]
    }
    const b = bars.value.find((x) => x.id === f.row)
    if (!b) return []
    const cy = H - 28 - v * (H - 56)
    return [{ id: f.id, rej, cx: b.x + b.w / 2, cy, lx: b.x + b.w / 2, ly: cy - 9, anchor: 'middle', t: f.raw, ed }]
  }),
)

const seeHint = () => hideHint('pdf')

const ui = useViewState('pdf', () => ({ scale: 0 }))
const manual = toRef(ui, 'scale')
const MIN = 0.7
const MAX = 1.8
const SHEET = 700
const PAD = 2 * 24
const gw = ref(0)
const fitScale = computed(() => (gw.value ? Math.min(1.5, Math.max(0.8, Math.round(((gw.value - PAD) / SHEET) * 100) / 100)) : 1))
const scale = computed(() => (state.mobile ? 1 : manual.value || fitScale.value))
const auto = computed(() => !manual.value)
const pct = computed(() => Math.round(scale.value * 100))
const canIn = computed(() => scale.value < MAX - 0.001)
const canOut = computed(() => scale.value > MIN + 0.001)
const zoom = (d: number) => (manual.value = Math.min(MAX, Math.max(MIN, Math.round((scale.value + d) * 10) / 10)))
const fit = () => (manual.value = 0)
let ro: ResizeObserver | null = null
const tblEl = ref<HTMLElement | null>(null)
const moreX = ref(false)
const syncTbl = () => {
  const t = tblEl.value
  moreX.value = !!t && t.scrollLeft + t.clientWidth < t.scrollWidth - 3
}

const scroller = ref<HTMLElement | null>(null)
useScrollMemory(scroller, 'pdf-page')
let cur: string | null = null
const anchorFrom = (e: Event) => (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-anchor]')?.dataset.anchor ?? null
function setCur(a: string | null) {
  if (a === cur) return
  cur = a
  state.hot = a ? [a] : []
  emit('hover', a && factOf(a) ? a : null)
}
const onOver = (e: MouseEvent) => !state.mobile && setCur(anchorFrom(e))
function onClick(e: MouseEvent) {
  if (window.getSelection()?.toString().trim()) return
  const a = anchorFrom(e)
  if (!a) return
  if (factOf(a)) emit('pick', a)
  else emit('claim', a)
}

const cls = (a: string) => ({
  'is-hot': props.hot.includes(a),
  'is-sel': props.selectedAnchor === a,
  'is-issue': props.issueAnchors.has(a),
  'is-edited': editedAt.value.has(a),
})
const editTip = (a: string) => (editedAt.value.has(a) ? `Исправлено: ${editedAt.value.get(a)} · в статье остаётся как напечатано` : undefined)

const sheetEl = ref<HTMLElement | null>(null)
const adding = ref<{ text: string; rect: { top: number; left: number; bottom: number; right: number }; guess: Guess } | null>(null)
const elOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement ?? null)

function readSelection() {
  const s = window.getSelection()
  const art = sheetEl.value
  if (!s || s.isCollapsed || !s.rangeCount || !art || !art.offsetParent) return null
  const range = s.getRangeAt(0)
  if (!art.contains(range.commonAncestorContainer)) return null
  const text = s.toString().replace(/\s+/g, ' ').trim()
  if (!text || text.length > 300) return null
  const start = elOf(range.startContainer)
  const tok = start?.closest<HTMLElement>('[data-anchor]')?.dataset.anchor
  const cell = tok && /:[ct]:/.test(tok) ? tok : null
  const para = start?.closest('p')
  let before = ''
  let after = ''
  if (para) {
    const b = document.createRange()
    b.setStart(para, 0)
    b.setEnd(range.startContainer, range.startOffset)
    before = b.toString()
    const a = document.createRange()
    a.setStart(range.endContainer, range.endOffset)
    a.setEnd(para, para.childNodes.length)
    after = a.toString()
  }
  const r = range.getBoundingClientRect()
  const rowLabelText = start?.closest('tr')?.querySelector('td.l')?.textContent?.trim()
  return {
    text,
    rect: { top: r.top, left: r.left, bottom: r.bottom, right: r.right },
    guess: guessFact(props.paper, text, { cell, rowLabelText, before, after }),
  }
}
const onUp = () => {
  if (state.mobile) return
  setTimeout(() => {
    const r = readSelection()
    if (r) {
      adding.value = r
      seeHint()
    }
  })
}
let selTimer: number | undefined
function onSelChange() {
  if (!state.mobile) return
  clearTimeout(selTimer)
  selTimer = window.setTimeout(() => {
    if ((document.activeElement as HTMLElement | null)?.closest?.('.add, .us__sheet, .us__pop')) return
    const r = readSelection()
    if (r) {
      const fresh = !adding.value
      seeHint()
      adding.value = r
      if (fresh) void nextTick(() => scroller.value?.scrollBy({ top: Math.max(0, r.rect.bottom - (window.innerHeight - 380)) }))
    } else if (adding.value) adding.value = null
  }, 350)
}
const onGutterScroll = () => {
  if (adding.value && !state.mobile) adding.value = null
}
const added = (id: string) => {
  window.getSelection()?.removeAllRanges()
  if (!state.mobile) emit('pick', id)
}
onMounted(() => {
  document.addEventListener('selectionchange', onSelChange)
  if (scroller.value) {
    ro = new ResizeObserver(() => {
      gw.value = scroller.value?.clientWidth ?? 0
      syncTbl()
    })
    ro.observe(scroller.value)
  }
  void nextTick(syncTbl)
  setTimeout(syncTbl, 400)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelChange)
  clearTimeout(selTimer)
  ro?.disconnect()
})

function reveal() {
  const a = props.selectedAnchor
  if (!a) return
  const el = scroller.value?.querySelector(`[data-anchor="${a}"]`)
  const sc = scroller.value
  if (el && sc) {
    const c = sc.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const onScreen = r.top >= c.top + 24 && r.bottom <= c.bottom - 24
    if (!onScreen) scrollWithin(sc, el, 'center')
  } else scrollWithin(sc, el, 'center')
  const box = el?.closest<HTMLElement>('.tbl__scroll')
  if (el && box && box.scrollWidth > box.clientWidth + 2) {
    const stick = box.querySelector<HTMLElement>('td.l')?.offsetWidth ?? 0
    const c = box.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const free = c.width - stick
    const want = r.left - c.left - stick - Math.max(12, (free - r.width) / 2)
    box.scrollTo({ left: Math.max(0, box.scrollLeft + want), behavior: 'smooth' })
  }
}
watch(
  () => props.selectedAnchor,
  () => void nextTick(reveal),
)
watch(
  () => props.paper.id,
  () => {
    adding.value = null
    void nextTick(() => scroller.value?.scrollTo({ top: 0 }))
  },
)
function focusParam(param: string) {
  const root = sheetEl.value
  if (!root) return
  const el = keys.value.includes(param) ? root.querySelector('.tbl') : root.querySelector('.cols p')
  scrollWithin(scroller.value, el, 'center')
}
defineExpose({ reveal, focusParam, zoom, fit, auto, pct, canIn, canOut })
</script>

<template>
  <section class="pdf" :class="{ 'pdf--adding': adding && state.mobile }">
    <UiHint v-if="!state.mobile" id="pdf" icon="target" variant="line">Наведите на значение — увидите источник. Выделите текст — добавите факт.</UiHint>

    <div ref="scroller" class="pdf__gutter" @scroll.passive="onGutterScroll">
      <article ref="sheetEl" class="sheet" :style="{ zoom: scale }" @mouseover="onOver" @mouseleave="setCur(null)" @mouseup="onUp" @click="onClick">
        <header class="run">
          <i>{{ paper.journal }}</i>
          <span class="num">{{ paper.page }}</span>
        </header>

        <h2 class="sec">{{ paper.section }}</h2>

        <div class="cols">
          <p v-for="(segs, pi) in paragraphs" :key="pi">
            <template v-for="(s, si) in segs" :key="si">
              <template v-if="s.t === 'text'">{{ s.s }}</template>
              <span v-else :id="s.a" :data-anchor="s.a" class="tok" :class="[cls(s.a), s.t === 'claim' ? 'tok--claim' : '', s.t === 'quote' ? 'tok--quote' : '']" :data-tip="editTip(s.a)">{{ s.s }}</span>
            </template>
          </p>
        </div>

        <figure class="tbl">
          <figcaption><b>Таблица {{ paper.tableNo }}.</b> {{ paper.caption }}</figcaption>
          <div class="tbl__wrap" :class="{ 'has-more': moreX }"><div ref="tblEl" class="tbl__scroll" @scroll.passive="syncTbl">
          <table>
            <thead>
              <tr>
                <th class="l">{{ sampleWords(paper.collection).cap }}</th>
                <th v-for="c in columns" :key="c.key">
                  {{ c.label }}<template v-if="c.unit">, {{ c.unit }}</template>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in paper.rows" :key="r.id">
                <td class="l">{{ r.label }}</td>
                <td
                  v-for="c in columns"
                  :id="cell(r.id, c.key)"
                  :key="c.key"
                  :data-anchor="cell(r.id, c.key)"
                  class="num tok"
                  :class="cls(cell(r.id, c.key))"
                  :data-tip="editTip(cell(r.id, c.key))"
                >{{ cellText(r.values[c.key] ?? '') }}</td>
              </tr>
            </tbody>
          </table>
          </div></div>
        </figure>

        <figure class="fig">
          <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="paper.figure">
            <line x1="44" :x2="W - 20" :y1="H - 28" :y2="H - 28" class="ax" />
            <line x1="44" x2="44" y1="14" :y2="H - 28" class="ax" />
            <template v-if="curves.length">
              <g v-for="c in curves" :key="c.label">
                <path :d="c.d" fill="none" :stroke="c.tone" stroke-width="1.4" :stroke-dasharray="c.dash" />
              </g>
              <g v-for="(c, i) in curves" :key="'lg' + c.label" class="lg">
                <line :x1="legendX(i) - 22" :x2="legendX(i) - 6" :y1="12" :y2="12" :stroke="c.tone" stroke-width="1.6" :stroke-dasharray="c.dash" />
                <text :x="legendX(i)" y="15.5" class="lb">{{ c.label }}</text>
              </g>
              <text :x="W - 20" :y="H - 10" text-anchor="end" class="lb">V, В</text>
              <text x="8" y="10" class="lb">J, мА/см²</text>
            </template>
            <template v-else>
              <g v-for="b in bars" :key="b.label">
                <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" fill="#6e6e73" />
                <text v-if="!b.marked" :x="b.x + b.w / 2" :y="b.y - 5" text-anchor="middle" class="lb">{{ b.txt }}</text>
                <text :x="b.x + b.w / 2" :y="H - 12" text-anchor="middle" class="lb">{{ b.label }}</text>
              </g>
              <text x="8" y="10" class="lb">Recall@5</text>
            </template>
            <g v-for="m in marks" :id="m.id" :key="m.id" :data-anchor="m.id" class="mk" :class="[cls(m.id), { 'is-rej': m.rej }]">
              <title v-if="m.ed">{{ editTip(m.id) }}</title>
              <circle class="mk__hit" :cx="m.cx" :cy="m.cy" r="12" />
              <circle class="mk__dot" :cx="m.cx" :cy="m.cy" r="4" />
              <text :x="m.lx" :y="m.ly" :text-anchor="m.anchor" class="lb mk__lb">{{ m.t }}</text>
              <path v-if="m.ed" class="mk__ed" :transform="`translate(${m.cx + 6} ${m.cy + 4})`" d="M0 7 L0.8 4.4 L5 0.2 L6.8 2 L2.6 6.2 Z" />
            </g>
          </svg>
          <figcaption>{{ paper.figure }}</figcaption>
        </figure>
      </article>
    </div>

    <AddFact v-if="adding" :paper="paper" :text="adding.text" :rect="adding.rect" :guess="adding.guess" @close="adding = null" @added="added" />
  </section>
</template>

<style scoped>
.pdf { height: 100%; min-height: 0; display: flex; flex-direction: column; background: #ececee; }
.pdf__bar {
  flex: none; height: 44px; padding: 0 var(--s4) 0 var(--s5); display: flex; align-items: center; gap: var(--s5);
  font-size: var(--fs-sm); color: var(--muted); background: var(--bg); border-bottom: 1px solid var(--line);
}
.pdf__hint {
  flex: none; display: flex; align-items: center; gap: var(--s2); min-height: 40px; padding: 4px var(--s2) 4px var(--s5);
  font-size: var(--fs-sm); color: var(--ink-2); background: var(--bg-2); border-bottom: 1px solid var(--line);
}
.pdf__hint span { flex: 1; min-width: 0; color: var(--ink-2); }
.pdf__hint .ico { color: var(--blue); }
.pdf__gutter { flex: 1; min-height: 0; overflow: auto; padding: var(--s6) var(--s5) 80px; }
.pdf--adding .pdf__gutter { padding-bottom: calc(360px + var(--safe-b)) !important; }

.sheet {
  --pen: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 9 9'><path d='M0 9 L1 5.6 L6.4 0.2 L8.8 2.6 L3.4 8 Z'/></svg>");
  container-type: inline-size;
  width: 100%; max-width: 700px; margin: 0 auto; padding: 32px 44px 44px;
  background: #fbfbfa; color: #1a1a1a; font-family: var(--serif); font-size: 13.5px; line-height: 1.62;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 10px 30px -14px rgb(0 0 0 / 0.2);
}
.run {
  display: flex; justify-content: space-between; padding-bottom: 8px; margin-bottom: 26px;
  border-bottom: 1px solid rgb(11 11 12 / 0.16); font-size: var(--fs-xs); color: #6e6e73;
}
.sec { font: 700 15px/1.3 var(--serif); margin-bottom: 14px; }
.cols { column-count: 2; column-gap: 30px; }
.cols p { margin: 0 0 0.7em; text-align: left; hyphens: auto; text-wrap: pretty; }
@container (max-width: 560px) { .cols { column-count: 1; } }

.tok { cursor: pointer; border-radius: var(--r-xs); transition: background-color 120ms ease, box-shadow 120ms ease; text-decoration: underline dotted rgb(11 11 12 / 0.28); text-underline-offset: 3px; }
.tok--claim { text-decoration-color: rgb(11 11 12 / 0.18); }
.tok.is-issue { text-decoration: underline dotted var(--amber); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
.tok--quote { text-decoration-style: solid; background: rgb(11 11 12 / 0.05); }
.tok.is-hot { background: var(--blue-soft); }
.tok.is-sel { background: var(--blue-soft); text-decoration: none; box-shadow: inset 0 -2px 0 var(--blue); }
.tok.is-edited::after {
  content: ''; display: inline-block; width: 9px; height: 9px; margin-left: 2px; vertical-align: 0.45em; background: #8a8a90;
  -webkit-mask: var(--pen) center / contain no-repeat; mask: var(--pen) center / contain no-repeat;
}
td.tok { position: relative; }
td.tok.is-edited::after { position: absolute; left: 6px; top: 50%; margin: -4px 0 0; vertical-align: 0; }

.tbl { margin: 22px 0 18px; }
.tbl figcaption, .fig figcaption { font-size: var(--fs-xs); margin-bottom: 8px; color: #3a3a3d; }
.fig figcaption { margin: 6px 0 0; text-align: center; }
table { width: 100%; border-collapse: collapse; border-top: 1.2px solid #1a1a1a; border-bottom: 1.2px solid #1a1a1a; font-size: 12.5px; }
thead tr { border-bottom: 0.8px solid #1a1a1a; }
th { font-weight: 400; font-style: italic; padding: 5px 8px; text-align: right; }
td { padding: 4px 8px; text-align: right; }
th.l, td.l { text-align: left; }

.fig { margin-top: 20px; }
.fig svg { width: 100%; height: auto; }
.ax { stroke: rgb(11 11 12 / 0.4); stroke-width: 1; }
.lb { font: italic 12px var(--serif); fill: #6e6e73; }
.mk { cursor: pointer; }
.mk__hit { fill: transparent; }
.mk__dot { fill: #fbfbfa; stroke: #1a1a1a; stroke-width: 1.5; transition: fill 120ms ease, stroke 120ms ease; }
.mk__lb { font-style: normal; font-weight: 600; fill: #1a1a1a; paint-order: stroke; stroke: #fbfbfa; stroke-width: 3px; stroke-linejoin: round; }
.mk.is-hot .mk__dot { fill: var(--blue-soft); stroke: var(--blue); }
.mk.is-sel .mk__dot { fill: var(--blue); stroke: var(--blue); }
.mk.is-hot .mk__lb, .mk.is-sel .mk__lb { fill: var(--blue-2); }
.mk.is-issue .mk__dot { stroke: var(--amber); }
.mk.is-rej { opacity: 0.35; }
.mk__ed { fill: #8a8a90; }

@media (max-width: 768px) {
  .pdf { background: var(--bg); }
  .pdf__bar { height: 44px; padding: 0 var(--s4); font-size: var(--fs-sm); }
    .pdf__gutter { padding: 0 0 calc(88px + var(--safe-b)); background: #ececee; -webkit-tap-highlight-color: transparent; }
  .sheet { zoom: 1 !important; max-width: none; min-height: 100%; padding: 20px 16px 32px; font-size: 15px; line-height: 1.6; box-shadow: none; }
  .run { margin-bottom: 18px; }
  .sec { font-size: 17px; }
  .cols p { hyphens: manual; }
  .tok { padding: 1px 0; }
  .tbl__wrap { position: relative; }
  .tbl__wrap::after {
    content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 28px; pointer-events: none; opacity: 0; transition: opacity var(--t) ease;
    background: linear-gradient(to right, transparent, rgb(11 11 12 / 0.16));
  }
  .tbl__wrap.has-more::after { opacity: 1; }
  .tbl__scroll { padding-right: 12px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .tbl__scroll::-webkit-scrollbar { display: none; }
  table { min-width: 420px; font-size: var(--fs-body); }
  th, td { padding: 10px 8px; white-space: nowrap; }
  th.l, td.l { position: sticky; left: 0; z-index: 1; width: 76px; max-width: 76px; overflow: hidden; text-overflow: ellipsis; background: #fbfbfa; box-shadow: 1px 0 0 rgb(11 11 12 / 0.1); }
  th { font-size: var(--fs-sm); }
  .fig svg { width: 100%; height: auto; }
  .lb { font-size: 14px; }
  .mk__lb { font-size: 14px; }
  .mk__hit { r: 30px; }
}
</style>
