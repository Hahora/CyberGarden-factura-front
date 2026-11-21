<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import type { TextLayer } from 'pdfjs-dist'
import Icon from './Icon.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiEmpty from './UiEmpty.vue'
import { openPdf, pdfError, pdfjs } from '../pdf/pdfjs'
import { findFragment, type Piece } from '../pdf/find'
import { toast } from '../store'

const props = defineProps<{
  src: string
  page?: number | null
  fragment?: string | null
  value?: string | null
  table?: string | null
  label?: string | null
  nonce?: number
  scan?: boolean
}>()
const emit = defineEmits<{ page: [n: number]; found: [ok: boolean] }>()

const scroller = ref<HTMLElement>()
const doc = shallowRef<PDFDocumentProxy | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const sizes = ref<{ w: number; h: number }[]>([])
const cur = ref(1)
const pageInput = ref('1')
const fit = ref(true)
const zoom = ref(1)
const width = ref(0)
const missing = ref<string | null>(null)

const PAD = computed(() => (width.value && width.value < 560 ? 8 : 20))
const maxW = computed(() => Math.max(1, ...sizes.value.map((s) => s.w)))
const fitScale = computed(() => (width.value ? Math.max(0.2, (width.value - PAD.value * 2) / maxW.value) : 1))
const scale = computed(() => (fit.value ? fitScale.value : zoom.value))
const pct = computed(() => (status.value === 'ready' ? Math.round(scale.value * 100) + '%' : '—'))
const total = computed(() => sizes.value.length)

interface PageState {
  host?: HTMLElement
  canvas?: HTMLCanvasElement
  task?: RenderTask | null
  scale?: number
  text?: TextLayer
  textReady?: Promise<TextLayer | undefined>
  content?: Promise<TextContent>
  hl?: HTMLElement
}
let pstate = new Map<number, PageState>()
const ps = (n: number) => {
  let s = pstate.get(n)
  if (!s) pstate.set(n, (s = {}))
  return s
}
const shells = new Map<number, HTMLElement>()
function shellRef(n: number, el: unknown) {
  if (el instanceof HTMLElement) {
    shells.set(n, el)
    io?.observe(el)
  } else shells.delete(n)
}

let loadSeq = 0
async function load(src: string) {
  const seq = ++loadSeq
  reset()
  status.value = 'loading'
  sizes.value = []
  doc.value = null
  try {
    const d = await openPdf(src)
    if (seq !== loadSeq) return
    const pages = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)))
    if (seq !== loadSeq) return
    sizes.value = pages.map((p) => {
      const v = p.getViewport({ scale: 1 })
      return { w: v.width, h: v.height }
    })
    doc.value = d
    status.value = 'ready'
    cur.value = 1
    pageInput.value = '1'
    await nextTick()
    measure()
    if (pending) void runFocus()
    else pump()
  } catch (e) {
    if (seq !== loadSeq) return
    status.value = 'error'
    errWhy.value = ''
    console.warn('PDF', src, e)
    const why = await pdfError(src, e)
    if (seq === loadSeq) errWhy.value = why
  }
}
const errWhy = ref('')

function reset() {
  for (const s of pstate.values()) {
    s.task?.cancel()
    s.text?.cancel()
  }
  pstate = new Map()
  visible.clear()
  missing.value = null
}

const visible = new Set<number>()
let io: IntersectionObserver | null = null
let ro: ResizeObserver | null = null
onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.p)
        if (e.isIntersecting) visible.add(n)
        else visible.delete(n)
      }
      pump()
    },
    { root: scroller.value, rootMargin: '60% 0px' },
  )
  for (const el of shells.values()) io.observe(el)
  ro = new ResizeObserver(measure)
  if (scroller.value) ro.observe(scroller.value)
  void load(props.src)
})
onBeforeUnmount(() => {
  loadSeq++
  io?.disconnect()
  ro?.disconnect()
  reset()
  cancelAnimationFrame(raf)
})
watch(() => props.src, (s) => void load(s))

