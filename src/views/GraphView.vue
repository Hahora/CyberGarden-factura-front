<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import CaseGraph from '../components/CaseGraph.vue'
import DataPage from '../components/DataPage.vue'
import Icon from '../components/Icon.vue'
import UiEmpty from '../components/UiEmpty.vue'
import { CLASS_RU, inScope, paperPath, publication, ragInScope, ragPublication, type Domain } from '../case'
import { EDGE_KINDS, EDGE_RU, citedOf, graphData, paperClass, ragGraphData, ragRelatedPapers, relatedPapers, type EdgeKind, type LinkEdge, type LinkNode } from '../case/links'
import { dataDomain, dataPids, useDataReady } from '../dataTabs'
import { plural } from '../search'
import { state } from '../store'
import { useViewState } from '../viewState'

const router = useRouter()
const ui = useViewState('graph-case', () => ({
  kinds: ['class', 'absorber'] as EdgeKind[],
  rkinds: ['dataset', 'generator', 'embedding', 'retriever'] as EdgeKind[],
  sel: null as string | null,
  hl: null as string | null,
  view: 'list' as 'list' | 'graph',
  full: false,
}))

const domain = computed<Domain>(() => dataDomain.value)
const isRag = computed(() => domain.value === 'rag')
const pub = (pid: string) => (isRag.value ? ragPublication(pid) : publication(pid))
const pids = computed(() => dataPids.value.filter((p) => pub(p) && (isRag.value ? ragInScope(p) : inScope(p))))
const ready = useDataReady(pids)
const all = computed(() => (isRag.value ? (ready.value ? ragGraphData(pids.value) : { nodes: [], edges: [] }) : graphData(pids.value)))
const year = (pid: string) => pub(pid)?.year ?? ''
const KINDS = computed<EdgeKind[]>(() => EDGE_KINDS[domain.value])
const kindsOn = computed<EdgeKind[]>(() => (isRag.value ? ui.rkinds : ui.kinds))

const edges = computed<LinkEdge[]>(() => all.value.edges.filter((e) => kindsOn.value.includes(e.kind)))
const nodes = computed<LinkNode[]>(() => {
  const used = new Set(edges.value.flatMap((e) => [e.from, e.to]))
  return all.value.nodes.filter((n) => n.kind === 'paper' || used.has(n.id))
})
const byId = computed(() => new Map(all.value.nodes.map((n) => [n.id, n])))
const titles = computed(() => Object.fromEntries(pids.value.map((p) => [p, `${p} · ${year(p)}`])))
const count = (k: EdgeKind) => all.value.edges.filter((e) => e.kind === k).length
function toggle(k: EdgeKind) {
  const cur = kindsOn.value
  const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]
  if (isRag.value) ui.rkinds = next
  else ui.kinds = next
}
watch(nodes, (ns) => {
  if (ui.sel && !ns.some((n) => n.id === ui.sel)) ui.sel = null
  if (ui.hl && !ns.some((n) => n.id === ui.hl)) ui.hl = null
})

const members = (id: string) => edges.value.filter((e) => e.to === id).map((e) => e.from)
const sel = computed(() => (ui.sel ? byId.value.get(ui.sel) ?? null : null))
const detail = computed(() => {
  const n = sel.value
  if (!n) return null
  if (n.kind === 'paper') {
    return { n, rel: (isRag.value ? ragRelatedPapers(n.id, pids.value) : relatedPapers(n.id, pids.value)).slice(0, 8), cited: isRag.value ? null : citedOf(n.id), links: edges.value.filter((e) => e.from === n.id && e.kind !== 'cited').length }
  }
  return { n, rel: [], papers: members(n.id), cited: null, links: 0 }
})
const ruNode = (s = '') => s.replace(/^ETL /, 'слой переноса электронов ').replace(/^HTL /, 'слой переноса дырок ')
const open = (pid: string) => void router.push(paperPath(pid, domain.value))
function onSelect(id: string | null) { ui.sel = id }
const kindOf = (n: LinkNode): EdgeKind => (n.kind === 'class' ? 'class' : n.kind === 'material' ? 'absorber' : n.kind === 'layer' ? 'layer' : n.kind === 'cited' || n.kind === 'paper' ? 'cited' : n.kind)

