<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GraphCanvas from './GraphCanvas.vue'
import GraphTimeline from './GraphTimeline.vue'
import Icon from './Icon.vue'
import UiSplit from './UiSplit.vue'
import { citedBy, entitiesOf, refNodeId, whereUsed } from '../graph'
import { refIdLabel, refUrl, referencesOf } from '../refs'
import { plural } from '../search'
import { scrollWithin } from '../scroll'
import { chatOfPaper, paperOf, state } from '../store'
import { openDeep, useScrollMemory, useViewState } from '../viewState'

const props = defineProps<{ paperId: string; selected?: string | null; hideGraph?: boolean }>()
const emit = defineEmits<{ select: [id: string | null] }>()
const router = useRouter()
const GraphFull = defineAsyncComponent(() => import('./GraphFull.vue'))
const full = ref(false)
const fullFocus = ref<string | null>(null)
const openFull = (id: string | null = null) => { fullFocus.value = id; full.value = true }

const paper = computed(() => paperOf(props.paperId))
const refs = computed(() => referencesOf(props.paperId))
const cited = computed(() => citedBy(props.paperId).map((p) => {
  const key = 'p:' + (paper.value?.seed ?? props.paperId)
  const ref = referencesOf(p.id).find((r) => r.key === key)
  return { paper: p, mentions: ref?.mentions ?? [] }
}))
const ents = computed(() => (paper.value ? entitiesOf(paper.value) : []).map((m) => ({ m, used: whereUsed(m.id) })))
const unparsed = computed(() => refs.value.filter((r) => r.status === 'unparsed').length)

type Tab = 'refs' | 'cited' | 'ents'
const ui = useViewState('links', () => ({ tab: '' as Tab | '', sel: null as string | null, open: [] as number[] }))
const tab = computed<Tab>({
  get: () => ui.tab || (cited.value.length ? 'cited' : 'refs'),
  set: (v) => (ui.tab = v),
})
const tabs = computed<{ id: Tab; label: string; n: number }[]>(() => [
  { id: 'cited', label: 'Цитируют', n: cited.value.length },
  { id: 'refs', label: state.mobile ? 'Ссылки' : 'Ссылается на', n: refs.value.length },
  { id: 'ents', label: state.mobile ? 'Общее' : props.hideGraph ? 'Методы' : 'Методы и материалы', n: ents.value.length },
])

const sel = toRef(ui, 'sel')
if (props.selected) sel.value = props.selected
const open = computed(() => new Set(ui.open))
const list = ref<HTMLElement | null>(null)
useScrollMemory(list, 'links-list')
watch(() => props.selected, (v) => { if (v !== sel.value) pick(v ?? null, false) })
watch(() => props.paperId, () => { sel.value = null; ui.tab = ''; ui.open = [] })

function pick(id: string | null, fromList = true) {
  sel.value = id
  if (fromList) emit('select', id)
  if (!id) return
  if (refs.value.some((r) => refNodeId(props.paperId, r) === id)) tab.value = 'refs'
  else if (cited.value.some((c) => c.paper.id === id)) tab.value = 'cited'
  else if (id.startsWith('e:')) tab.value = 'ents'
  void nextTick(() => scrollWithin(list.value, list.value?.querySelector(`[data-row="${CSS.escape(id)}"]`), 'nearest'))
}
function toggleRef(n: number, id: string) {
  const s = new Set(ui.open)
  if (s.has(n) && sel.value === id) s.delete(n)
  else s.add(n)
  ui.open = [...s]
  pick(id)
}

const mobOpen = ref(new Set<string>())
function toggleM(key: string) {
  const s = new Set(mobOpen.value)
  if (!s.delete(key)) s.add(key)
  mobOpen.value = s
}
const isOpenM = (key: string) => !state.mobile || mobOpen.value.has(key)
const ORDER: Tab[] = ['cited', 'refs', 'ents']
let tx = 0, ty = 0
const swStart = (e: TouchEvent) => { tx = e.touches[0]!.clientX; ty = e.touches[0]!.clientY }
function swEnd(e: TouchEvent) {
  if (!state.mobile) return
  const t = e.changedTouches[0]!
  const dx = t.clientX - tx, dy = t.clientY - ty
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return
  const n = ORDER[ORDER.indexOf(tab.value) + (dx < 0 ? 1 : -1)]
  if (n) tab.value = n
}