function measure() {
  const w = scroller.value?.clientWidth ?? 0
  if (w > 0 && Math.abs(w - width.value) > 1) width.value = w
  if (w > 0 && pending && status.value === 'ready') void runFocus()
}

function wanted(): number[] {
  const set = new Set<number>()
  for (const n of visible) for (const k of [n - 1, n, n + 1]) if (k >= 1 && k <= total.value) set.add(k)
  if (!set.size && total.value) set.add(cur.value)
  return [...set].sort((a, b) => Math.abs(a - cur.value) - Math.abs(b - cur.value))
}

let pumping = false
async function pump() {
  if (pumping || !doc.value || !width.value) return
  pumping = true
  try {
    const want = wanted()
    for (const [n, s] of pstate) {
      if (s.canvas && !want.some((k) => Math.abs(k - n) <= 1)) {
        s.task?.cancel()
        s.canvas.width = s.canvas.height = 0
        s.canvas.remove()
        s.canvas = undefined
        s.scale = undefined
      }
    }
    for (const n of want) {
      if (ps(n).scale === scale.value) continue
      await renderPage(n)
    }
  } finally {
    pumping = false
  }
  if (wanted().some((n) => ps(n).scale !== scale.value)) requestAnimationFrame(() => void pump())
}

async function renderPage(n: number) {
  const d = doc.value
  const shell = shells.get(n)
  if (!d || !shell) return
  const s = ps(n)
  const sc = scale.value
  s.task?.cancel()
  let page: PDFPageProxy
  try {
    page = await d.getPage(n)
  } catch {
    return
  }
  if (d !== doc.value) return
  const vp = page.getViewport({ scale: sc })
  let dpr = Math.min(window.devicePixelRatio || 1, 3)
  const px = vp.width * vp.height * dpr * dpr
  if (px > 16e6) dpr *= Math.sqrt(16e6 / px)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(vp.width * dpr)
  canvas.height = Math.floor(vp.height * dpr)
  canvas.className = 'pv__cv'
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return
  const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined })
  s.task = task
  try {
    await task.promise
  } catch {
    return
  }
  if (s.task !== task || d !== doc.value) return
  s.task = null
  const host = shell.querySelector<HTMLElement>('.pv__in')
  if (!host) return
  if (s.canvas) s.canvas.replaceWith(canvas)
  else host.prepend(canvas)
  if (s.canvas) s.canvas.width = s.canvas.height = 0
  s.canvas = canvas
  s.scale = sc
  void ensureText(n, page)
}

async function contentOf(n: number): Promise<TextContent | null> {
  const d = doc.value
  if (!d) return null
  const s = ps(n)
  s.content ??= d.getPage(n).then((p) => p.getTextContent())
  try {
    return await s.content
  } catch {
    return null
  }
}
const strsOf = (tc: TextContent) => tc.items.flatMap((it) => ('str' in it ? [it.str] : []))

function ensureText(n: number, page?: PDFPageProxy): Promise<TextLayer | undefined> {
  const s = ps(n)
  s.textReady ??= buildText(n, page).then((tl) => {
    if (!tl) s.textReady = undefined
    return tl
  })
  return s.textReady
}
async function buildText(n: number, page?: PDFPageProxy): Promise<TextLayer | undefined> {
  const s = ps(n)
  const d = doc.value
  if (!d || !shells.get(n)) return
  const p = page ?? (await d.getPage(n))
  const tc = await contentOf(n)
  if (!tc || d !== doc.value) return
  const { TextLayer } = await pdfjs()
  const div = document.createElement('div')
  div.className = 'textLayer'
  const tl = new TextLayer({ textContentSource: tc, container: div, viewport: p.getViewport({ scale: 1 }) })
  s.text = tl
  try {
    await tl.render()
  } catch {
    s.text = undefined
    return
  }
  const host = shells.get(n)?.querySelector('.pv__in')
  if (!host || d !== doc.value) return
  host.append(div)
  return tl
}

