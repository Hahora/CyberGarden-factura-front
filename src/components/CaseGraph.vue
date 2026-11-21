<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import { paperClass, type LinkEdge, type LinkNode } from '../case/links'

const props = withDefaults(defineProps<{
  nodes: LinkNode[]
  edges: LinkEdge[]
  selected?: string | null
  mode?: 'force' | 'radial'
  focus?: boolean
  controls?: boolean
  titles?: Record<string, string>
  domain?: 'solar' | 'rag'
}>(), { selected: null, mode: 'force', focus: true, controls: true, titles: () => ({}), domain: 'solar' })
const emit = defineEmits<{ select: [id: string | null] }>()

const CLS_COLOR: Record<string, string> = {
  perovskite: 'var(--c1)', kesterite: 'var(--c2)', CIGS: 'var(--c3)', Sb2Se3: 'var(--c4)', CdTe: 'var(--c5)', 'thin-film Si': 'var(--c6)',
}
const colorOf = (n: LinkNode) => (props.domain === 'rag' ? 'var(--ink-2)' : n.pid ? CLS_COLOR[paperClass(n.pid)] ?? 'var(--muted)' : 'var(--muted)')
const SHAPE: Record<string, string> = { paper: 'paper', class: 'class', material: 'material', layer: 'layer', cited: 'cited', dataset: 'class', generator: 'material', embedding: 'layer', retriever: 'cited' }
const shapeOf = (n: LinkNode) => SHAPE[n.kind] ?? 'cited'

type P = { x: number; y: number }
function layoutForce(nodes: LinkNode[], edges: LinkEdge[]): Record<string, P> {
  const pos: Record<string, P & { vx: number; vy: number }> = {}
  const papers = nodes.filter((n) => n.kind === 'paper')
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2
    const r = n.kind === 'paper' ? 220 : 120
    pos[n.id] = { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }
  })
  const len: Record<string, number> = { class: 150, absorber: 80, layer: 130, cited: 42, dataset: 90, generator: 90, embedding: 110, retriever: 110 }
  const str: Record<string, number> = { class: 0.006, absorber: 0.05, layer: 0.01, cited: 0.1, dataset: 0.03, generator: 0.03, embedding: 0.03, retriever: 0.03 }
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  void papers
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 340
    for (let i = 0; i < nodes.length; i++) {
      const a = pos[nodes[i]!.id]!
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos[nodes[j]!.id]!
        let dx = a.x - b.x, dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1 }
        const d = Math.sqrt(d2)
        const f = Math.min(6, 7000 / d2)
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
    }
    for (const e of edges) {
      if (!idx.has(e.from) || !idx.has(e.to)) continue
      const a = pos[e.from]!, b = pos[e.to]!
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - len[e.kind]!) * str[e.kind]!
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    for (const n of nodes) {
      const p = pos[n.id]!
      p.vx -= p.x * 0.003; p.vy -= p.y * 0.003
      p.x += p.vx * 0.5 * cool; p.y += p.vy * 0.5 * cool
      p.vx *= 0.6; p.vy *= 0.6
    }
  }
  return Object.fromEntries(nodes.map((n) => [n.id, { x: pos[n.id]!.x, y: pos[n.id]!.y }]))
}
function layoutRadial(nodes: LinkNode[]): Record<string, P> {
  const out: Record<string, P> = {}
  const [c, ...rest] = nodes
  if (c) out[c.id] = { x: 0, y: 0 }
  const n = rest.length
  rest.forEach((x, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2
    out[x.id] = { x: Math.cos(a) * 190, y: Math.sin(a) * 120 }
  })
  return out
}
const pos = reactive<Record<string, P>>({})
let stretched = false
function relayout() {
  stretched = false
  const l = props.mode === 'radial' ? layoutRadial(props.nodes) : layoutForce(props.nodes, props.edges)
  for (const k of Object.keys(pos)) delete pos[k]
  Object.assign(pos, l)
  void nextTick(fit)
}
const sig = computed(() => props.nodes.map((n) => n.id).join('|') + '#' + props.edges.length + props.mode)
watch(sig, relayout)