const chatId = (id: string) => chatOfPaper(id)?.id
const goPaper = (id: string) => { const c = chatId(id); if (c) openDeep(router, '/c/' + c) }
const goFull = () => openDeep(router, { path: '/graph', query: { root: props.paperId, ...(sel.value ? { focus: sel.value } : {}) } })
const idLabel = (r: { doi?: string; arxiv?: string; key: string }) => (r.key.startsWith('p:') ? 'в коллекции' : refIdLabel(r))
</script>

<template>
  <div class="pl" :class="{ ph: state.mobile, 'pl--scroll': state.mobile && !hideGraph }">
    <UiSplit id="paper-links" dir="col" sized="start" :initial="320" :min="140" :max="560" collapsible label="Граф" :disabled="hideGraph || state.mobile" class="pl__split">
    <template #start>
    <div v-if="!hideGraph && state.mobile" class="pl__mg">
      <GraphTimeline :collection="paper?.collection ?? state.collection" :root="paperId" :selected="sel" :max-height="460" @open="openFull($event)" />
      <button type="button" class="pl__fs" aria-label="Граф на весь экран" @click="openFull(null)"><Icon name="arrow-up-right" :size="18" /></button>
    </div>
    <div v-else-if="!hideGraph" class="pl__graph">
      <div class="pl__canvas"><GraphCanvas state-key="links" :collection="paper?.collection ?? state.collection" :root="paperId" compact legend height="100%" :selected="sel" @select="pick($event)" @expand="goFull" /></div>
    </div>
    </template>
    <template #end>
    <div class="pl__rest">
    <div class="pl__tabs">
      <div class="seg" role="tablist" aria-label="Связи статьи">
        <button v-for="t in tabs" :key="t.id" role="tab" :class="{ on: tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id">
          {{ t.label }}<span class="seg__n num">{{ t.n }}</span>
        </button>
      </div>
    </div>

    <div ref="list" class="pl__list" @touchstart.passive="swStart" @touchend.passive="swEnd">
      <template v-if="tab === 'refs'">
        <p v-if="!refs.length" class="pl__empty">Для этой статьи список литературы не извлечён.</p>
        <template v-else>
          <p class="pl__sum">
            {{ refs.length }} {{ plural(refs.length, ['ссылка', 'ссылки', 'ссылок']) }}<template v-if="unparsed">, {{ unparsed }} не {{ plural(unparsed, ['распознана', 'распознаны', 'распознано']) }}</template>
          </p>
          <ul class="rl">
            <li v-for="r in refs" :key="r.n" class="rl__item" :class="{ on: sel === refNodeId(paperId, r) }" :data-row="refNodeId(paperId, r)">
              <button class="rl__head" :aria-expanded="open.has(r.n)" @click="toggleRef(r.n, refNodeId(paperId, r))">
                <span class="rl__n num">[{{ r.n }}]</span>
                <span class="rl__body">
                  <span class="rl__t">{{ r.title }}</span>
                  <span v-if="r.status === 'ok'" class="rl__m">{{ r.authors }} · {{ r.year }}<template v-if="r.venue"> · {{ r.venue }}</template></span>
                  <span v-else class="rl__m">строка из PDF, парсер не смог разобрать</span>
                </span>
                <Icon name="chevron-down" :size="14" class="rl__chev" :class="{ up: open.has(r.n) }" />
              </button>
              <div v-if="r.status === 'unparsed'" class="rl__meta"><span class="rl__st bad"><i class="dot dot--warn" />не распознан</span></div>
              <div v-if="open.has(r.n)" class="rl__meta rl__meta--det">
                <a v-if="refUrl(r)" class="rl__id" :href="refUrl(r)!" target="_blank" rel="noopener">{{ idLabel(r) }}</a>
                <span v-else class="rl__id">{{ idLabel(r) }}</span>
                <span class="rl__mc">упомянуто {{ r.mentions.length }}×</span>
              </div>
              <div v-if="open.has(r.n)" class="rl__ctx">
                <blockquote v-for="(m, i) in r.mentions" :key="i">{{ m }}</blockquote>
              </div>
            </li>
          </ul>
        </template>
      </template>

      <template v-else-if="tab === 'cited'">
        <p v-if="!cited.length" class="pl__empty">Эту статью пока не цитирует ни одна статья коллекции.</p>
        <ul v-else class="rl">
          <li v-for="c in cited" :key="c.paper.id" class="rl__item" :class="{ on: sel === c.paper.id }" :data-row="c.paper.id">
            <button class="rl__head" :aria-expanded="state.mobile ? isOpenM('c:' + c.paper.id) : undefined" @click="state.mobile && toggleM('c:' + c.paper.id); pick(c.paper.id)">
              <span class="rl__body">
                <span class="rl__t">{{ c.paper.title }}</span>
                <span class="rl__m">{{ c.paper.authors }} · {{ c.paper.year }}</span>
              </span>
              <Icon v-if="state.mobile" name="chevron-down" :size="14" class="rl__chev" :class="{ up: isOpenM('c:' + c.paper.id) }" />
            </button>
            <div v-if="isOpenM('c:' + c.paper.id)" class="rl__ctx"><blockquote v-for="(m, i) in c.mentions.slice(0, 2)" :key="i">{{ m }}</blockquote></div>
            <div v-if="isOpenM('c:' + c.paper.id)" class="rl__meta"><button class="olink" :disabled="!chatId(c.paper.id)" @click="goPaper(c.paper.id)">Открыть статью<Icon name="arrow-up-right" :size="14" /></button></div>
          </li>
        </ul>
      </template>

      <template v-else>
        <p v-if="!ents.length" class="pl__empty">Материалы и методы в этой статье не найдены.</p>
        <ul v-else class="rl">
          <li v-for="e in ents" :key="e.m.id" class="rl__item" :class="{ on: sel === 'e:' + e.m.id }" :data-row="'e:' + e.m.id">
            <button class="rl__head" :aria-expanded="state.mobile ? isOpenM('e:' + e.m.id) : undefined" @click="state.mobile && toggleM('e:' + e.m.id); pick('e:' + e.m.id)">
              <span class="rl__body">
                <span class="rl__t">{{ e.m.canon }}</span>
                <span class="rl__m">{{ e.m.name }} · в {{ e.used.length }} {{ plural(e.used.length, ['статье', 'статьях', 'статьях']) }} коллекции</span>
              </span>
              <Icon v-if="state.mobile" name="chevron-down" :size="14" class="rl__chev" :class="{ up: isOpenM('e:' + e.m.id) }" />
            </button>
            <ul v-if="isOpenM('e:' + e.m.id)" class="rl__where">
              <li v-for="u in e.used" :key="u.paper.id">
                <button :disabled="!chatId(u.paper.id)" @click="goPaper(u.paper.id)">
                  <span class="rl__wt">{{ u.paper.title }}<em v-if="u.paper.id === paperId"> · эта статья</em></span>
                  <span class="rl__wv num">{{ u.best ?? '—' }}</span>
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </template>
    </div>
    </div>
    </template>
    </UiSplit>
    <GraphFull v-if="full" :collection="paper?.collection ?? state.collection" :root="paperId" :focus="fullFocus" @close="full = false" />
  </div>