let raf = 0
function onScroll() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    const sc = scroller.value
    if (!sc) return
    const y = sc.scrollTop + sc.clientHeight * 0.3
    let n = 1
    for (const [k, el] of shells) if (el.offsetTop <= y && k > n) n = k
    if (n !== cur.value) {
      cur.value = n
      pageInput.value = String(n)
      emit('page', n)
    }
  })
}

function scrollToPage(n: number, offsetY = 0, smooth = false) {
  const el = shells.get(n)
  const sc = scroller.value
  if (!el || !sc) return
  sc.scrollTo({ top: Math.max(0, el.offsetTop - PAD.value + offsetY), behavior: smooth ? 'smooth' : 'auto' })
  if (cur.value !== n) {
    cur.value = n
    emit('page', n)
  }
  pageInput.value = String(n)
}

function goTo(n: number) {
  if (!total.value) return
  const k = Math.min(total.value, Math.max(1, Math.round(n) || 1))
  scrollToPage(k)
}
function submitPage() {
  goTo(parseInt(pageInput.value, 10))
  ;(document.activeElement as HTMLElement | null)?.blur()
}

const STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 2.5, 3]
async function setScale(next: number | 'fit') {
  const sc = scroller.value
  const el = shells.get(cur.value)
  const rel = sc && el ? (sc.scrollTop - el.offsetTop) / Math.max(1, el.offsetHeight) : 0
  const page = cur.value
  if (next === 'fit') fit.value = true
  else {
    fit.value = false
    zoom.value = next
  }
  await nextTick()
  const el2 = shells.get(page)
  if (sc && el2) sc.scrollTop = el2.offsetTop + rel * el2.offsetHeight
  pump()
}
const zoomIn = () => void setScale(STEPS.find((s) => s > scale.value + 0.01) ?? STEPS[STEPS.length - 1]!)
const zoomOut = () => void setScale([...STEPS].reverse().find((s) => s < scale.value - 0.01) ?? STEPS[0]!)
watch(scale, () => pump())

let pending = false
let focusSeq = 0
watch(
  () => [props.page, props.fragment, props.nonce, props.value, props.table] as const,
  (now, before) => {
    const [p, f, k] = now
    if (before && p === cur.value && f === before[1] && k === before[2]) return
    pending = true
    void runFocus()
  },
)
let tagEl: HTMLElement | null = null
let placeTag: (() => void) | null = null
watch(
  () => props.label,
  (l) => {
    if (!l) return
    if (tagEl && tagEl.textContent !== l) {
      tagEl.textContent = l
      placeTag?.()
      tagEl.style.animation = 'none'
      void tagEl.offsetWidth
      tagEl.style.animation = ''
    } else if (cap.value && cap.value !== l) showCap(l)
  },
)

const cap = ref<string | null>(null)
const showCap = (l: string | null) => (cap.value = l)
if (props.page || props.fragment) pending = true

async function runFocus() {
  if (status.value !== 'ready' || !scroller.value) return
  await nextTick()
  if (!scroller.value?.clientWidth) return
  pending = false
  const seq = ++focusSeq
  clearHighlight()
  showCap(null)
  missing.value = null
  const page = Math.min(total.value, Math.max(1, props.page || cur.value))
  const frag = (props.fragment ?? '').trim() || (props.table ?? '').trim()
  scrollToPage(page)
  pump()
  if (!frag) return
  if (props.scan) { missing.value = frag; emit('found', false); return }

  let hit: { n: number; pieces: Piece[] } | null = null
  for (const n of [page, page + 1, page - 1]) {
    if (n < 1 || n > total.value) continue
    const tc = await contentOf(n)
    if (seq !== focusSeq) return
    const pieces = tc && findFragment(strsOf(tc), (props.fragment ?? '').trim(), props.value ?? '', props.table ?? '')
    if (pieces?.length) {
      hit = { n, pieces }
      break
    }
  }
  if (!hit) {
    missing.value = frag
    emit('found', false)
    return
  }
  const tl = await ensureText(hit.n)
  if (seq !== focusSeq || !tl) return
  const top = drawHighlight(hit.n, tl, hit.pieces, props.label ?? '')
  emit('found', true)
  if (top != null) {
    const sc = scroller.value
    const el = shells.get(hit.n)
    if (sc && el) sc.scrollTo({ top: Math.max(0, el.offsetTop + top - sc.clientHeight * 0.3), behavior: 'auto' })
  }
}

