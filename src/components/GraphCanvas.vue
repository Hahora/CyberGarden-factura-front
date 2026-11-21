<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import UiSpinner from './UiSpinner.vue'
import UiSkeleton from './UiSkeleton.vue'
import { useViewState } from '../viewState'
import { buildGraph, defaultRoot, layoutForce, layoutRings, layoutYears, nearGraph, neighborsOf, type Pos, type YearRing } from '../graph'
import { paperColor } from '../colors'
import type { CollectionId } from '../data'

const props = withDefaults(defineProps<{
  collection: CollectionId
  root?: string | null
  mode?: 'rings' | 'force'
  compact?: boolean
  height?: string
  selected?: string | null
  matches?: Set<string> | null
  yearMin?: number
  stateKey?: string
  legend?: boolean
  pan?: boolean
}>(), { legend: false, mode: 'rings', compact: false, height: '100%', root: null, selected: null, matches: null, yearMin: 0 })
const emit = defineEmits<{ select: [id: string | null]; expand: []; ready: [] }>()

const full = computed(() => buildGraph(props.collection))
const rootId = computed(() => (props.root && full.value.byId.has(props.root) ? props.root : defaultRoot(full.value)))
const g = computed(() => {
  let x = full.value
  if (props.compact && rootId.value) x = nearGraph(x, rootId.value)
  if (props.yearMin) {
    const ok = new Set(x.nodes.filter((n) => n.id === rootId.value || n.year == null || n.year >= props.yearMin).map((n) => n.id))
    const nodes = x.nodes.filter((n) => ok.has(n.id))
    x = { nodes, edges: x.edges.filter((e) => ok.has(e.source) && ok.has(e.target)), byId: new Map(nodes.map((n) => [n.id, n])) }
  }
  return x
})
const sig = () => [props.collection, props.root, props.mode, props.compact, props.yearMin].join('|')
const fresh = () => ({ sig: '', pos: {} as Pos, view: { x: 0, y: 0, k: 1 }, sel: null as string | null, rings: [] as YearRing[] })
const st = props.stateKey ? useViewState('graph:' + props.stateKey, fresh) : reactive(fresh())
const restored = st.sig === sig() && g.value.nodes.length > 0 && g.value.nodes.every((n) => st.pos[n.id])
const pos = st.pos
const ready = ref(restored)
watch(ready, (v) => v && emit('ready'))
onMounted(() => restored && emit('ready'))
const curSel = computed(() => props.selected ?? (props.stateKey ? st.sel : null))
let stretched = false
let touched = false
function relayout() {
  stretched = false
  touched = false
  st.sig = sig()
  let l: Pos
  let rings: YearRing[] = []
  if (rootId.value && props.mode === 'rings' && !props.compact) ({ pos: l, rings } = layoutYears(g.value, rootId.value))
  else if (rootId.value && props.mode === 'rings') l = layoutRings(g.value, rootId.value)
  else l = layoutForce(g.value, rootId.value)
  st.rings = rings
  for (const k of Object.keys(pos)) delete pos[k]
  Object.assign(pos, l)
  void nextTick(fit)
}
watch(() => [props.collection, props.root, props.mode, props.compact, props.yearMin], relayout)
watch(() => g.value.nodes.length, relayout)

