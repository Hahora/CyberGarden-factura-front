<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    id: string
    dir?: 'row' | 'col'
    sized?: 'start' | 'end'
    initial: number
    min?: number
    max?: number
    collapsible?: boolean
    label?: string
    disabled?: boolean
  }>(),
  { dir: 'row', sized: 'end', min: 160, max: 2000 },
)
const emit = defineEmits<{ resize: [size: number] }>()

const KEY = 'gs:v1:split:' + props.id
type Saved = { size: number; collapsed: boolean }
function read(): Saved | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null
    return v && typeof v.size === 'number' ? v : null
  } catch {
    return null
  }
}
const saved = read()
const size = ref(saved?.size ?? props.initial)
const collapsed = ref(!!(props.collapsible && saved?.collapsed))
const root = ref<HTMLElement>()
const dragging = ref(false)
const total = ref(0)

const horizontal = computed(() => props.dir === 'row')
const maxNow = computed(() => Math.max(props.min, Math.min(props.max, total.value ? total.value - props.min : props.max)))
const clamp = (v: number) => Math.round(Math.max(props.min, Math.min(maxNow.value, v)))
const shown = computed(() => (collapsed.value ? 0 : clamp(size.value)))

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ size: Math.round(size.value), collapsed: collapsed.value }))
  } catch {
  }
}
watch(shown, (v) => emit('resize', v))

let ro: ResizeObserver | null = null
onMounted(() => {
  const el = root.value
  if (!el) return
  const measure = () => (total.value = horizontal.value ? el.clientWidth : el.clientHeight)
  measure()
  ro = new ResizeObserver(measure)
  ro.observe(el)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  stop()
})