const years = computed(() => {
  const m = new Map<string, string[]>()
  for (const p of [...pids.value].sort((a, b) => year(a).localeCompare(year(b)) || a.localeCompare(b))) {
    const y = year(p) || '—'
    m.set(y, [...(m.get(y) ?? []), p])
  }
  return [...m]
})
const chipsOf = (pid: string) => edges.value.filter((e) => e.from === pid).map((e) => ({ id: e.to, kind: e.kind, label: byId.value.get(e.to)?.label ?? e.label }))
const lit = computed(() => (ui.hl ? new Set(members(ui.hl)) : null))
function pickChip(id: string) { ui.hl = ui.hl === id ? null : id }

const CLS: Record<string, string> = { perovskite: 'var(--c1)', kesterite: 'var(--c2)', CIGS: 'var(--c3)', Sb2Se3: 'var(--c4)', CdTe: 'var(--c5)', 'thin-film Si': 'var(--c6)' }
const classes = computed(() => (isRag.value ? [] : [...new Set(pids.value.map(paperClass))]).filter((c) => CLS[c]).map((c) => ({ id: c, label: CLASS_RU[c] ?? c, color: CLS[c]! })))

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && ui.full) ui.full = false }
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const showList = computed(() => state.mobile && ui.view === 'list')
</script>

