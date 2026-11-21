<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import Pipeline from './Pipeline.vue'
import PdfPage from './PdfPage.vue'
import FactsPanel, { type Tab, type Sort } from './FactsPanel.vue'
import Coverage from './Coverage.vue'
import DeviceStack from './DeviceStack.vue'
import PaperLinks from './PaperLinks.vue'
import UiSplit from './UiSplit.vue'
import { COLLECTIONS, paramOf, rowTitle, type Fact } from '../data'
import { accept, acceptMany, chatOf, exportJSON, factOf, factsOf, group, isResolved, issuesFor, openIssues, paperOf, reject, reopenIssue, resolveIssues, restore, state, toast, undo, undone, type Issue, type Resolution } from '../store'
import { plural } from '../search'
import { goBack, backStack, openDeep, useViewState } from '../viewState'
import { mainFactId, sortIssues } from '../norm'
import { matches } from '../keys'

const props = defineProps<{ paperId: string; pane?: 'facts' | 'paper' }>()
const emit = defineEmits<{ 'update:pane': [v: 'facts' | 'paper'] }>()
const route = useRoute()
const router = useRouter()

const factsW = (() => {
  const w = typeof window === 'undefined' ? 1440 : window.innerWidth - 64
  return w <= 1036 ? Math.min(420, Math.max(340, Math.round(w * 0.4))) : Math.min(700, Math.max(400, Math.round(w * 0.38)))
})()
const paper = computed(() => paperOf(props.paperId))
const ready = computed(() => !!paper.value && paper.value.processing >= 100)

const allIssues = computed(() => (paper.value && ready.value ? issuesFor(paper.value) : []))
const issues = computed(() => allIssues.value.filter((i) => !isResolved(i.id)))
const sortedIssues = computed(() => sortIssues(issues.value))
const resolvedIssues = computed(() => sortIssues(allIssues.value.filter((i) => isResolved(i.id))))
const tabIssues = computed(() => [...sortedIssues.value, ...resolvedIssues.value])
const mainOf = (i: Issue) => mainFactId(i)
const issueAnchors = computed(
  () =>
    new Set(
      issues.value.flatMap((i) => {
        const m = mainOf(i)
        const claims = i.anchors.filter((a) => !i.factIds.includes(a))
        return m ? [factOf(m)?.source.anchor ?? m, ...claims] : claims
      }),
    ),
)
const issueFactIds = computed(() => new Set(issues.value.flatMap((i) => i.factIds)))

const ordered = computed(() => {
  const p = paper.value
  if (!p) return []
  const idx = (row: string) => {
    const i = p.rows.findIndex((r) => r.id === row)
    return i < 0 ? p.rows.length : i
  }
  const base = [...factsOf(p.id)].sort((a, b) => idx(a.row) - idx(b.row))
  const out = base.filter((f) => f.source.kind !== 'figure' || !base.some((x) => x.source.kind !== 'figure' && x.row === f.row && x.param === f.param))
  for (const f of base) {
    if (out.includes(f)) continue
    let at = -1
    out.forEach((x, i) => x.row === f.row && x.param === f.param && (at = i))
    out.splice(at + 1, 0, f)
  }
  return out
})

const ui = useViewState('review', () => ({
  tab: 'all' as Tab,
  sample: 'all',
  sort: 'order' as Sort,
  selectedId: null as string | null,
  issueId: null as string | null,
  center: 'pdf' as 'pdf' | 'coverage' | 'structure' | 'links',
  covOpen: false,
  sheet: false,
  sheetBack: false,
  localView: 'facts' as 'facts' | 'paper',
  paperId: '',
  factQ: '',
}))
const tab = toRef(ui, 'tab')
const sample = toRef(ui, 'sample')
const sort = toRef(ui, 'sort')
const selectedId = toRef(ui, 'selectedId')
const editing = ref(false)
const hoverId = ref<string | null>(null)

