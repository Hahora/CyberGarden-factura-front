<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { buildGraph } from '../graph'
import { layoutTimeline, type TNode } from '../graphTimeline'
import type { CollectionId } from '../data'

const props = withDefaults(defineProps<{
  collection: CollectionId
  root: string
  selected?: string | null
  interactive?: boolean
  maxHeight?: number
  inset?: number
}>(), { selected: null, interactive: false, maxHeight: 0, inset: 0 })
const emit = defineEmits<{ select: [id: string | null]; open: [id: string | null] }>()

const el = ref<HTMLElement>()
const size = reactive({ w: 0, h: 0 })
const lay = computed(() => (size.w ? layoutTimeline(buildGraph(props.collection), props.root, size.w) : null))
const view = reactive({ x: 0, y: 0, k: 1 })
const smooth = ref(false)
let ro: ResizeObserver | undefined

const boxH = computed(() => {
  if (props.interactive) return null
  const h = lay.value?.height ?? 220
  return props.maxHeight ? Math.min(h, props.maxHeight) : h
})
const visH = () => Math.max(100, size.h - props.inset)

function clamp() {
  const l = lay.value
  if (!l) return
  const k = view.k
  view.x = Math.min(0, Math.max(size.w - size.w * k, view.x))
  const ch = l.height * k
  const vh = visH()
  view.y = ch <= vh ? (props.interactive ? (vh - ch) / 2 : 0) : Math.min(0, Math.max(vh - ch, view.y))
}
function centerOn(id: string, animate = true) {
  const n = lay.value?.byId.get(id)
  if (!n) return
  smooth.value = animate
  view.x = size.w / 2 - n.x * view.k
  view.y = visH() / 2 - n.y * view.k
  clamp()
}
function reset() {
  smooth.value = true
  view.k = 1
  view.x = 0
  centerOn(props.root)
}
function initView() {
  const l = lay.value
  if (!l) return
  view.k = 1
  view.x = 0
  view.y = 0
  if (!props.interactive && props.maxHeight && l.height > props.maxHeight) view.y = -(l.rootY - props.maxHeight / 2)
  if (props.interactive) centerOn(props.selected && l.byId.has(props.selected) ? props.selected : props.root, false)
  clamp()
}
defineExpose({ reset, centerOn })

onMounted(() => {
  if (!el.value) return
  ro = new ResizeObserver(() => {
    size.w = el.value!.clientWidth
    size.h = el.value!.clientHeight
  })
  ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
watch(() => [lay.value?.width, props.root, props.collection, props.maxHeight], initView, { flush: 'post' })
watch(() => size.h, () => { if (props.interactive) clamp() })
watch(() => props.inset, () => {
  smooth.value = true
  if (props.selected) centerOn(props.selected)
  else clamp()
})
watch(() => props.selected, (id) => { if (id && props.interactive) centerOn(id) })

const hot = computed(() => props.selected ?? null)
const nearSet = computed(() => (hot.value && lay.value ? lay.value.near.get(hot.value) ?? null : null))
const dim = (id: string) => !!hot.value && id !== hot.value && !nearSet.value?.has(id)
const edgeHot = (e: { source: string; target: string }) => !!hot.value && (e.source === hot.value || e.target === hot.value)
const citers = computed(() => new Set((lay.value?.edges ?? []).filter((e) => e.target === props.root).map((e) => e.source)))

function edgePath(e: { source: string; target: string }): string {
  const a = lay.value?.byId.get(e.source), b = lay.value?.byId.get(e.target)
  if (!a || !b) return ''
  if (Math.abs(a.y - b.y) < 4) {
    const dir = b.x > a.x ? 1 : -1
    return `M${a.x + (dir * a.w) / 2} ${a.y}L${b.x - (dir * b.w) / 2} ${b.y}`
  }
  const down = b.y > a.y
  const y1 = a.y + (down ? a.h / 2 : -a.h / 2)
  const y2 = b.y + (down ? -b.h / 2 : b.h / 2)
  const m = (y1 + y2) / 2
  return `M${a.x} ${y1}C${a.x} ${m} ${b.x} ${m} ${b.x} ${y2}`
}
function arrowPath(e: { source: string; target: string }): string {
  const a = lay.value?.byId.get(e.source), b = lay.value?.byId.get(e.target)
  if (!a || !b) return ''
  if (Math.abs(a.y - b.y) < 4) {
    const dir = b.x > a.x ? 1 : -1
    const x = b.x - (dir * b.w) / 2
    return `M${x} ${b.y}l${-dir * 7} -3.5v7z`
  }
  const down = b.y > a.y
  const y = b.y + (down ? -b.h / 2 : b.h / 2)
  const s = down ? -1 : 1
  return `M${b.x} ${y}l-3.5 ${s * 7}h7z`
}

const ptrs = new Map<number, { x: number; y: number }>()
let drag: { id: string | null; moved: boolean; sx: number; sy: number } | null = null
let pinch = 0
let lastTap = { t: 0, x: 0, y: 0 }
const idAt = (t: EventTarget | null) => (t as Element | null)?.closest?.('[data-id]')?.getAttribute('data-id') ?? null

function zoomAt(f: number, cx: number, cy: number) {
  const k = Math.min(3.5, Math.max(1, view.k * f))
  const r = k / view.k
  view.x = cx - (cx - view.x) * r
  view.y = cy - (cy - view.y) * r
  view.k = k
  clamp()
}
function down(e: PointerEvent) {
  if (!props.interactive) return
  smooth.value = false
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    pinch = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    if (drag) drag.moved = true
  } else drag = { id: idAt(e.target), moved: false, sx: e.clientX, sy: e.clientY }
}
function move(e: PointerEvent) {
  const prev = ptrs.get(e.pointerId)
  if (!prev) return
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y)
    const r = el.value!.getBoundingClientRect()
    if (pinch) zoomAt(d / pinch, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top)
    pinch = d
    view.x += dx / 2; view.y += dy / 2
    clamp()
    return
  }
  if (!drag) return
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true
  if (!drag.moved) return
  view.x += dx; view.y += dy
  clamp()
}
function up(e: PointerEvent) {
  if (!ptrs.has(e.pointerId)) return
  ptrs.delete(e.pointerId)
  if (ptrs.size === 0 && drag) {
    const d = drag
    drag = null
    pinch = 0
    if (e.type === 'pointercancel' || d.moved) return
    const now = performance.now()
    const r = el.value!.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    if (now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 30) {
      lastTap = { t: 0, x: 0, y: 0 }
      smooth.value = true
      zoomAt(view.k > 1.4 ? 1 / view.k : 2.2, x, y)
      return
    }
    lastTap = { t: now, x, y }
    emit('select', d.id)
  } else if (ptrs.size < 2) pinch = 0
}
function onWheel(e: WheelEvent) {
  if (!props.interactive) return
  const r = el.value!.getBoundingClientRect()
  smooth.value = false
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
}
const onClick = (e: MouseEvent) => { if (!props.interactive) emit('open', idAt(e.target)) }
const tf = computed(() => `translate(${view.x}px, ${view.y}px) scale(${view.k})`)
const label = (n: TNode) => n.label
</script>