const el = ref<HTMLElement>()
const size = reactive({ w: 0, h: 0 })
const view = st.view
let ro: ResizeObserver | undefined
onMounted(() => {
  if (restored) st.sig = sig()
  else requestAnimationFrame(() => relayout())
  window.setTimeout(() => (ready.value = true), 1500)
  if (!el.value) return
  ro = new ResizeObserver(() => {
    const first = !size.w
    size.w = el.value!.clientWidth
    size.h = el.value!.clientHeight
    if (first && !restored) fit()
    else if (!first && !touched && st.sig === sig()) requestAnimationFrame(fit)
  })
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())

const short = (t: string, n = 24) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
function fit() {
  const ids = g.value.nodes.map((n) => n.id).filter((id) => pos[id])
  if (!ids.length) { ready.value = true; return }
  if (!size.w) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of ids) {
    const p = pos[id]!
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  }
  if (st.rings.length) y0 = Math.min(y0, -Math.max(...st.rings.map((q) => q.r)) - 26)
  const inL = 16, inR = 16 + (props.compact ? 0 : 48), inT = 16 + (props.compact ? 44 : 0), inB = 16
  const aw = Math.max(60, size.w - inL - inR), ah = Math.max(60, size.h - inT - inB)
  if (props.compact && !stretched && x1 - x0 > 1 && y1 - y0 > 1) {
    const f = Math.min(3, Math.max(1, aw / ah / ((x1 - x0) / (y1 - y0))))
    if (f > 1.05) {
      const mx = (x0 + x1) / 2
      for (const id of ids) pos[id]!.x = mx + (pos[id]!.x - mx) * f
      x0 = mx + (x0 - mx) * f; x1 = mx + (x1 - mx) * f
    }
    stretched = true
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  let k = Math.min(aw / Math.max(80, x1 - x0), ah / Math.max(80, y1 - y0), 1.5)
  const labelled = g.value.nodes.filter((n) => n.kind === 'paper' || n.id === rootId.value)
  for (let i = 0; i < 16; i++) {
    view.k = k
    view.x = inL + aw / 2 - cx * k
    view.y = inT + ah / 2 - cy * k
    const ok = labelled.every((n) => {
      const p = pos[n.id]
      if (!p) return true
      const sx = p.x * k + view.x, sy = p.y * k + view.y
      const half = Math.max(n.r * k, (short(n.label).length * 12 * 0.56) / 2)
      return sx - half >= inL - 8 && sx + half <= size.w - inR + 8 && sy - n.r * k - 20 >= inT - 8 && sy + n.r * k + 22 <= size.h - inB + 8
    })
    if (ok) break
    k *= 0.93
  }
  ready.value = true
}
function zoomAt(f: number, cx = size.w / 2, cy = size.h / 2) {
  touched = true
  const k = Math.min(4, Math.max(0.2, view.k * f))
  const r = k / view.k
  view.x = cx - (cx - view.x) * r
  view.y = cy - (cy - view.y) * r
  view.k = k
}
function centerOn(id: string) {
  const p = pos[id]
  if (!p || !size.w) return
  view.x = size.w / 2 - p.x * view.k
  view.y = size.h / 2 - p.y * view.k
}
function fitNow() { touched = false; fit() }
defineExpose({ fit, zoomBy: (f: number) => zoomAt(f), centerOn })
watch(curSel, (id) => {
  const p = id ? pos[id] : null
  if (!p || !size.w) return
  const sx = p.x * view.k + view.x, sy = p.y * view.k + view.y
  if (sx < 30 || sy < 30 || sx > size.w - 30 || sy > size.h - 30) centerOn(id!)
})

function onWheel(e: WheelEvent) {
  const r = el.value!.getBoundingClientRect()
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}

const ptrs = new Map<number, { x: number; y: number }>()
let drag: { id: string | null; moved: boolean; sx: number; sy: number } | null = null
let pinch = 0
const idAt = (t: EventTarget | null) => (t as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? null

function down(e: PointerEvent) {
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  tip.id = null
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (drag) drag.moved = true
  } else drag = { id: idAt(e.target), moved: false, sx: e.clientX, sy: e.clientY }
}
function move(e: PointerEvent) {
  const prev = ptrs.get(e.pointerId)
  if (!prev) return hover(e)
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    const r = el.value!.getBoundingClientRect()
    if (pinch) zoomAt(d / pinch, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top)
    pinch = d
    view.x += dx / 2; view.y += dy / 2
    return
  }
  if (!drag) return
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true
  if (!drag.moved) return
  touched = true
  if (drag.id && pos[drag.id]) {
    pos[drag.id]!.x += dx / view.k
    pos[drag.id]!.y += dy / view.k
  } else {
    view.x += dx; view.y += dy
  }
}
function up(e: PointerEvent) {
  ptrs.delete(e.pointerId)
  if (ptrs.size === 0 && drag) {
    if (!drag.moved) { if (props.stateKey) st.sel = drag.id; emit('select', drag.id) }
    drag = null
    pinch = 0
  } else if (ptrs.size < 2) pinch = 0
}

const tip = reactive({ id: null as string | null, x: 0, y: 0 })
function hover(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return
  const id = idAt(e.target)
  tip.id = id
  if (id) {
    const r = el.value!.getBoundingClientRect()
    tip.x = e.clientX - r.left
    tip.y = e.clientY - r.top
  }
}
const tipText = computed(() => (tip.id ? g.value.byId.get(tip.id)?.full ?? '' : ''))