const doubtOf = (f: Fact) => (issueFactIds.value.has(f.id) ? 2 : 0) + (f.confidence < 0.8 ? 1 : 0)
const visible = computed(() => {
  if (tab.value === 'doubt') return tabIssues.value.map((i) => mainOf(i)).filter((id): id is string => !!id).map((id) => factOf(id)).filter((f): f is Fact => !!f)
  const list = ordered.value.filter((f) => {
    if (tab.value === 'doubt') return false
    if (tab.value === 'accepted' && f.status !== 'accepted') return false
    if (tab.value === 'rejected' && f.status !== 'rejected') return false
    return sample.value === 'all' || f.row === sample.value || f.row === '*'
  })
  if (sort.value !== 'doubtful') return list
  return [...list].sort((a, b) => doubtOf(b) - doubtOf(a) || a.confidence - b.confidence)
})
const factsLabel = computed(() => `Факты ${ordered.value.filter((x) => x.status !== 'new').length}/${ordered.value.length}${issues.value.length ? ' · !' : ''}`)
const reliableList = computed(() => ordered.value.filter((f) => f.status === 'new' && f.confidence >= 0.9 && !issueFactIds.value.has(f.id)))
const sel = computed(() => (selectedId.value ? factOf(selectedId.value) : undefined))
const curIssue = computed(() => {
  if (tab.value === 'doubt') {
    const own = tabIssues.value.find((i) => i.id === ui.issueId)
    if (own && (!mainOf(own) || mainOf(own) === selectedId.value)) return own
  }
  const id = selectedId.value
  if (!id) return null
  const mine = tabIssues.value.filter((i) => mainOf(i) === id)
  return mine.find((i) => i.id === ui.issueId) ?? mine[0] ?? null
})

const mobile = computed(() => state.mobile)
const localView = toRef(ui, 'localView')
const view = computed<'facts' | 'paper'>({
  get: () => props.pane ?? localView.value,
  set: (v) => {
    localView.value = v
    emit('update:pane', v)
  },
})
const embedded = computed(() => mobile.value && !!props.pane)
const sheet = toRef(ui, 'sheet')
const menu = ref(false)
const topicQ = computed(() => (paper.value ? COLLECTIONS[paper.value.collection].topics.find(([re]) => re.test(paper.value!.title + ' ' + paper.value!.tags))?.[1] ?? '' : ''))
const otherPaper = computed(() => state.papers.find((p) => p.id !== props.paperId && p.collection === paper.value?.collection && p.processing >= 100))
function go(to: { path: string; query: Record<string, string> }) {
  menu.value = false
  void openDeep(router, to)
}
watch(mobile, (m) => {
  if (!m) {
    sheet.value = false
    menu.value = false
  }
})

type Center = 'pdf' | 'coverage' | 'structure' | 'links'
const center = toRef(ui, 'center')
const CENTERS = computed<{ id: Center; label: string; closable?: boolean }[]>(() => {
  const list: { id: Center; label: string; closable?: boolean }[] = [
    { id: 'pdf', label: 'PDF' },
    { id: 'structure', label: paper.value?.collection === 'rag' ? 'Схема' : 'Структура' },
    { id: 'links', label: 'Связи' },
  ]
  if (ui.covOpen || center.value === 'coverage') list.push({ id: 'coverage', label: 'Полнота', closable: true })
  return list
})
function openCenter(v: Center) {
  center.value = v
  if (mobile.value) {
    sheet.value = false
    view.value = 'paper'
  }
}
function closeCoverage() {
  ui.covOpen = false
  if (center.value === 'coverage') center.value = 'pdf'
}
function openCoverage() {
  ui.covOpen = true
  center.value = 'coverage'
  if (mobile.value) view.value = 'paper'
}
watch(view, (v) => {
  if (v === 'paper' && mobile.value && center.value === 'pdf') void nextTick(() => setTimeout(() => pdf.value?.reveal(), 60))
})
onMounted(() => {
  if (mobile.value && view.value === 'paper' && route.query.fact) setTimeout(() => pdf.value?.reveal(), 250)
})
watch(
  () => route.query.pane ?? route.query.center,
  async (c) => {
    const v = Array.isArray(c) ? c[0] : c
    if (v !== 'pdf' && v !== 'coverage' && v !== 'structure' && v !== 'links') return
    center.value = v
    if (v === 'coverage') ui.covOpen = true
    await router.replace({ query: { ...route.query, pane: undefined, center: undefined } })
    if (mobile.value) view.value = 'paper'
  },
  { immediate: true },
)