function clearHighlight() {
  for (const s of pstate.values()) {
    s.hl?.remove()
    s.hl = undefined
  }
  tagEl = null
  placeTag = null
}

interface Box { x: number; y: number; w: number; h: number }
const hits = (a: Box, b: Box, gap = 1) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap

function placeLabel(tag: HTMLElement, rects: Box[], text: Box[], W: number, H: number): boolean {
  const first = rects[0]!
  const last = rects[rects.length - 1]!
  const near = text.filter((b) => b.y + b.h > first.y - 160 && b.y < last.y + last.h + 160)
  const minX = Math.min(first.x, ...near.map((b) => b.x))
  const maxX = Math.max(...rects.map((r) => r.x + r.w), ...near.map((b) => b.x + b.w))
  const ok = (c: Box) => c.x >= 2 && c.y >= 2 && c.x + c.w <= W - 2 && c.y + c.h <= H - 2 && !text.some((b) => hits(c, b)) && !rects.some((b) => hits(c, b, 2))
  const put = (c: Box) => {
    tag.style.left = (c.x / W) * 100 + '%'
    tag.style.top = (c.y / H) * 100 + '%'
  }
  const midY = (h: number) => first.y + first.h / 2 - h / 2
  const tryAll = (w: number, h: number, margins: boolean) => {
    const cands: Box[] = [
      { x: minX - 8 - w, y: midY(h), w, h },
      { x: maxX + 8, y: midY(h), w, h },
    ]
    if (!margins) cands.push(
      { x: last.x + last.w + 8, y: last.y + last.h / 2 - h / 2, w, h },
      { x: Math.min(Math.max(2, first.x - 2), W - w - 2), y: first.y - h - 4, w, h },
      { x: Math.min(Math.max(2, last.x - 2), W - w - 2), y: last.y + last.h + 4, w, h },
    )
    const c = cands.find(ok)
    if (c) put(c)
    return !!c
  }
  tag.classList.remove('is-wrap')
  tag.style.maxWidth = ''
  let w = tag.offsetWidth
  let h = tag.offsetHeight
  if (tryAll(w, h, false)) return true
  const room = Math.max(minX, W - maxX) - 12
  if (room >= 40) {
    tag.classList.add('is-wrap')
    tag.style.maxWidth = room + 'px'
    w = tag.offsetWidth
    h = tag.offsetHeight
    if (tag.scrollWidth <= tag.clientWidth + 1 && h <= 3 * 18 && tryAll(w, h, true)) return true
  }
  return false
}