const active = computed(() => tip.id ?? curSel.value ?? null)
const near = computed(() => (active.value ? neighborsOf(g.value, active.value) : null))
const citers = computed(() => new Set(g.value.edges.filter((e) => e.target === rootId.value && e.type === 'cites').map((e) => e.source)))
const isHot = (e: { source: string; target: string }) => !!active.value && (e.source === active.value || e.target === active.value)
const dimmed = (id: string) => {
  if (props.matches) return !props.matches.has(id)
  if (!active.value) return false
  return id !== active.value && !near.value!.has(id)
}
const edgeDim = (e: { source: string; target: string }) => (props.matches ? !(props.matches.has(e.source) && props.matches.has(e.target)) : !!active.value && !isHot(e))
const labels = computed(() => {
  const out = new Map<string, { dx: number; above: boolean }>()
  const k = view.k
  const fsPx = Math.min(40, 12 / k) * k
  const strong = new Set([active.value, curSel.value, rootId.value].filter((x): x is string => !!x))
  const rank = (n: { id: string; kind: string; r: number }) =>
    strong.has(n.id) ? 0 : props.matches?.has(n.id) ? 1 : n.kind === 'paper' ? 2 : n.kind === 'entity' ? 3 : 4
  const list = g.value.nodes
    .filter((n) => pos[n.id] && (n.kind !== 'ext' || strong.has(n.id) || !!near.value?.has(n.id) || !!props.matches?.has(n.id)))
    .sort((a, b) => rank(a) - rank(b) || b.r - a.r)
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const discs = g.value.nodes.filter((n) => pos[n.id]).map((n) => ({ id: n.id, x: pos[n.id]!.x * k + view.x, y: pos[n.id]!.y * k + view.y, r: n.r * k + 2 }))
  const hitsDisc = (r: { x0: number; x1: number; y0: number; y1: number }, own: string) =>
    discs.some((d) => d.id !== own && r.x0 < d.x + d.r && r.x1 > d.x - d.r && r.y0 < d.y + d.r && r.y1 > d.y - d.r)
  const clash = (r: { x0: number; x1: number; y0: number; y1: number }) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)
  for (const n of list) {
    const p = pos[n.id]!
    const half = (short(n.label).length * fsPx * 0.56) / 2
    const cx = p.x * k + view.x
    const cy = p.y * k + view.y
    let dx = 0
    if (size.w) {
      if (cx - half < 6) dx = 6 - (cx - half)
      else if (cx + half > size.w - 6) dx = size.w - 6 - (cx + half)
    }
    const below = cy + (n.r + 4) * k + fsPx
    const above = cy - (n.r + 4) * k
    const box = (base: number) => ({ x0: cx + dx - half - 2, x1: cx + dx + half + 2, y0: base - fsPx, y1: base + 3 })
    const rb = box(below)
    const ra = box(above)
    const roomBelow = !size.h || rb.y1 <= size.h - 2
    const roomAbove = !size.h || ra.y0 >= 2
    const freeB = roomBelow && !hitsDisc(rb, n.id) && !clash(rb)
    const freeA = roomAbove && !hitsDisc(ra, n.id) && !clash(ra)
    let useAbove = false
    let r = rb
    if (!freeB) {
      if (freeA) { useAbove = true; r = ra }
      else if (n.kind === 'paper' || rank(n) === 0) {
        useAbove = !roomBelow || (roomAbove && clash(rb) && !clash(ra))
        r = useAbove ? ra : rb
      } else continue
    }
    placed.push(r)
    out.set(n.id, { dx: dx / k, above: useAbove })
  }
  return out
})

const lab = computed(() => Math.min(40, 12 / view.k))
const citeEdges = computed(() => g.value.edges.filter((x) => x.type === 'cites'))
function arrow(e: { source: string; target: string }): string {
  const a = pos[e.source], b = pos[e.target], t = g.value.byId.get(e.target)
  if (!a || !b || !t) return ''
  const dx = b.x - a.x, dy = b.y - a.y
  const d = Math.hypot(dx, dy)
  if (d < 1) return ''
  const ux = dx / d, uy = dy / d
  const k = Math.max(view.k, 0.3)
  const len = 6 / k, w = 2.6 / k
  const tx = b.x - ux * (t.r + 2 / k), ty = b.y - uy * (t.r + 2 / k)
  const bx = tx - ux * len, by = ty - uy * len
  return `M${tx} ${ty}L${bx - uy * w} ${by + ux * w}L${bx + uy * w} ${by - ux * w}Z`
}
const gridStyle = computed(() => ({
  backgroundSize: `${22 * view.k}px ${22 * view.k}px`,
  backgroundPosition: `${view.x}px ${view.y}px`,
}))
</script>