const pdf = ref<InstanceType<typeof PdfPage> | null>(null)
const facts = ref<InstanceType<typeof FactsPanel> | null>(null)
const body = ref<HTMLElement | null>(null)
function expandFacts() {
  body.value?.querySelector<HTMLElement>(':scope > .spl > .spl__tab--end')?.click()
}
defineExpose({ expandFacts })
watch(view, (v) => {
  if (v === 'facts') void nextTick(() => facts.value?.scrollToSelected())
})
function reveal() {
  center.value = 'pdf'
  if (!mobile.value) return void nextTick(() => pdf.value?.reveal())
  if (tab.value !== 'doubt') state.hot = []
  if (sheet.value) ui.sheetBack = true
  view.value = 'paper'
  sheet.value = false
  void nextTick(() => pdf.value?.reveal())
}
const fromChat = computed(() => {
  const t = backStack[backStack.length - 1]
  if (!t || !t.path.startsWith('/c/')) return false
  const [, qs = ''] = t.fullPath.split('?')
  const q = new URLSearchParams(qs)
  const v = q.get('view')
  if (v) return v === 'chat'
  const kind = chatOf(decodeURIComponent(t.path.slice(3)))?.kind
  return kind === 'ask' || (kind === 'paper' && state.mobile && !q.get('fact'))
})
function backToFacts() {
  if (fromChat.value) return void goBack(router)
  view.value = 'facts'
  if (selectedId.value && !visible.value.some((f) => f.id === selectedId.value)) {
    tab.value = 'all'
    sample.value = 'all'
  }
  if (ui.sheetBack && selectedId.value) sheet.value = true
  ui.sheetBack = false
}
function openFact(id: string) {
  selectedId.value = id
  sheet.value = false
  reveal()
}
function onEmpty(row: string, param: string) {
  const p = paper.value
  if (!p) return
  center.value = 'pdf'
  if (mobile.value) view.value = 'paper'
  void nextTick(() => pdf.value?.focusParam(param))
  toast(`Выделите в статье значение: ${paramOf(p.collection, param).label}, ${rowTitle(p, row, 'nom')}`)
}

function pickFact(id: string) {
  ui.issueId = null
  if (tab.value === 'doubt' && !visible.value.some((f) => f.id === id)) tab.value = 'all'
  if (!visible.value.some((f) => f.id === id)) sample.value = 'all'
  if (mobile.value) state.hot = []
  select(id)
}

function select(id: string) {
  selectedId.value = id
  if (mobile.value && tab.value !== 'doubt') state.hot = []
  if (mobile.value) sheet.value = true
}

function step(d: number) {
  if (tab.value === 'doubt' && tabIssues.value.length) {
    const l = tabIssues.value
    const i = l.findIndex((x) => x.id === curIssue.value?.id)
    return pickIssue(l[Math.min(l.length - 1, Math.max(0, i < 0 ? 0 : i + d))]!.id)
  }
  const list = visible.value
  if (!list.length) return
  const i = list.findIndex((f) => f.id === selectedId.value)
  selectedId.value = list[Math.min(list.length - 1, Math.max(0, i < 0 ? 0 : i + d))]!.id
}

function next() {
  const find = (list: Fact[]) => {
    const i = list.findIndex((x) => x.id === selectedId.value)
    return list.slice(i + 1).find((x) => x.status === 'new') ?? list.slice(0, Math.max(i, 0)).find((x) => x.status === 'new')
  }
  let n = find(visible.value)
  if (!n) {
    n = find(ordered.value)
    if (n) {
      tab.value = 'all'
      sample.value = 'all'
    }
  }
  if (!n) return void toast('Все факты проверены')
  selectedId.value = n.id
  if (mobile.value) sheet.value = true
}
function acceptReliable() {
  acceptMany(reliableList.value.map((x) => x.id))
}