<template>
  <div ref="el" class="gt" :class="{ 'is-live': interactive }" :style="boxH ? { height: boxH + 'px' } : undefined">
    <svg
      v-if="lay" class="gt__svg" role="img" aria-label="Граф связей по годам"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel.prevent="onWheel" @click="onClick"
    >
      <g class="gt__view" :class="{ 'is-smooth': smooth }" :style="{ transform: tf }">
        <g aria-hidden="true">
          <template v-for="y in lay.years" :key="y.label">
            <line class="gt__guide" :x1="44" :x2="lay.width" :y1="y.y" :y2="y.y" />
            <text class="gt__year" x="8" :y="y.y" dominant-baseline="central">{{ y.label }}</text>
          </template>
        </g>
        <g>
          <path v-for="(e, i) in lay.edges" :key="'e' + i" class="gt__edge" :class="{ 'is-hot': edgeHot(e), 'is-dim': !!hot && !edgeHot(e) }" :d="edgePath(e)" />
          <path v-for="(e, i) in lay.edges" :key="'a' + i" class="gt__arr" :class="{ 'is-hot': edgeHot(e), 'is-dim': !!hot && !edgeHot(e) }" :d="arrowPath(e)" />
        </g>
        <g
          v-for="n in lay.nodes" :key="n.id" class="gt__node" :data-id="n.id"
          :class="{ 'is-root': n.root, 'is-ext': n.kind === 'ext', 'is-sel': n.id === selected, 'is-citer': citers.has(n.id), 'is-dim': dim(n.id) }"
          :transform="`translate(${n.x} ${n.y})`"
        >
          <rect class="gt__hit" :x="-n.w / 2 - 4" :y="-24" :width="n.w + 8" height="48" />
          <rect class="gt__pill" :x="-n.w / 2" :y="-n.h / 2" :width="n.w" :height="n.h" :rx="n.h / 2" />
          <text class="gt__t" text-anchor="middle" dominant-baseline="central">{{ label(n) }}</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.gt { position: relative; overflow: hidden; background: var(--bg); touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; min-height: 120px; }
.gt.is-live { position: absolute; inset: 0; touch-action: none; }
.gt__svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.gt__view { transform-origin: 0 0; }
.gt__view.is-smooth { transition: transform 280ms var(--ease); }
.gt__guide { vector-effect: non-scaling-stroke; stroke: var(--line); stroke-dasharray: 2 5; }
.gt__year { fill: var(--muted); font: 500 12px var(--font); }
.gt__edge { vector-effect: non-scaling-stroke; fill: none; stroke: var(--line-2); stroke-width: 1.3; transition: opacity var(--t); }
.gt__edge.is-hot { stroke: var(--ink); stroke-width: 1.8; }
.gt__arr { fill: var(--faint); transition: opacity var(--t); }
.gt__arr.is-hot { fill: var(--ink); }
.gt__edge.is-dim, .gt__arr.is-dim { opacity: 0.2; }
.gt__node { cursor: pointer; transition: opacity var(--t); }
.gt__node.is-dim { opacity: 0.3; }
.gt__hit { fill: transparent; }
.gt__pill { vector-effect: non-scaling-stroke; fill: var(--bg-2); stroke: var(--line-2); stroke-width: 1; }
.gt__t { fill: var(--ink); font: 500 12px var(--font); pointer-events: none; }
.gt__node.is-citer .gt__pill { stroke: var(--ink-2); }
.gt__node.is-ext .gt__pill { fill: transparent; stroke: var(--muted); stroke-dasharray: 3 3; }
.gt__node.is-ext .gt__t { fill: var(--ink-2); }
.gt__node.is-root .gt__pill { fill: var(--solid); stroke: var(--solid); }
.gt__node.is-root .gt__t { fill: var(--on-solid); }
.gt__node.is-sel .gt__pill { stroke: var(--ink); stroke-width: 2.4; }
@media (prefers-reduced-motion: reduce) { .gt__view.is-smooth { transition: none; } }
</style>