<template>
  <DataPage title="Связи статей" :loading="!ready" :fill="!state.mobile" :flow="state.mobile">
    <template #toolbar>
      <button
        v-for="k in KINDS" :key="k" type="button" class="chip" :class="{ 'is-on': kindsOn.includes(k) }" :aria-pressed="kindsOn.includes(k)" @click="toggle(k)"
      >
        <i class="gv__l" :class="'k-' + k" aria-hidden="true" />{{ EDGE_RU[k] }}<span class="chip__n num">{{ count(k) }}</span>
      </button>
    </template>
    <template #actions>
      <div v-if="state.mobile" class="seg" role="group" aria-label="Вид">
        <button type="button" :class="{ on: ui.view === 'list' }" :aria-pressed="ui.view === 'list'" @click="ui.view = 'list'">По годам</button>
        <button type="button" :class="{ on: ui.view === 'graph' }" :aria-pressed="ui.view === 'graph'" @click="ui.view = 'graph'">Граф</button>
      </div>
      <button v-if="!showList" type="button" class="btn btn--soft btn--sm" @click="ui.full = true"><Icon name="maximize" :size="16" />Во весь экран</button>
    </template>

    <UiEmpty v-if="!pids.length" icon="graph" title="Связей пока нет" text="Они появятся, когда статьи будут разобраны." />

    <div v-else-if="showList" class="tl">
      <section v-for="[y, ps] in years" :key="y" class="tl__y">
        <h2 class="tl__h num">{{ y }}</h2>
        <article v-for="p in ps" :key="p" class="tl__c card" :class="{ dim: lit && !lit.has(p), lit: lit && lit.has(p) }">
          <button type="button" class="tl__top" @click="open(p)">
            <i class="tl__dot" :style="{ background: isRag ? 'var(--ink-2)' : (CLS[paperClass(p)] ?? 'var(--muted)') }" aria-hidden="true" />
            <b class="num">{{ p }}</b><span class="tl__t">{{ pub(p)?.title }}</span>
          </button>
          <div v-if="chipsOf(p).length" class="tl__chips">
            <button v-for="c in chipsOf(p)" :key="c.id" type="button" class="chip chip--soft" :class="{ 'is-on': ui.hl === c.id }" :aria-pressed="ui.hl === c.id" @click="pickChip(c.id)"><span class="chip__t">{{ ruNode(byId.get(c.id)?.label) }}</span></button>
          </div>
        </article>
      </section>
    </div>

    <Teleport v-else to="body" :disabled="!ui.full">
    <div class="gv" :class="{ 'is-full': ui.full, 'gv--m': state.mobile }">
      <div class="gv__main card">
        <div class="gv__graph">
          <CaseGraph :nodes="nodes" :edges="edges" :titles="titles" :selected="ui.sel" :domain="domain" @select="onSelect" />
          <button v-if="ui.full" type="button" class="icon-btn gv__x" aria-label="Закрыть" @click="ui.full = false"><Icon name="x" :size="18" /></button>
        </div>
        <p class="lg" aria-hidden="true">
          <span v-for="c in classes" :key="c.id"><i class="lg__dot" :style="{ background: c.color }" />{{ c.label }}</span>
          <template v-if="isRag">
            <span><i class="lg__dot" style="background: var(--ink-2)" />статья</span>
            <span><i class="lg__sq lg__sq--c" />датасет</span>
            <span><i class="lg__sq lg__sq--m" />генератор</span>
            <span><i class="lg__sq lg__sq--l" />эмбеддинги</span>
            <span><i class="lg__sq lg__sq--q" />ретривер</span>
          </template>
          <template v-else>
            <span><i class="lg__sq lg__sq--c" />класс</span>
            <span><i class="lg__sq lg__sq--m" />поглотитель</span>
            <span><i class="lg__sq lg__sq--l" />слой</span>
            <span><i class="lg__sq lg__sq--q" />цитируемая работа</span>
          </template>
        </p>
      </div>
      <aside class="gv__side card">
        <template v-if="detail && detail.n.kind === 'paper'">
          <h2 class="gv__t">{{ detail.n.id }} · {{ year(detail.n.id) }}</h2>
          <p class="gv__m">{{ pub(detail.n.id)?.title }}</p>
          <button type="button" class="btn btn--dark btn--sm" @click="open(detail.n.id)">Открыть статью<Icon name="arrow-right" :size="14" /></button>
          <h3 class="gv__s">Общее с другими<span class="num">{{ detail.rel.length }}</span></h3>
          <p v-if="!detail.rel.length" class="gv__m">Нет общих данных.</p>
          <button v-for="r in detail.rel" :key="r.pid" type="button" class="gv__row" @click="onSelect(r.pid)">
            <b class="num">{{ r.pid }}</b><span class="gv__rt">{{ r.shared.slice(0, 3).map((s) => s.label).join(' · ') }}</span>
          </button>
          <template v-if="detail.cited && detail.cited.count"><h3 class="gv__s">Цитируемые работы</h3><p class="gv__m">{{ detail.cited.text }}</p></template>
        </template>
        <template v-else-if="detail && detail.n.kind !== 'paper'">
          <h2 class="gv__t">{{ ruNode(detail.n.label) }}</h2>
          <p class="gv__m">{{ EDGE_RU[kindOf(detail.n)] }} · {{ detail.papers?.length }} {{ plural(detail.papers?.length ?? 0, ['статья', 'статьи', 'статей']) }}</p>
          <button v-for="p in detail.papers" :key="p" type="button" class="gv__row" @click="open(p)">
            <b class="num">{{ p }}</b><span class="gv__rt">{{ pub(p)?.title }}</span>
          </button>
        </template>
        <template v-else>
          <h2 class="gv__t">{{ pids.length }} {{ plural(pids.length, ['статья', 'статьи', 'статей']) }}</h2>
          <p class="gv__m">Нажмите на статью — увидите, что у неё общего с другими.</p>
          <ul class="gv__sum">
            <li v-for="k in KINDS" :key="k"><span>{{ EDGE_RU[k] }}</span><b class="num">{{ edges.filter((e) => e.kind === k).length }}</b></li>
          </ul>
        </template>
      </aside>
    </div>
    </Teleport>
  </DataPage>
</template>

<style scoped>
.gv__l { width: 18px; height: 0; border-top: 2px solid currentColor; }
.gv__l.k-layer { border-top-width: 1px; }
.gv__l.k-class { border-top-style: dashed; }
.gv__l.k-cited, .gv__l.k-retriever { border-top-style: dotted; }
.gv__l.k-embedding { border-top-style: dashed; border-top-width: 1px; }
.gv__load { display: grid; gap: var(--s3); }
.gv__load p { font-size: var(--fs-sm); color: var(--muted); }