function initial() {
  const q = route.query.fact
  const id = Array.isArray(q) ? q[0] : q
  const wanted = id ? factOf(id) : undefined
  if (wanted && wanted.paperId === props.paperId) return wanted.id
  return (ordered.value.find((f) => issueFactIds.value.has(f.id)) ?? ordered.value[0])?.id ?? null
}
let arrived = true
function applyRoute() {
  if (!ready.value) return
  const q = route.query.fact
  const fq = (Array.isArray(q) ? q[0] : q) ?? ''
  const first = arrived
  arrived = false
  if (ui.paperId !== props.paperId) {
    ui.paperId = props.paperId
    tab.value = 'all'
    sample.value = 'all'
    sort.value = 'order'
    editing.value = false
    sheet.value = false
    selectedId.value = initial()
    return
  }
  const wanted = fq ? factOf(fq) : undefined
  if (wanted && wanted.paperId === props.paperId) {
    if (first || selectedId.value !== wanted.id) {
      editing.value = false
      selectedId.value = wanted.id
      if (!visible.value.some((x) => x.id === wanted.id)) {
        tab.value = 'all'
        sample.value = 'all'
      }
    }
    return
  }
  if (selectedId.value && factOf(selectedId.value)) return
  selectedId.value = initial()
}
watch([() => props.paperId, ready, () => route.query.fact], applyRoute, { immediate: true })
watch(
  selectedId,
  (id) => {
    if (!id || !ready.value || route.query.pane || route.query.center || route.query.fact === id) return
    void router.replace({ query: { ...route.query, fact: id } })
  },
  { flush: 'post' },
)
watch(
  () => undone.n,
  () => {
    const x = undone.fact ? factOf(undone.fact) : undefined
    if (!x || x.paperId !== props.paperId || !ready.value || tab.value === 'doubt') return
    selectedId.value = x.id
    if (!visible.value.some((v) => v.id === x.id)) {
      tab.value = 'all'
      sample.value = 'all'
    }
  },
)
watch(selectedId, () => (editing.value = false))
watch(
  () => allIssues.value.length,
  (n) => {
    if (!n && tab.value === 'doubt') tab.value = 'all'
  },
)
watch(selectedId, (id) => {
  if (tab.value !== 'doubt' || !id) return
  const i = curIssue.value
  if (i) state.hot = i.anchors
})
watch([tab, sample], () => {
  if (visible.value.some((f) => f.id === selectedId.value)) return
  if (tab.value === 'doubt' && tabIssues.value[0]) return pickIssue(tabIssues.value[0].id)
  if (visible.value[0]) selectedId.value = visible.value[0].id
})