<template>
  <div class="gc" :class="{ 'is-compact': compact, 'is-pan': pan }" :style="{ height }">
   <div ref="el" class="gc__stage">
    <div class="gc__grid" :style="gridStyle" aria-hidden="true" />
    <svg
      class="gc__svg" role="img" aria-label="Граф связей: статьи, ссылки, материалы и методы"
      @wheel.prevent="onWheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @pointerleave="tip.id = null"
    >
      <g :transform="`translate(${view.x} ${view.y}) scale(${view.k})`">
        <g v-if="st.rings.length" class="gc__rings" aria-hidden="true">
          <template v-for="rg in st.rings" :key="rg.label">
            <circle class="gc__yr" :r="rg.r" vector-effect="non-scaling-stroke" />
            <text class="gc__yl" x="0" :y="-rg.r - 5 / view.k" text-anchor="middle" :style="{ fontSize: lab + 'px' }">{{ rg.label }}</text>
          </template>
        </g>
        <g>
          <line
            v-for="(e, i) in g.edges" :key="i" class="gc__edge"
            :class="{ 'is-hot': isHot(e), 'is-dim': edgeDim(e), 'is-uses': e.type === 'uses' }"
            :x1="pos[e.source]?.x ?? 0" :y1="pos[e.source]?.y ?? 0" :x2="pos[e.target]?.x ?? 0" :y2="pos[e.target]?.y ?? 0"
            :stroke-width="(isHot(e) ? 1.8 : 1) / Math.max(view.k, 0.6)"
          />
        </g>
        <g>
          <path v-for="(e, i) in citeEdges" :key="'a' + i" class="gc__arr" :class="{ 'is-hot': isHot(e), 'is-dim': edgeDim(e) }" :d="arrow(e)" />
        </g>
        <g
          v-for="n in g.nodes" :key="n.id" class="gc__node" :class="{ 'is-dim': dimmed(n.id), 'is-sel': n.id === curSel }"
          :data-id="n.id" :transform="`translate(${pos[n.id]?.x ?? 0} ${pos[n.id]?.y ?? 0})`"
        >
          <circle v-if="n.id === curSel" class="gc__ring" :r="n.r + 5" />
          <circle
            v-if="n.kind === 'paper'" :r="n.r" class="gc__paper" :class="{ 'is-root': n.id === rootId, 'is-citer': citers.has(n.id) }"
            :style="{ fill: paperColor(n.paperId ?? n.id) }"
          />
          <path v-else-if="n.kind === 'entity'" class="gc__ent" :d="`M0 ${-n.r} L${n.r} 0 L0 ${n.r} L${-n.r} 0 Z`" />
          <circle v-else class="gc__ext" :class="{ 'is-un': n.unparsed }" :r="n.r" />
          <circle class="gc__hit" :r="Math.max(n.r + 6, 16)" />
          <text v-if="labels.has(n.id)" class="gc__label" :class="{ 'is-strong': n.kind !== 'ext' }" :x="labels.get(n.id)!.dx" :y="labels.get(n.id)!.above ? -(n.r + 4) : n.r + 4 + lab" :style="{ fontSize: lab + 'px' }" text-anchor="middle">{{ short(n.label) }}</text>
        </g>
      </g>
    </svg>
    <Transition name="gc-fade">
      <div v-if="!ready" class="gc__load" aria-busy="true">
        <UiSkeleton variant="block" width="100%" height="100%" />
        <span class="gc__loadt"><UiSpinner :size="16" />Строю граф…</span>
      </div>
    </Transition>
    <div v-if="!g.nodes.length && ready" class="gc__empty">В коллекции пока нет разобранных статей</div>

    <div class="gc__tools">
      <button class="icon-btn icon-btn--sm" aria-label="Приблизить" data-tip="Приблизить" @click="zoomAt(1.3)"><Icon name="zoom-in" :size="16" /></button>
      <button class="icon-btn icon-btn--sm" aria-label="Отдалить" data-tip="Отдалить" @click="zoomAt(1 / 1.3)"><Icon name="zoom-out" :size="16" /></button>
      <button class="icon-btn icon-btn--sm" aria-label="Вписать в окно" data-tip="Вписать в окно" @click="fitNow"><Icon name="target" :size="16" /></button>
      <button v-if="compact" class="icon-btn icon-btn--sm" aria-label="На весь экран" data-tip="На весь экран" @click="emit('expand')"><Icon name="arrow-up-right" :size="16" /></button>
    </div>
    <div v-if="tip.id && tipText" class="gc__tip" :style="{ left: Math.min(tip.x + 14, Math.max(8, size.w - 250)) + 'px', top: tip.y + 14 + 'px' }">{{ tipText }}</div>
   </div>
   <p v-if="legend" class="gc__legend" aria-hidden="true">
    <span><i class="gl gl--our" />наши статьи</span><span><i class="gl gl--mat" />материал</span><span><i class="gl gl--ext" />внешняя работа</span><span class="gc__dir">цитирует →</span>
   </p>
  </div>