const el = ref<HTMLElement>()
const size = reactive({ w: 0, h: 0 })
const view = reactive({ x: 0, y: 0, k: 1 })
let touched = false
function fit() {
  const ids = props.nodes.map((n) => n.id).filter((id) => pos[id])
  if (!ids.length || !size.w || !size.h) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const id of ids) { const p = pos[id]!; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  if (!stretched && props.mode === 'force' && x1 - x0 > 1 && y1 - y0 > 1) {
    const f = Math.min(2.2, Math.max(1, size.w / size.h / ((x1 - x0) / (y1 - y0))))
    if (f > 1.05) { for (const id of ids) pos[id]!.x *= f; x0 *= f; x1 *= f }
    stretched = true
  }
  const padX = 70, padY = 36
  const w = Math.max(60, x1 - x0) + padX * 2, h = Math.max(60, y1 - y0) + padY * 2
  const k = Math.min(size.w / w, size.h / h, props.mode === 'radial' ? 1.3 : 1.6)
  view.k = k
  view.x = size.w / 2 - ((x0 + x1) / 2) * k
  view.y = size.h / 2 - ((y0 + y1) / 2) * k
}
let ro: ResizeObserver | undefined
onMounted(() => {
  relayout()
  if (!el.value) return
  ro = new ResizeObserver(() => {
    size.w = el.value!.clientWidth; size.h = el.value!.clientHeight
    if (!touched) fit()
  })
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
function zoom(f: number, cx = size.w / 2, cy = size.h / 2) {
  touched = true
  const k = Math.min(4, Math.max(0.25, view.k * f)), r = k / view.k
  view.x = cx - (cx - view.x) * r; view.y = cy - (cy - view.y) * r; view.k = k
}
const refit = () => { touched = false; fit() }
function onWheel(e: WheelEvent) {
  if (!props.controls || !(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  const r = el.value!.getBoundingClientRect()
  zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}

const ptrs = new Map<number, P>()
let pinch = 0, moved = 0, downId: string | null = null
const idAt = (t: EventTarget | null) => (t as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? null
function down(e: PointerEvent) {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved = 0
  downId = idAt(e.target)
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y) }
}
function move(e: PointerEvent) {
  const prev = ptrs.get(e.pointerId)
  if (!prev || !props.controls) return
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved += Math.abs(dx) + Math.abs(dy)
  if (moved > 6 && !el.value!.hasPointerCapture(e.pointerId)) el.value!.setPointerCapture(e.pointerId)
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (pinch) { const r = el.value!.getBoundingClientRect(); zoom(d / pinch, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top) }
    pinch = d
  } else if (moved > 6) { touched = true; view.x += dx; view.y += dy }
}
function up(e: PointerEvent) {
  ptrs.delete(e.pointerId)
  pinch = 0
  if (!ptrs.size && moved <= 6) emit('select', downId === props.selected && props.focus ? null : downId)
}

const near = computed(() => {
  const s = props.selected
  if (!s || !props.focus) return null
  const ids = new Set([s])
  for (const e of props.edges) { if (e.from === s) ids.add(e.to); if (e.to === s) ids.add(e.from) }
  return ids
})
const edgeOn = (e: LinkEdge) => !props.focus || !props.selected || e.from === props.selected || e.to === props.selected
const nodeOn = (n: LinkNode) => !near.value || near.value.has(n.id)

const visEdges = computed(() => props.edges.filter((e) => pos[e.from] && pos[e.to]))
const visNodes = computed(() => props.nodes.filter((n) => pos[n.id]))
const R = (n: LinkNode) => (n.kind === 'paper' ? 11 : n.kind === 'cited' ? 9 + Math.min(6, Math.sqrt(n.weight)) : 8 + Math.min(8, n.weight))
const label = (n: LinkNode) => props.titles[n.id] ?? (n.kind === 'cited' ? 'цитируемая работа' : n.label.replace(/^(передний|задний) электрод /, '$1 '))
const short = (t: string, n = 26) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
const hov = ref<string | null>(null)
function over(e: MouseEvent) { hov.value = idAt(e.target) }
const LH = 15
const shownLabels = computed(() => {
  const k = view.k
  const sel = props.selected, h = hov.value
  const rank = (n: LinkNode) =>
    n.id === sel ? 0 : n.id === h ? 1 : near.value?.has(n.id) && n.kind === 'paper' ? 2 : n.kind === 'paper' ? 3 : near.value?.has(n.id) ? 4 : 5 + (n.kind === 'cited' ? 2 : 0) - Math.min(1, n.weight / 10)
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const out = new Set<string>()
  for (const n of [...visNodes.value].sort((a, b) => rank(a) - rank(b))) {
    const p = pos[n.id]!
    const sx = view.x + p.x * k, sy = view.y + p.y * k
    const w = short(label(n), n.kind === 'paper' ? 34 : 24).length * 6.6 + 6
    const b = { x0: sx - w / 2, x1: sx + w / 2, y0: sy + R(n) * k + 2, y1: sy + R(n) * k + 2 + LH }
    const important = n.id === sel || n.id === h
    if (!important && (near.value && !near.value.has(n.id) || rank(n) >= 5 && k < 0.9)) continue
    if (!important && placed.some((q) => b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0)) continue
    placed.push(b)
    out.add(n.id)
  }
  return out
})
const diamond = (r: number) => `0,${-r * 1.25} ${r * 1.25},0 0,${r * 1.25} ${-r * 1.25},0`
</script>

<template>
  <div ref="el" class="cg" :class="{ 'cg--ctl': controls }" @wheel="onWheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
    <svg class="cg__svg" role="img" aria-label="Граф связей статей" :width="size.w" :height="size.h">
      <g :transform="`translate(${view.x} ${view.y}) scale(${view.k})`" @mouseover="over" @mouseleave="hov = null">
        <line
          v-for="(e, i) in visEdges" :key="i" class="cg__e" :class="['k-' + e.kind, { off: !edgeOn(e) }]"
          :x1="pos[e.from]!.x" :y1="pos[e.from]!.y" :x2="pos[e.to]!.x" :y2="pos[e.to]!.y"
        />
        <g
          v-for="n in visNodes" :key="n.id" class="cg__n" :class="['n-' + n.kind, { off: !nodeOn(n), sel: n.id === selected }]"
          :data-id="n.id" :transform="`translate(${pos[n.id]!.x} ${pos[n.id]!.y})`"
        >
          <circle v-if="shapeOf(n) === 'paper'" :r="R(n)" :style="{ fill: colorOf(n) }" class="cg__fill" />
          <rect v-else-if="shapeOf(n) === 'class'" :x="-R(n)" :y="-R(n) * 0.7" :width="R(n) * 2" :height="R(n) * 1.4" class="cg__shape cg__shape--class" />
          <polygon v-else-if="shapeOf(n) === 'material'" :points="diamond(R(n))" class="cg__shape" />
          <rect v-else-if="shapeOf(n) === 'layer'" :x="-R(n) * 0.8" :y="-R(n) * 0.8" :width="R(n) * 1.6" :height="R(n) * 1.6" class="cg__shape cg__shape--layer" />
          <circle v-else :r="R(n)" class="cg__shape cg__shape--cited" />
          <circle v-if="n.id === selected" :r="R(n) + 5" class="cg__ring" />
          <text
            v-if="shownLabels.has(n.id)" class="cg__t" :class="{ 'cg__t--p': n.kind === 'paper' }" :y="R(n) + 13 / view.k" text-anchor="middle"
            :style="{ fontSize: 12 / view.k + 'px', strokeWidth: 3 / view.k + 'px' }"
          >{{ short(label(n), n.kind === 'paper' ? 34 : 24) }}</text>
        </g>
      </g>
    </svg>
    <p v-if="controls" class="cg__hint" aria-hidden="true">Ctrl + колесо — масштаб</p>
    <div v-if="controls" class="cg__ctl" @pointerdown.stop @pointerup.stop>
      <button type="button" class="icon-btn" aria-label="Приблизить" @click="zoom(1.3)"><Icon name="plus" :size="16" /></button>
      <button type="button" class="icon-btn" aria-label="Отдалить" @click="zoom(1 / 1.3)"><span class="cg__minus" aria-hidden="true" /></button>
      <button type="button" class="icon-btn" aria-label="Вписать в окно" @click="refit"><Icon name="move" :size="16" /></button>
    </div>
  </div>
</template>

<style scoped>
.cg { position: relative; width: 100%; height: 100%; min-height: 0; overflow: hidden; touch-action: pan-y; user-select: none; }
.cg--ctl { touch-action: none; cursor: grab; }
.cg--ctl:active { cursor: grabbing; }
.cg__svg { display: block; max-width: 100%; }
.cg__e { stroke: var(--muted); stroke-linecap: round; transition: opacity var(--t); }
.cg__e.k-absorber { stroke-width: 2; opacity: 0.75; }
.cg__e.k-layer { stroke-width: 1; opacity: 0.45; }
.cg__e.k-class { stroke-width: 1.2; stroke-dasharray: 2 5; opacity: 0.5; }
.cg__e.k-cited { stroke-width: 1.2; stroke-dasharray: 1 4; opacity: 0.55; }
.cg__e.k-dataset { stroke-width: 1.6; opacity: 0.6; }
.cg__e.k-generator { stroke-width: 1.6; opacity: 0.65; }
.cg__e.k-embedding { stroke-width: 1.2; stroke-dasharray: 2 5; opacity: 0.5; }
.cg__e.k-retriever { stroke-width: 1.2; stroke-dasharray: 1 4; opacity: 0.55; }
.cg__e.off { opacity: 0.06; }
.cg__n { cursor: pointer; transition: opacity var(--t); }
.cg__n.off { opacity: 0.18; }
.cg__fill { stroke: var(--card); stroke-width: 2; }
.cg__shape { fill: var(--card); stroke: var(--muted); stroke-width: 1.5; }
.cg__shape--class { rx: var(--r-xs); }
.cg__shape--layer { fill: var(--bg-2); stroke-width: 1.2; rx: calc(var(--r-xs) / 3); }
.cg__shape--cited { fill: none; stroke-dasharray: 2 3; }
.cg__ring { fill: none; stroke: var(--ink); stroke-width: 1.5; }
.cg__n:hover .cg__shape { stroke: var(--ink); }
.cg__t { fill: var(--muted); paint-order: stroke; stroke: var(--card); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.cg__t--p { fill: var(--ink); font-weight: 600; }
.cg__n.sel .cg__t { fill: var(--ink); }
.cg__hint { position: absolute; left: var(--s3); bottom: var(--s2); margin: 0; font-size: var(--fs-xs); color: var(--muted); pointer-events: none; }
@media (hover: none), (max-width: 768px) { .cg__hint { display: none; } }
.cg__ctl { position: absolute; right: var(--s2); top: var(--s2); display: grid; gap: 2px; padding: 2px; border-radius: var(--r); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.cg__minus { width: 12px; height: 1.5px; background: currentColor; border-radius: 1px; }
</style>