function advance(mutate: () => void) {
  const f = sel.value
  if (!f) return
  const list = visible.value
  const i = list.findIndex((x) => x.id === f.id)
  const nextF =
    list.slice(i + 1).find((x) => x.status === 'new') ?? list.slice(0, Math.max(i, 0)).find((x) => x.status === 'new')
  mutate()
  if (nextF) selectedId.value = nextF.id
  else if (!ordered.value.some((x) => x.status === 'new')) toast('Все факты проверены')
}
const openOf = (factId: string) => sortedIssues.value.filter((i) => mainOf(i) === factId)
const savedCur = () => {
  const x = sel.value
  if (!x) return
  const mine = openOf(x.id)
  if (tab.value === 'doubt') {
    const cur = curIssue.value
    const nxt = cur ? nextOpen(cur.id) : null
    resolveIssues(mine.map((i) => i.id), 'fixed', { accept: x.id, mergePrev: 1 })
    if (nxt) pickIssue(nxt.id)
    return
  }
  advance(() => {})
  resolveIssues(mine.map((i) => i.id), 'fixed', { accept: x.id, mergePrev: 1 })
}
function nextOpen(id: string): Issue | null {
  const l = sortedIssues.value
  const i = l.findIndex((x) => x.id === id)
  const rest = [...l.slice(i + 1), ...l.slice(0, Math.max(i, 0))].filter((x) => x.id !== id)
  return rest[0] ?? null
}
function pickIssue(id: string) {
  const i = tabIssues.value.find((x) => x.id === id)
  if (!i) return
  ui.issueId = i.id
  state.hot = i.anchors
  const m = mainOf(i)
  if (m) selectedId.value = m
}
function onPickIssue(id: string) {
  pickIssue(id)
  if (mobile.value) sheet.value = true
}
function resolveCur(how: Resolution) {
  const i = curIssue.value
  if (!i || isResolved(i.id)) return
  const m = mainOf(i)
  const x = m ? factOf(m) : undefined
  const nxt = nextOpen(i.id)
  const blocked = !!x && sortedIssues.value.some((o) => o.id !== i.id && o.level === 'conflict' && o.factIds.includes(x.id))
  resolveIssues([i.id], how, { accept: how === 'fixed' && x && !blocked ? x.id : undefined })
  if (nxt) pickIssue(nxt.id)
}
function reopenCur(id: string) {
  reopenIssue(id)
  pickIssue(id)
}
const acceptCur = () => {
  if (tab.value === 'doubt' && curIssue.value && !isResolved(curIssue.value.id)) return resolveCur('fixed')
  const x = sel.value
  if (!x) return
  const mine = openOf(x.id)
  advance(() => {
    if (mine.length) resolveIssues(mine.map((i) => i.id), 'fixed', { accept: x.status !== 'accepted' ? x.id : undefined })
    else if (x.status !== 'accepted') accept(x.id)
  })
}
const rejectCur = () => {
  const x = sel.value
  if (!x || x.status === 'rejected') return
  const before = new Map(openIssues(paper.value!).map((i) => [i.id, i.title]))
  advance(() => reject(x.id))
  const now = new Set(allIssues.value.map((i) => i.id))
  const lost = [...before].filter(([id]) => !now.has(id)).map(([, t]) => t)
  toast(lost.length ? `Факт отклонён. Замечание «${lost[0]}» больше не проверяется` : 'Факт отклонён', { label: 'Отменить', run: undo })
}
const restoreCur = () => {
  const x = sel.value
  if (!x) return
  group('отмена принятия', () => {
    for (const i of resolvedIssues.value) if (mainOf(i) === x.id && state.resolved[i.id] === 'fixed') reopenIssue(i.id, true)
    if (x.status !== 'new' || x.edited != null) restore(x.id)
  })
}

const issuesDot = computed(() => (issues.value.some((i) => i.level === 'conflict') ? 'dot--conflict' : 'dot--doubt'))
let issueCursor = -1
function goIssues() {
  tab.value = 'doubt'
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  const list = sortedIssues.value
  if (!list.length) return
  issueCursor = (issueCursor + 1) % list.length
  pickIssue(list[issueCursor]!.id)
  if (mobile.value) sheet.value = true
  void nextTick(() => pdf.value?.reveal())
}

function onClaim(anchor: string) {
  const i = issues.value.find((x) => x.anchors.includes(anchor))
  if (!i) return
  ui.issueId = i.id
  state.hot = i.anchors
  const first = mainOf(i)
  if (first) select(first)
}

function onKey(e: KeyboardEvent) {
  if (e.metaKey || e.ctrlKey || e.altKey || !ready.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
  const onBtn = !!t && ['BUTTON', 'A'].includes(t.tagName) && !t.closest('.fp__tabs, .rev__warn, .rev__views')
  const plain = !e.shiftKey
  if (plain && e.code === 'KeyN') next()
  else if (matches('next', e) || (plain && e.code === 'KeyJ')) step(1)
  else if (matches('prev', e) || (plain && e.code === 'KeyK')) step(-1)
  else if (matches('accept', e) && !onBtn) acceptCur()
  else if (matches('edit', e) && sel.value) editing.value = true
  else if (matches('reject', e) || (plain && e.code === 'Delete')) rejectCur()
  else if (matches('reveal', e) && !onBtn) reveal()
  else if (e.key === 'Escape') {
    state.hot = []
    editing.value = false
    sheet.value = false
    menu.value = false
    return
  } else return
  e.preventDefault()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  state.hot = []
})
</script>