function drawHighlight(n: number, tl: TextLayer, pieces: Piece[], label: string): number | null {
  const shell = shells.get(n)
  const host = shell?.querySelector<HTMLElement>('.pv__in')
  if (!shell || !host) return null
  const box = shell.getBoundingClientRect()
  if (!box.width || !box.height) return null
  const rects: { x: number; y: number; w: number; h: number }[] = []
  for (const p of pieces) {
    const span = tl.textDivs[p.item]
    const node = span?.firstChild
    if (!span || !node || node.nodeType !== Node.TEXT_NODE) continue
    const len = node.textContent?.length ?? 0
    const range = document.createRange()
    range.setStart(node, Math.min(p.start, len))
    range.setEnd(node, Math.min(p.end, len))
    for (const r of range.getClientRects()) {
      if (r.width < 0.5 || r.height < 0.5) continue
      const x = r.left - box.left
      const y = r.top - box.top
      const last = rects[rects.length - 1]
      if (last && Math.abs(last.y - y) < r.height * 0.5 && x - (last.x + last.w) < r.height * 1.2 && x >= last.x) {
        const right = Math.max(last.x + last.w, x + r.width)
        last.y = Math.min(last.y, y)
        last.h = Math.max(last.h, r.height)
        last.w = right - last.x
      } else rects.push({ x, y, w: r.width, h: r.height })
    }
  }
  if (!rects.length) return null
  const layer = document.createElement('div')
  layer.className = 'pv__hl'
  const W = box.width
  const H = box.height
  for (const r of rects) {
    const m = document.createElement('span')
    m.className = 'pv__mark'
    m.style.left = ((r.x - 2) / W) * 100 + '%'
    m.style.top = ((r.y - 1) / H) * 100 + '%'
    m.style.width = ((r.w + 4) / W) * 100 + '%'
    m.style.height = ((r.h + 2) / H) * 100 + '%'
    layer.append(m)
  }
  host.append(layer)
  ps(n).hl = layer
  if (label) {
    const text: Box[] = []
    for (const d of tl.textDivs) {
      if (!d.textContent?.trim()) continue
      const r = d.getBoundingClientRect()
      if (r.width >= 0.5 && r.height >= 0.5) text.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height })
    }
    const tag = document.createElement('span')
    tag.className = 'pv__tag'
    tag.textContent = label
    layer.append(tag)
    const place = () => {
      tag.hidden = false
      if (placeLabel(tag, rects, text, W, H)) {
        tag.hidden = false
        showCap(null)
      } else {
        tag.hidden = true
        showCap(tag.textContent)
      }
    }
    place()
    tagEl = tag
    placeTag = place
  }
  return rects[0]!.y
}

async function copyQuote() {
  if (!missing.value) return
  try {
    await navigator.clipboard.writeText(missing.value)
    toast('Цитата скопирована')
  } catch {
    toast('Не удалось скопировать')
  }
}

const shellStyle = (s: { w: number; h: number }) => ({
  width: s.w * scale.value + 'px',
  height: s.h * scale.value + 'px',
  '--scale-factor': String(scale.value),
})
const fallbackPages = computed(() => (width.value && width.value < 560 ? 1 : 2))
</script>

