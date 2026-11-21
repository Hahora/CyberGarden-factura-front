<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GraphTimeline from './GraphTimeline.vue'
import Icon from './Icon.vue'
import PaperLinks from './PaperLinks.vue'
import { buildGraph, citedBy } from '../graph'
import { EXT_ID, shortTitle } from '../graphTimeline'
import { referencesOf } from '../refs'
import { chatOfPaper, paperOf } from '../store'
import { openDeep } from '../viewState'
import type { CollectionId } from '../data'

const props = defineProps<{ collection: CollectionId; root: string; focus?: string | null }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()

const rootId = ref(props.root)
const sel = ref<string | null>(props.focus && (props.focus === EXT_ID || paperOf(props.focus)) ? props.focus : null)
const canvas = ref<InstanceType<typeof GraphTimeline>>()

const paper = computed(() => paperOf(rootId.value))
const detailPaper = computed(() => (sel.value && sel.value !== EXT_ID ? paperOf(sel.value) : null))
const externals = computed(() => referencesOf(rootId.value).filter((r) => !r.key.startsWith('p:')))
const nCited = computed(() => citedBy(rootId.value).length)
const nRefs = computed(() => referencesOf(rootId.value).length)
const known = computed(() => new Set(buildGraph(props.collection).nodes.map((n) => n.id)))

type Snap = 'peek' | 'half' | 'full'
const vh = ref(window.innerHeight)
const onResize = () => (vh.value = window.innerHeight)
const PEEK = 112
const heights = computed(() => ({ peek: PEEK, half: Math.round(vh.value * 0.46), full: Math.round(vh.value * 0.9) }))
const snap = ref<Snap>(sel.value ? 'half' : 'peek')
const dragVis = ref<number | null>(null)
const vis = computed(() => dragVis.value ?? heights.value[snap.value])
const inset = computed(() => Math.min(heights.value.half, snap.value === 'full' ? heights.value.half : vis.value))
let drag: { y0: number; v0: number; t: number; lastY: number; lastT: number; moved: boolean } | null = null
function hDown(e: PointerEvent) {
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  drag = { y0: e.clientY, v0: vis.value, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp, moved: false }
}
function hMove(e: PointerEvent) {
  if (!drag) return
  if (!drag.moved && Math.abs(e.clientY - drag.y0) > 6) drag.moved = true
  if (!drag.moved) return
  dragVis.value = Math.max(PEEK - 10, Math.min(heights.value.full, drag.v0 - (e.clientY - drag.y0)))
  drag.lastY = e.clientY
  drag.lastT = e.timeStamp
}
function hUp(e: PointerEvent) {
  const d = drag
  drag = null
  if (!d) return
  if (!d.moved) { snap.value = snap.value === 'peek' ? 'half' : snap.value === 'half' ? 'peek' : 'half'; dragVis.value = null; return }
  const v = (d.y0 - e.clientY) / Math.max(1, e.timeStamp - d.t)
  const proj = (dragVis.value ?? d.v0) + v * 180
  const h = heights.value
  snap.value = (['peek', 'half', 'full'] as Snap[]).reduce((a, b) => (Math.abs(h[b] - proj) < Math.abs(h[a] - proj) ? b : a))
  dragVis.value = null
}

function pick(id: string | null) {
  sel.value = id
  if (id) { if (snap.value === 'peek') snap.value = 'half' } else snap.value = 'peek'
}
function fromList(id: string | null) {
  if (!id) return pick(null)
  if (id.startsWith('e:')) return
  pick(known.value.has(id) && !id.startsWith('u:') && paperOf(id) ? id : EXT_ID)
  snap.value = 'half'
}
function setCenter(id: string) {
  rootId.value = id
  sel.value = null
  snap.value = 'peek'
}
function openPaper(id: string) {
  const c = chatOfPaper(id)
  if (c) void openDeep(router, '/c/' + c.id)
  emit('close')
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => { document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize); void nextTick(() => document.getElementById('gf-close')?.focus()) })
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) })
watch(() => props.root, (r) => { rootId.value = r; sel.value = null })

const sub = (p: { authors: string; year: number | null }) => [p.authors.split(/[,;]/)[0]?.trim(), p.year].filter(Boolean).join(' · ')
const head = computed(() => {
  if (sel.value === EXT_ID) return { t: `+${externals.value.length} внешних`, s: 'Работы вне коллекции' }
  const p = detailPaper.value ?? paper.value
  return { t: p?.title ?? '', s: p ? sub(p) : '' }
})
</script>