<template>
  <div v-if="paper" class="rev" :class="{ 'rev--m': mobile }">
    <Pipeline v-if="!ready" :paper="paper" />
    <template v-else>
      <header v-if="!embedded" class="rev__head">
        <slot v-if="!mobile" name="back" />
        <div class="rev__title">
          <h1>{{ paper.title }}</h1>
          <p>{{ paper.mine ? 'Загружено вами' : paper.authors + ' · ' + paper.year }}</p>
        </div>
        <button
          v-if="issues.length > 0"
          type="button"
          class="rev__warn"
          @click="goIssues"
        >
          <i class="dot" :class="issuesDot" />{{ issues.length }} {{ plural(issues.length, ['замечание', 'замечания', 'замечаний']) }} <Icon name="chevron-right" :size="14" />
        </button>
        <slot v-if="!mobile" name="modes" />
        <div class="rev__more">
          <button class="icon-btn" aria-label="Ещё" :aria-expanded="menu" @click="menu = !menu"><Icon name="dots" :size="20" /></button>
          <template v-if="menu">
            <div class="rev__scrim" @click="menu = false" />
            <div class="menu rev__menu" role="menu">
              <button class="menu__item rev__mi" role="menuitem" @click="go({ path: '/explore', query: { q: topicQ } })"><Icon name="table" :size="16" /> Открыть в Данных</button>
              <button v-if="otherPaper" class="menu__item rev__mi" role="menuitem" @click="go({ path: '/compare', query: { ids: paper.id + ',' + otherPaper.id } })"><Icon name="columns" :size="16" /> Сравнить с другой статьёй</button>
              <button class="menu__item rev__mi" role="menuitem" @click="go({ path: '/graph', query: { root: paper.id } })"><Icon name="graph" :size="16" /> Связи на весь экран</button>
              <div class="menu__sep" />
              <button class="menu__item rev__mi" role="menuitem" @click="exportJSON([paper.id], paper.id + '.json'); menu = false"><Icon name="export" :size="16" /> Экспорт JSON</button>
            </div>
          </template>
        </div>
      </header>

      <div v-if="mobile && !embedded" class="rev__seg" role="tablist">
        <button role="tab" :aria-selected="view === 'paper'" :class="{ on: view === 'paper' }" @click="view = 'paper'">Статья</button>
        <button role="tab" :aria-selected="view === 'facts'" :class="{ on: view === 'facts' }" @click="view = 'facts'">
          Факты <span class="num">{{ ordered.length }}</span>
        </button>
      </div>

      <div ref="body" class="rev__body">
        <UiSplit id="paper-facts" dir="row" sized="end" :initial="factsW" :min="340" :max="760" collapsible :label="factsLabel" :disabled="mobile">
        <template #start>
        <div v-show="!mobile || view === 'paper'" class="rev__center">
          <div class="rev__views" role="tablist" aria-label="Вид статьи">
            <button v-for="c in CENTERS" :key="c.id" type="button" role="tab" :aria-selected="center === c.id" :class="{ on: center === c.id }" @click="center = c.id">
              {{ c.label }}<span
                v-if="c.closable" class="rev__x" role="button" tabindex="0" aria-label="Закрыть «Полноту»" data-tip="Закрыть"
                @click.stop="closeCoverage" @keydown.enter.stop.prevent="closeCoverage"
              ><Icon name="x" :size="12" /></span>
            </button>
            <div v-if="center === 'pdf' && pdf" class="rev__tools">
              <span class="num rev__pg">Стр. {{ paper.page }} / {{ paper.pages }}</span>
              <template v-if="!mobile">
                <button class="icon-btn icon-btn--sm" aria-label="Уменьшить" :disabled="!pdf.canOut" @click="pdf.zoom(-0.1)"><Icon name="zoom-out" :size="16" /></button>
                <button class="rev__pct num" :data-tip="pdf.auto ? 'Масштаб по ширине' : 'Вернуть масштаб по ширине'" @click="pdf.fit()">{{ pdf.pct }}%</button>
                <button class="icon-btn icon-btn--sm" aria-label="Увеличить" :disabled="!pdf.canIn" @click="pdf.zoom(0.1)"><Icon name="zoom-in" :size="16" /></button>
              </template>
            </div>
          </div>
          <div class="rev__pane">
            <PdfPage
              v-show="center === 'pdf'"
              ref="pdf"
              :paper="paper"
              :selected-anchor="sel?.source.anchor ?? null"
              :hot="state.hot"
              :issue-anchors="issueAnchors"
              @hover="hoverId = $event"
              @pick="pickFact"
              @claim="onClaim"
            />
            <Coverage v-if="center === 'coverage'" :paper="paper" :selected-id="selectedId" @open="openFact" @empty="onEmpty" />
            <DeviceStack v-else-if="center === 'structure'" v-model:sample="sample" :paper="paper" :selected-id="selectedId" @open="openFact" />
            <PaperLinks v-else-if="center === 'links'" :paper-id="paper.id" class="rev__links" />
          </div>
        </div>
        </template>
        <template #end>
        <FactsPanel
          v-show="!mobile || view === 'facts'"
          ref="facts"
          v-model:tab="tab"
          v-model:sample="sample"
          v-model:sort="sort"
          v-model:editing="editing"
          v-model:sheet="sheet"
          :mobile="mobile"
          :paper="paper"
          :facts="ordered"
          :visible="visible"
          :reliable="reliableList.length"
          :issues="sortedIssues"
          :resolved="resolvedIssues"
          :current="curIssue"
          :selected-id="selectedId"
          :hover-id="hoverId"
          @select="select"
          @reveal="reveal"
          @step="step"
          @next="next"
          @coverage="openCoverage"
          @accept-reliable="acceptReliable"
          @accept="acceptCur"
          @reject="rejectCur"
          @restore="restoreCur"
          @saved="savedCur"
          @pick-issue="onPickIssue"
          @resolve="resolveCur"
          @reopen="reopenCur"
          @open-center="openCenter"
        />
        </template>
        </UiSplit>
        <Transition name="fab">
          <button v-if="mobile && view === 'paper' && center === 'pdf' && !sheet" class="rev__back" @click="backToFacts">
            <Icon name="arrow-right" :size="16" class="rev__flip" /> {{ fromChat ? 'К чату' : 'К фактам' }}
          </button>
        </Transition>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rev { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.rev__head {
  flex: none; display: flex; align-items: center; gap: var(--s3); padding: var(--s3) var(--s3) var(--s3) var(--s5); border-bottom: 1px solid var(--line);
}
.rev__title { min-width: 0; flex: 1; }
.rev__title h1 { font-size: var(--fs-h2); font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rev__title p { margin-top: 2px; font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rev__warn { flex: none; display: inline-flex; align-items: center; gap: var(--s2); height: 32px; padding: 0 var(--s2) 0 var(--s3); border-radius: var(--r-pill); font-size: var(--fs-sm); color: var(--ink-2); transition: background-color var(--t) ease; }
.rev__warn:hover { background: var(--bg-2); }
.rev__body { position: relative; flex: 1; min-height: 0; }
.rev--m .rev__head { padding: var(--s2) var(--s2) var(--s2) var(--s4); }
.rev--m .rev__title h1 { font-size: var(--fs-body); }
.rev--m .rev__title p { font-size: var(--fs-xs); }
.rev__more { position: relative; flex: none; }
.rev__scrim { position: fixed; inset: 0; z-index: 59; }
.rev__menu { right: 0; top: calc(100% + 4px); min-width: 210px; }
.rev__mi { height: 48px; font-size: 15px; }
.rev__seg { flex: none; display: flex; gap: 2px; margin: var(--s2) var(--s4); padding: 3px; border-radius: var(--r); background: var(--bg-2); }
.rev__seg button {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; height: 44px; border-radius: var(--r-sm);
  font-size: 15px; font-weight: 500; color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease, box-shadow var(--t) ease;
}
.rev__seg button.on { color: var(--ink); background: var(--card); box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
.rev__seg .num { opacity: 0.7; margin-left: var(--s1); }
.rev--m .rev__body { display: block; }
.rev--m .rev__body :deep(.spl__pane) { display: contents; }
.rev--m .rev__body :deep(.fp), .rev--m .rev__body .rev__center { height: 100%; }
.rev__center { height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.rev__pane { flex: 1; min-height: 0; }
.rev__pane > :deep(.pdf), .rev__pane > :deep(.cov), .rev__pane > :deep(.ds) { height: 100%; }
.rev__views { flex: none; display: flex; align-items: center; gap: 2px; height: 44px; padding: 0 var(--s4) 0 var(--s3); border-bottom: 1px solid var(--line); background: var(--bg); overflow-x: auto; scrollbar-width: none; }
.rev__views::-webkit-scrollbar { display: none; }
.rev__views button {
  flex: none; display: inline-flex; align-items: center; gap: var(--s2); height: 32px; padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-sm); font-weight: 500;
  color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease;
}
.rev__views button { font-weight: 400; color: var(--faint); }
.rev__views button:hover { color: var(--ink); }
.rev__views button.on { color: var(--ink); font-weight: 500; background: var(--bg-2); }
.rev__x { display: inline-grid; place-items: center; width: 20px; height: 20px; margin: 0 -4px 0 4px; border-radius: var(--r-xs); color: var(--muted); }
.rev__x:hover { background: var(--bg-3); color: var(--ink); }
.rev--m .rev__x { width: 44px; height: 44px; margin: -6px -14px -6px 0; }
.rev__tools { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 2px; padding-left: var(--s3); font-size: var(--fs-sm); color: var(--muted); }
.rev__pg { margin-right: var(--s2); white-space: nowrap; }
.rev__pct { min-width: 44px; height: 28px; padding: 0 4px; border-radius: var(--r-sm); text-align: center; color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease; }
.rev__pct:hover { background: var(--bg-2); color: var(--ink); }
.rev--m .rev__tools { padding: 0 var(--s2) 0 var(--s1); }
.rev--m .rev__pg { margin-right: 0; font-size: var(--fs-xs); }
.rev--m .rev__views { height: auto; margin: var(--s2) var(--s4) var(--s1); padding: 3px; gap: 2px; border: 0; border-radius: var(--r); background: var(--bg-2); overflow: visible; }
.rev--m .rev__views button { color: var(--muted); flex: 1 1 0; min-width: 0; justify-content: center; height: 44px; border-radius: var(--r-sm); font-size: 15px; }
.rev--m .rev__views button:hover { background: transparent; }
.rev--m .rev__views button.on { color: var(--ink); background: var(--card); box-shadow: 0 1px 3px rgb(0 0 0 / 0.14); }
.rev__back {
  position: absolute; z-index: 5; left: 50%; translate: -50% 0; bottom: calc(var(--s4) + var(--safe-b));
  display: inline-flex; align-items: center; gap: var(--s2); height: 48px; padding: 0 var(--s5); border-radius: var(--r-pill);
  font-size: 15px; font-weight: 500; color: var(--on-solid); background: var(--solid); box-shadow: var(--shadow-pop);
}
.rev__flip { rotate: 180deg; }
.fab-enter-active, .fab-leave-active { transition: opacity 180ms ease, transform 220ms var(--ease); }
.fab-enter-from, .fab-leave-to { opacity: 0; transform: translateY(12px); }
.rev__links { height: 100%; min-height: 0; }
</style>