.gv { flex: 1; min-height: 0; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) 20rem; gap: var(--s4); padding-bottom: var(--s4); }
.gv__main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; }
.gv__graph { position: relative; flex: 1; min-height: 0; }
.gv__x { position: absolute; left: var(--s2); top: var(--s2); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.gv__side { min-height: 0; overflow: auto; padding: var(--s4); overscroll-behavior: contain; }
.gv.is-full { position: fixed; inset: 0; z-index: var(--z-full); background: var(--bg); padding: var(--s4); }
.gv__t { font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.gv__m { margin: 2px 0 var(--s3); font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
.gv__s { display: flex; gap: var(--s2); align-items: baseline; margin: var(--s4) 0 var(--s1); font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
.gv__row { display: flex; gap: var(--s3); align-items: baseline; width: calc(100% + var(--s3)); margin: 0 calc(-1 * var(--s2)); padding: var(--s2); min-height: 36px; border-radius: var(--r-sm); text-align: left; font-size: var(--fs-sm); line-height: 1.35; }
.gv__row:hover { background: var(--bg-2); }
.gv__row b { flex: none; }
.gv__rt { min-width: 0; color: var(--ink-2); overflow-wrap: anywhere; }
.gv__sum { list-style: none; padding: 0; margin: var(--s3) 0 0; display: grid; gap: var(--s2); font-size: var(--fs-sm); }
.gv__sum li { display: flex; justify-content: space-between; gap: var(--s3); color: var(--muted); }
.gv__sum b { color: var(--ink); font-weight: 600; }

.lg { flex: none; display: flex; flex-wrap: wrap; gap: var(--s1) var(--s3); padding: var(--s2) var(--s3); border-top: 1px solid var(--line); font-size: var(--fs-xs); color: var(--muted); }
.lg span { display: inline-flex; align-items: center; gap: var(--s1); white-space: nowrap; }
.lg__dot { width: var(--s2); height: var(--s2); border-radius: 50%; }
.lg__sq { width: var(--s2); height: var(--s2); box-shadow: inset 0 0 0 1.5px var(--muted); }
.lg__sq--c { border-radius: var(--r-xs); }
.lg__sq--m { transform: rotate(45deg) scale(0.9); }
.lg__sq--l { border-radius: 1px; background: var(--bg-2); }
.lg__sq--q { border-radius: 50%; border: 1.5px dotted var(--muted); box-shadow: none; }
.gv--m { display: block; padding: 0; }
.gv--m .gv__graph { flex: none; height: 60dvh; min-height: 340px; }
.gv--m .gv__side { margin-top: var(--s3); }
.gv--m .gv__row { min-height: 44px; }
.gv--m.is-full { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
.gv--m.is-full .gv__graph { height: auto; min-height: 0; flex: 1; }
.gv--m.is-full .gv__side { max-height: 30dvh; margin: 0; }
.tl { display: grid; gap: var(--s4); min-width: 0; }
.tl__y { display: grid; gap: var(--s2); min-width: 0; }
.tl__h { font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
.tl__c { display: grid; gap: var(--s2); padding: var(--s3); min-width: 0; transition: opacity var(--t), box-shadow var(--t); }
.tl__c.dim { opacity: 0.35; }
.tl__c.lit { box-shadow: inset 0 0 0 1.5px var(--blue); }
.tl__top { display: flex; min-height: 44px; align-items: center; gap: var(--s2); text-align: left; font-size: var(--fs-sm); line-height: 1.35; min-width: 0; }
.tl__top b { flex: none; }
.tl__t { min-width: 0; color: var(--ink-2); overflow-wrap: anywhere; }
.tl__dot { flex: none; width: var(--s2); height: var(--s2); border-radius: 50%; translate: 0 1px; }
.tl__chips { display: flex; flex-wrap: wrap; gap: var(--s2); }

@media (max-width: 1000px) and (min-width: 769px) {
  .gv { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) 200px; }
}
</style>