<template>
  <Teleport to="body">
    <div class="gf" role="dialog" aria-modal="true" aria-label="Граф связей">
      <GraphTimeline
        ref="canvas" class="gf__canvas" interactive :collection="collection" :root="rootId" :selected="sel" :inset="inset"
        @select="pick"
      />
      <div class="gf__top">
        <button id="gf-close" type="button" class="gf__fab" aria-label="Закрыть граф" @click="emit('close')"><Icon name="arrow-right" :size="20" style="rotate: 180deg" /></button>
        <span class="gf__chip">{{ shortTitle(paper?.title ?? '', 26) }}</span>
        <button type="button" class="gf__fab" aria-label="Вписать граф" @click="canvas?.reset()"><Icon name="target" :size="20" /></button>
      </div>

      <section class="gf__sheet" :class="{ 'is-drag': dragVis !== null, 'is-full': snap === 'full', 'is-peek': snap === 'peek' }" :style="{ height: heights.full + 'px', transform: `translateY(${heights.full - vis}px)` }">
        <header class="gf__h" @pointerdown="hDown" @pointermove="hMove" @pointerup="hUp" @pointercancel="hUp">
          <i class="gf__grab" aria-hidden="true" />
          <div class="gf__ht">{{ head.t }}</div>
          <div class="gf__hs">{{ head.s }}</div>
          <div v-if="!sel" class="gf__hs">Цитируют {{ nCited }} · Ссылки {{ nRefs }}</div>
        </header>
        <div class="gf__body" :class="{ 'is-scroll': snap === 'full' }">
          <div v-if="sel === EXT_ID" class="gf__ext">
            <div v-for="r in externals" :key="r.n" class="gf__x">
              <span class="gf__xt">{{ r.title }}</span>
              <span class="gf__xm">{{ r.status === 'ok' ? [r.authors.split(/[,;]/)[0]?.trim(), r.year].filter(Boolean).join(' · ') : 'не распознана' }}</span>
            </div>
          </div>
          <div v-else-if="detailPaper" class="gf__act">
            <button class="btn btn--dark gf__btn" :disabled="!chatOfPaper(detailPaper.id)" @click="openPaper(detailPaper.id)">Открыть статью<Icon name="arrow-right" :size="16" /></button>
            <button v-if="detailPaper.id !== rootId" class="btn btn--soft gf__btn" @click="setCenter(detailPaper.id)">В центр</button>
          </div>
          <PaperLinks v-if="sel !== EXT_ID" hide-graph :paper-id="rootId" :selected="sel" @select="fromList" />
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.gf { position: fixed; inset: 0; z-index: 120; background: var(--bg); overflow: hidden; overscroll-behavior: none; }
.gf__top { position: absolute; z-index: 3; top: calc(var(--safe-t) + 10px); left: 12px; right: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; pointer-events: none; }
.gf__top > * { pointer-events: auto; }
.gf__fab { flex: none; width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--r-pill); background: var(--card); box-shadow: 0 0 0 1px var(--line-2), 0 2px 8px rgb(0 0 0 / 0.12); }
.gf__chip { min-width: 0; height: 44px; display: inline-flex; align-items: center; padding: 0 var(--s4); border-radius: var(--r-pill); background: var(--card); box-shadow: 0 0 0 1px var(--line-2), 0 2px 8px rgb(0 0 0 / 0.12); font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.gf__sheet { position: absolute; z-index: 4; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; border-radius: 20px 20px 0 0; background: var(--card); box-shadow: 0 0 0 1px var(--line), 0 -6px 24px rgb(0 0 0 / 0.16); transition: transform 300ms var(--ease); will-change: transform; }
.gf__sheet.is-drag { transition: none; }
.gf__h { flex: none; padding: 8px var(--s5) var(--s3); touch-action: none; cursor: grab; min-height: 112px; }
.gf__sheet:not(.is-peek) .gf__h { min-height: 0; }
.gf__grab { display: block; width: 40px; height: 5px; margin: 0 auto 10px; border-radius: var(--r-pill); background: var(--line-2); }
.gf__sheet.is-peek .gf__ht { -webkit-line-clamp: 1; line-clamp: 1; }
.gf__ht { font-size: 15px; font-weight: 600; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gf__hs { margin-top: 2px; font-size: 13px; color: var(--muted); }
.gf__body { flex: 1; min-height: 0; overflow: hidden; padding: 0 var(--s4) calc(var(--s6) + var(--safe-b)); overscroll-behavior: contain; touch-action: pan-y; }
.gf__body.is-scroll { overflow-y: auto; }
.gf__body :deep(.pl) { background: transparent; }
.gf__act { display: flex; gap: var(--s2); padding: var(--s1) var(--s1) var(--s3); }
.gf__btn { flex: 1; height: 48px; font-size: 15px; }
.gf__ext { display: grid; padding-bottom: var(--s4); }
.gf__x { display: grid; gap: 2px; padding: 10px var(--s1); border-bottom: 1px solid var(--line); }
.gf__xt { font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.gf__xm { font-size: 13px; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .gf__sheet { transition: none; } }
</style>