</template>

<style scoped>
.gc { display: flex; flex-direction: column; overflow: hidden; background: var(--bg); min-height: 200px; user-select: none; -webkit-user-select: none; }
.gc__stage { position: relative; flex: 1; min-height: 0; overflow: hidden; touch-action: none; }
.gc__grid { position: absolute; inset: 0; background-image: radial-gradient(var(--line-2) 1px, transparent 1.2px); pointer-events: none; }
.gc.is-pan .gc__stage, .gc.is-pan .gc__svg { touch-action: pan-y; }
.gc__svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; }
.gc__svg:active { cursor: grabbing; }

.gc__edge { stroke: var(--line-2); fill: none; transition: opacity var(--t); }
.gc__edge.is-uses { stroke-dasharray: 3 3; }
.gc__edge.is-hot { stroke: var(--blue); }
.gc__edge.is-dim { opacity: 0.25; }
.gc__arr { fill: var(--faint); transition: opacity var(--t); }
.gc__arr.is-hot { fill: var(--blue); }
.gc__arr.is-dim { opacity: 0.25; }
.gc__yr { fill: none; stroke: var(--line-2); stroke-width: 1; stroke-dasharray: 2 5; }
.gc__yl { fill: var(--faint); font-family: var(--font); font-weight: 500; paint-order: stroke; stroke: var(--bg); stroke-width: 3px; pointer-events: none; }
.gc__legend { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s3); padding: var(--s2) var(--s3); border-top: 1px solid var(--line); background: var(--bg); font-size: var(--fs-xs); color: var(--muted); }
.gc__legend span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.gl { display: inline-block; width: 8px; height: 8px; box-shadow: inset 0 0 0 1.5px var(--muted); }
.gl--our { border-radius: 50%; background: var(--muted); }
.gl--mat { transform: rotate(45deg); }
.gl--ext { border-radius: 50%; }

.gc__node { cursor: pointer; transition: opacity var(--t); }
.gc__node.is-dim { opacity: 0.28; }
.gc__paper { stroke: var(--bg); stroke-width: 1.5; }
.gc__paper.is-citer { stroke: var(--blue); stroke-width: 2; }
.gc__paper.is-root { stroke: var(--ink); stroke-width: 2.5; }
.gc__ext { fill: var(--bg-3); stroke: var(--faint); stroke-width: 1; }
.gc__ext.is-un { fill: var(--bg); stroke-dasharray: 2 2; }
.gc__ent { fill: var(--card); stroke: var(--ink-2); stroke-width: 1.4; }
.gc__ring { fill: none; stroke: var(--blue); stroke-width: 1.6; }
.gc__hit { fill: transparent; }
.gc__label { font-size: var(--fs-xs); fill: var(--muted); paint-order: stroke; stroke: var(--bg); stroke-width: 5px; stroke-linejoin: round; pointer-events: none; font-family: var(--font); }
.gc__label.is-strong { fill: var(--ink-2); font-weight: 500; }
.gc__node.is-sel .gc__label { fill: var(--ink); }

.gc__tools { position: absolute; top: 8px; right: 8px; z-index: 3; display: flex; flex-direction: column; gap: 2px; padding: 3px; border-radius: var(--r); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.gc__tip { position: absolute; z-index: 5; max-width: 240px; padding: 7px 10px; border-radius: var(--r-sm); font-size: var(--fs-sm); line-height: 1.35; background: var(--solid); color: var(--on-solid); pointer-events: none; }
.gc__empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); font-size: var(--fs-body); }
.is-compact .gc__tools { flex-direction: row; top: 6px; right: 6px; }
.gc__load { position: absolute; inset: 0; z-index: 4; background: var(--bg); }
.gc__load :deep(.sk) { border-radius: 0; height: 100%; }
.gc__loadt { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.gc-fade-leave-active { transition: opacity 200ms var(--ease); }
.gc-fade-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .gc-fade-leave-active { transition: none; } }
</style>