<template>
  <div class="pv">
    <div class="pv__bar" role="toolbar" aria-label="Просмотр PDF">
      <div class="pv__grp">
        <button type="button" class="icon-btn icon-btn--sm pv__prev" :disabled="cur <= 1 || status !== 'ready'" data-tip="Предыдущая страница" aria-label="Предыдущая страница" @click="goTo(cur - 1)">
          <Icon name="chevron-right" :size="16" />
        </button>
        <label class="pv__pg">
          <input
            v-model="pageInput" class="pv__pin num" inputmode="numeric" :disabled="status !== 'ready'" aria-label="Номер страницы"
            @keydown.enter.prevent="submitPage" @blur="pageInput = String(cur)" @focus="($event.target as HTMLInputElement).select()"
          />
          <span class="pv__of num">/ {{ total || '—' }}</span>
        </label>
        <button type="button" class="icon-btn icon-btn--sm" :disabled="cur >= total || status !== 'ready'" data-tip="Следующая страница" aria-label="Следующая страница" @click="goTo(cur + 1)">
          <Icon name="chevron-right" :size="16" />
        </button>
      </div>
      <Transition name="fade">
        <span v-if="cap" class="pv__cap" role="status" :data-tip="'Подсвечено: ' + cap"><i class="pv__capdot" aria-hidden="true" /><span class="pv__capt">{{ cap }}</span></span>
      </Transition>
      <div class="pv__grp">
        <button type="button" class="icon-btn icon-btn--sm" :disabled="status !== 'ready' || scale <= STEPS[0]! + 0.01" data-tip="Мельче" aria-label="Мельче" @click="zoomOut">
          <Icon name="zoom-out" :size="17" />
        </button>
        <span class="pv__pct num" aria-live="polite">{{ pct }}</span>
        <button type="button" class="icon-btn icon-btn--sm" :disabled="status !== 'ready' || scale >= STEPS[STEPS.length - 1]! - 0.01" data-tip="Крупнее" aria-label="Крупнее" @click="zoomIn">
          <Icon name="zoom-in" :size="17" />
        </button>
        <button
          type="button" class="btn btn--sm pv__fit" :class="fit ? 'btn--soft' : 'btn--ghost'" :disabled="status !== 'ready'" :aria-pressed="fit"
          data-tip="Страница по ширине окна" @click="setScale('fit')"
        >
          По ширине
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="missing" class="pv__miss" role="status">
        <Icon name="info" :size="16" class="pv__miss-ico" />
        <span class="pv__miss-t">{{ scan ? 'Скан — точное место не найти, открыта нужная страница.' : 'Точное место не нашлось, открыта нужная страница.' }}<template v-if="!scan"> Фраза из статьи: «{{ missing }}»</template></span>
        <button type="button" class="icon-btn icon-btn--sm" data-tip="Скопировать фразу" aria-label="Скопировать фразу" @click="copyQuote">
          <Icon name="copy" :size="16" />
        </button>
        <button type="button" class="icon-btn icon-btn--sm" data-tip="Скрыть" aria-label="Скрыть" @click="missing = null">
          <Icon name="x" :size="15" />
        </button>
      </div>
    </Transition>

    <div ref="scroller" class="pv__scroll" :style="{ '--pad': PAD + 'px' }" @scroll.passive="onScroll">
      <div v-if="status === 'loading'" class="pv__pages" aria-busy="true" aria-label="Загрузка PDF">
        <div v-for="i in fallbackPages" :key="i" class="pv__ph">
          <UiSkeleton variant="block" width="100%" height="100%" />
        </div>
      </div>

      <div v-else-if="status === 'error'" class="pv__err">
        <UiEmpty icon="doc" title="PDF не открылся" :text="errWhy ? `Файл статьи не загрузился: ${errWhy}` : 'Файл статьи не загрузился. Попробуйте ещё раз.'" action="Повторить" action-icon="undo" plain @action="load(src)" />
      </div>

      <div v-else class="pv__pages">
        <div
          v-for="(s, i) in sizes" :key="i" :ref="(el) => shellRef(i + 1, el)" class="pv__page" :data-p="i + 1" :style="shellStyle(s)"
          :aria-label="'Страница ' + (i + 1)"
        >
          <div class="pv__in" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; background: var(--bg-2); }