let startPos = 0
let startSize = 0
let sizeBefore = 0
let moved = false
const tipOff = ref(false)
function down(e: PointerEvent) {
  if (props.disabled || e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  tipOff.value = true
  moved = false
  sizeBefore = size.value
  startPos = horizontal.value ? e.clientX : e.clientY
  startSize = collapsed.value ? 0 : shown.value
  document.documentElement.classList.add(horizontal.value ? 'is-resizing-x' : 'is-resizing-y')
}
function move(e: PointerEvent) {
  if (!dragging.value) return
  const d = (horizontal.value ? e.clientX : e.clientY) - startPos
  if (Math.abs(d) > 2) moved = true
  let next = props.sized === 'end' ? startSize - d : startSize + d
  if (props.collapsible && next < props.min - 48) {
    collapsed.value = true
    if (sizeBefore >= props.min) size.value = sizeBefore
    return
  }
  collapsed.value = false
  next = clamp(next)
  size.value = next
}
function stop() {
  if (!dragging.value) return
  dragging.value = false
  document.documentElement.classList.remove('is-resizing-x', 'is-resizing-y')
  persist()
}
function up() {
  if (!moved && collapsed.value) collapsed.value = false
  stop()
}
function reset() {
  collapsed.value = false
  size.value = props.initial
  persist()
}
function expand() {
  collapsed.value = false
  if (size.value < props.min) size.value = props.initial
  persist()
}
function collapse() {
  if (!props.collapsible) return
  collapsed.value = true
  persist()
}
defineExpose({ collapse, expand })
function key(e: KeyboardEvent) {
  const step = e.shiftKey ? 64 : 16
  const grow = props.sized === 'end' ? -1 : 1
  const keys = horizontal.value ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
  if (e.key === keys[0]) size.value = clamp(shown.value - step * grow)
  else if (e.key === keys[1]) size.value = clamp(shown.value + step * grow)
  else if (e.key === 'Home') size.value = props.min
  else if (e.key === 'End') size.value = maxNow.value
  else if (e.key === 'Enter' && props.collapsible) collapsed.value = !collapsed.value
  else return
  if (e.key !== 'Enter') collapsed.value = false
  e.preventDefault()
  persist()
}

const sizedStyle = computed(() => (horizontal.value ? { width: shown.value + 'px' } : { height: shown.value + 'px' }))
</script>

<template>
  <div ref="root" class="spl" :class="['spl--' + dir, { 'is-off': disabled, 'is-drag': dragging }]">
    <div class="spl__pane" :class="sized === 'start' ? 'spl__pane--sized' : 'spl__pane--fill'" :style="sized === 'start' && !disabled ? sizedStyle : undefined">
      <slot name="start" />
    </div>

    <div
      v-if="!disabled"
      class="spl__bar" role="separator" tabindex="0"
      :aria-orientation="horizontal ? 'vertical' : 'horizontal'" :aria-valuenow="shown" :aria-valuemin="min" :aria-valuemax="maxNow"
      :aria-label="(label ? label + ': ' : '') + 'изменить размер (двойной клик — по умолчанию)'"
      :data-tip="tipOff || dragging ? undefined : collapsed ? 'Развернуть ' + (label ?? '') : 'Потяните · двойной клик — как было'"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="stop" @lostpointercapture="stop" @pointerleave="tipOff = false" @dblclick="reset" @keydown="key"
    >
      <span class="spl__line" />
      <span class="spl__grip" />
    </div>

    <div class="spl__pane" :class="sized === 'end' ? 'spl__pane--sized' : 'spl__pane--fill'" :style="sized === 'end' && !disabled ? sizedStyle : undefined">
      <slot name="end" />
    </div>

    <button v-if="collapsed && !disabled" type="button" class="spl__tab" :class="'spl__tab--' + sized" @click="expand">
      <span>{{ label ?? 'Развернуть' }}</span>
    </button>
  </div>
</template>

<style scoped>
.spl { position: relative; display: flex; min-width: 0; min-height: 0; height: 100%; width: 100%; }
.spl--col { flex-direction: column; }
.spl.is-off { display: contents; }
.spl__pane { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.spl--row > .spl__pane { height: 100%; }
.spl__pane--sized { flex: none; }
.spl__pane--fill { flex: 1 1 0; }
.spl.is-drag > .spl__pane { pointer-events: none; user-select: none; }
.spl__bar { position: relative; z-index: 5; flex: none; display: grid; place-items: center; touch-action: none; outline: none; }
.spl--row > .spl__bar { width: 1px; cursor: col-resize; }
.spl--col > .spl__bar { height: 1px; cursor: row-resize; }
.spl__bar::before { content: ''; position: absolute; }
.spl--row > .spl__bar::before { inset: 0 -5px; }
.spl--col > .spl__bar::before { inset: -5px 0; }
.spl__line { position: absolute; inset: 0; background: var(--line); transition: background-color var(--t) ease, box-shadow var(--t) ease; }
.spl__grip {
  position: relative; border-radius: var(--r-pill); background: var(--line-2); opacity: 0;
  transition: opacity var(--t) ease, background-color var(--t) ease;
}
.spl--row > .spl__bar > .spl__grip { width: 4px; height: 32px; }
.spl--col > .spl__bar > .spl__grip { width: 32px; height: 4px; }
.spl__bar:hover .spl__line, .spl__bar:focus-visible .spl__line, .spl.is-drag > .spl__bar > .spl__line { background: var(--blue); box-shadow: 0 0 0 1px var(--blue); }
.spl__bar:hover .spl__grip, .spl__bar:focus-visible .spl__grip, .spl.is-drag > .spl__bar > .spl__grip { opacity: 1; background: var(--blue); }
.spl__tab {
  position: absolute; z-index: 6; display: grid; place-items: center; padding: var(--s2);
  font-size: var(--fs-xs); font-weight: 500; color: var(--muted); background: var(--bg-2); border-radius: var(--r-sm);
  box-shadow: 0 0 0 1px var(--line);
}
.spl__tab:hover { color: var(--ink); background: var(--bg-3); }
.spl--row > .spl__tab { top: 50%; translate: 0 -50%; writing-mode: vertical-rl; padding: var(--s3) 6px; }
.spl--row > .spl__tab--end { right: 4px; }
.spl--row > .spl__tab--start { left: 4px; }
.spl--col > .spl__tab { left: 50%; translate: -50% 0; }
.spl--col > .spl__tab--end { bottom: 4px; }
.spl--col > .spl__tab--start { top: 4px; }
</style>

<style>
html.is-resizing-x, html.is-resizing-x * { cursor: col-resize !important; user-select: none !important; }
html.is-resizing-y, html.is-resizing-y * { cursor: row-resize !important; user-select: none !important; }
</style>