</template>

<style scoped>
.pl { container-type: inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; background: var(--bg); color: var(--ink); }
.pl__split.pl__split.pl__split :deep(.spl__bar) { width: auto; height: 1px; cursor: row-resize; }
.pl__split.pl__split.pl__split :deep(.spl__bar::before) { inset: -5px 0; }
.pl__split.pl__split.pl__split :deep(.spl__grip) { width: 32px; height: 4px; }
.pl__split.pl__split.pl__split :deep(.spl__tab) { left: 50%; right: auto; top: auto; translate: -50% 0; writing-mode: horizontal-tb; padding: var(--s2); }
.pl__split.pl__split.pl__split :deep(.spl__tab--start) { top: 4px; }
.pl .pl__split { flex: 1 1 0; height: auto; }
.pl__rest { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pl__graph { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.pl__canvas { flex: 1; min-height: 0; position: relative; }
.pl__tabs { flex: none; display: flex; align-items: center; min-height: 44px; padding: var(--s2) var(--s4) var(--s2) var(--s5); border-bottom: 1px solid var(--line); min-width: 0; }
.pl__tabs::-webkit-scrollbar { display: none; }
.pl__full { flex: none; margin-left: auto; }
@container (max-width: 560px) { .pl__fl { display: none; }  }
.pl__list { flex: 1; min-height: 0; overflow: auto; padding: var(--s4) var(--s5) var(--s6); }
.pl__sum { font-size: var(--fs-sm); color: var(--muted); padding: 0 var(--s1) var(--s2); }
.pl__empty { padding: var(--s8) var(--s2); text-align: center; color: var(--muted); font-size: var(--fs-body); }
.rl { list-style: none; padding: 0; display: grid; }
.rl__item { border-bottom: 1px solid var(--line); padding: 4px 4px 8px; min-width: 0; transition: background-color var(--t); }
.rl__item:last-child { border-bottom: 0; }
.rl__item.on { background: var(--bg-2); border-radius: var(--r); }
.rl__head { display: flex; gap: 8px; align-items: flex-start; width: 100%; padding: 8px 8px 4px; border-radius: var(--r-sm); min-width: 0; }
.rl__n { flex: none; color: var(--muted); font-size: var(--fs-sm); padding-top: 1px; min-width: 26px; }
.rl__body { flex: 1; min-width: 0; display: grid; gap: 2px; }
.rl__t { font-size: var(--fs-body); line-height: 1.35; font-weight: 500; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.rl__m { font-size: var(--fs-xs); color: var(--muted); overflow-wrap: anywhere; }
.rl__chev { flex: none; color: var(--faint); margin-top: 3px; transition: rotate var(--t); }
.rl__chev.up { rotate: 180deg; }
.rl__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 2px 8px 0 42px; font-size: var(--fs-xs); color: var(--muted); }
.rl__st { display: inline-flex; align-items: center; gap: 6px; }
.rl__st.bad { color: var(--ink-2); }
.rl__id { color: var(--muted); overflow-wrap: anywhere; min-width: 0; }
a.rl__id:hover { color: var(--blue); text-decoration: underline; }
.rl__mc { margin-left: auto; }
.rl__ctx { display: grid; gap: 6px; padding: 8px 8px 0 42px; }
.rl__ctx blockquote { margin: 0; padding: 6px 10px; border-left: 2px solid var(--line-2); font-size: var(--fs-sm); line-height: 1.45; color: var(--ink-2); background: var(--bg-2); border-radius: 0 var(--r-sm) var(--r-sm) 0; }
.rl__where { list-style: none; padding: 4px 8px 0; display: grid; gap: 2px; }
.rl__where button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 6px 8px; border-radius: var(--r-sm); font-size: var(--fs-sm); min-width: 0; }
.rl__where button:hover:not(:disabled) { background: var(--bg-2); }
.rl__wt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rl__wt em { font-style: normal; color: var(--muted); }
.rl__wv { flex: none; color: var(--muted); }

.olink { justify-self: start; display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--fs-sm); font-weight: 500; color: var(--blue); }
.olink:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 3px; }
.olink:disabled { color: var(--faint); }
.ph .olink { min-height: 44px; }
.ph .rl__head { min-height: 44px; }
.ph .pl__tabs { display: block; min-height: 0; margin: var(--s3) var(--s4) 0; padding: 0; border: 0; }
.ph .pl__tabs .seg { display: flex; width: 100%; }
.ph .pl__tabs .seg > button { flex: 1 1 0; }
.ph .pl__list { padding: var(--s2) var(--s4) calc(var(--s6) + var(--safe-b)); }
.ph .rl__item { padding: 2px 0 4px; }
.ph .rl__head { min-height: 56px; align-items: center; }
.ph .rl__t { -webkit-line-clamp: 2; line-clamp: 2; }
.ph .rl__m { font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ph .rl__n { display: none; }
.ph .rl__chev { margin-top: 0; }
.ph .rl__meta, .ph .rl__ctx { padding-left: 8px; }
.pl--scroll { display: block; height: 100%; overflow-y: auto; overscroll-behavior: contain; }
.ph :deep(.spl__pane) { display: block; overflow: visible; flex: none; }
.ph .pl__rest { display: block; }
.ph .pl__list { overflow: visible; }
.pl.ph:not(.pl--scroll) { display: block; height: auto; overflow: visible; }
.pl__mg { position: relative; border-bottom: 1px solid var(--line); }
.pl__fs { position: absolute; bottom: 10px; right: 10px; z-index: 2; width: 44px; height: 44px; display: grid; place-items: center; border-radius: var(--r-pill); background: var(--card); box-shadow: 0 0 0 1px var(--line-2), 0 2px 8px rgb(0 0 0 / 0.1); }
.ph .rl__where button { min-height: 44px; align-items: center; }
</style>