.pv__bar {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
  height: 44px; padding: 0 var(--s2); background: var(--bg); border-bottom: 1px solid var(--line);
}
.pv__grp { display: flex; align-items: center; gap: 2px; min-width: 0; }
.pv__prev :deep(.ico) { rotate: 180deg; }
.icon-btn:disabled { opacity: 0.35; cursor: default; background: none; }
.pv__pg { display: inline-flex; align-items: center; gap: var(--s1); padding: 0 var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.pv__pin {
  width: 40px; height: 28px; padding: 0 var(--s1); text-align: center; border-radius: var(--r-sm);
  border: 1px solid var(--line-2); background: var(--card); font-size: var(--fs-sm); color: var(--ink);
}
.pv__pin:focus-visible { outline: 2px solid var(--blue); outline-offset: 0; border-color: transparent; }
.pv__of { white-space: nowrap; }
.pv__pct { min-width: 44px; text-align: center; font-size: var(--fs-sm); color: var(--muted); }
.pv__fit { margin-left: var(--s1); }
.pv__fit:disabled { opacity: 0.4; cursor: default; }

.pv__miss {
  position: absolute; z-index: var(--z-sticky); top: calc(44px + var(--s2)); left: 50%; translate: -50% 0; width: min(560px, calc(100% - var(--s4)));
  display: flex; align-items: center; gap: var(--s2); padding: var(--s1) var(--s1) var(--s1) var(--s3);
  border-radius: var(--r); background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line); font-size: var(--fs-sm);
}
.pv__miss-ico { color: var(--muted); }
.pv__cap {
  flex: 0 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: var(--s2); padding: 0 var(--s2);
  font-size: var(--fs-sm); font-weight: 600; color: var(--ink); white-space: nowrap; overflow: hidden;
}
.pv__capt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pv__capdot { flex: none; width: 10px; height: 10px; border-radius: 2px; background: color-mix(in srgb, var(--blue) 30%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--blue) 55%, transparent); }
.pv__miss-t { flex: 1; min-width: 0; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.pv__scroll {
  position: relative;
  flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; touch-action: pan-x pan-y pinch-zoom;
}
.pv__pages { display: flex; flex-direction: column; align-items: center; gap: var(--pad); padding: var(--pad); width: max-content; min-width: 100%; }
.pv__page {
  position: relative; flex: none; background: var(--paper); border-radius: var(--r-xs);
  box-shadow: 0 0 0 1px var(--line), var(--shadow);
}
.pv__in { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.pv__ph { width: min(720px, 100%); aspect-ratio: 1 / 1.414; }

.pv__err { display: grid; place-content: center; min-height: 100%; padding: var(--s4); }

@media (max-width: 768px) {
  .pv__bar { height: 48px; padding: 0 var(--s2) 0 var(--s1); }
  .pv__pct { display: none; }
  .pv__miss { top: calc(48px + var(--s2)); }
  .pv__bar { flex-wrap: wrap; height: auto; min-height: 48px; row-gap: 0; }
  .pv__bar > .pv__grp { height: 48px; }
  .pv__cap { order: 3; flex: 1 1 100%; height: 28px; padding: 0 var(--s2) var(--s1); font-size: var(--fs-xs); }
}
</style>

<style>
.pv__cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.pv__in .textLayer {
  position: absolute; inset: 0; overflow: clip; opacity: 1; line-height: 1; text-align: initial; z-index: 1;
  -webkit-text-size-adjust: none; text-size-adjust: none; forced-color-adjust: none; transform-origin: 0 0; caret-color: CanvasText;
}
.pv__in .textLayer :is(span, br) { color: transparent; position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; }
.pv__in .textLayer span.markedContent { top: 0; height: 0; }
.pv__in .textLayer ::selection { background: color-mix(in srgb, var(--blue) 30%, transparent); }
.pv__in .textLayer br::selection { background: transparent; }
.pv__in .textLayer .endOfContent { display: block; position: absolute; inset: 100% 0 0; z-index: 0; cursor: default; user-select: none; }
.pv__in .textLayer.selecting .endOfContent { top: 0; }
.hiddenCanvasElement { position: absolute; top: 0; left: 0; width: 0; height: 0; display: none; }
.pv__hl { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.pv__mark {
  position: absolute; border-radius: var(--r-xs); background: color-mix(in srgb, var(--blue) 26%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--blue) 45%, transparent); mix-blend-mode: multiply;
  animation: pv-pulse calc(var(--t-slow) * 4) var(--ease) 1 both;
}
.pv__tag {
  position: absolute; padding: 2px var(--s2); border-radius: var(--r-xs); white-space: nowrap;
  font: 600 var(--fs-xs)/1.4 var(--font); color: var(--paper); background: var(--blue); box-shadow: var(--shadow);
  animation: pv-tag var(--t-slow) var(--ease) both, pv-tag-out var(--t-slow) ease 4s forwards;
}
.pv__tag.is-wrap { white-space: normal; overflow-wrap: normal; text-align: right; line-height: 1.3; }
.pv__tag[hidden] { display: none; }
@keyframes pv-pulse {
  0% { opacity: 0; box-shadow: 0 0 0 0 color-mix(in srgb, var(--blue) 60%, transparent); }
  25% { opacity: 1; box-shadow: 0 0 0 6px color-mix(in srgb, var(--blue) 25%, transparent); }
  100% { opacity: 1; box-shadow: 0 0 0 1px color-mix(in srgb, var(--blue) 45%, transparent); }
}
@keyframes pv-tag { from { opacity: 0; translate: 0 2px; } }
:root[data-theme='dark'] .pv__page { filter: brightness(0.78) contrast(0.96); }
@keyframes pv-tag-out { to { opacity: 0; visibility: hidden; } }
@media (prefers-reduced-motion: reduce) { .pv__mark, .pv__tag { animation-duration: 1ms; } }
</style>
