<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import UiProgress from './UiProgress.vue'
import UiSplit from './UiSplit.vue'
import { openDeep, useScrollMemory, useViewState } from '../viewState'
import { TOKEN, paramOf, rowTitle, sampleWords } from '../data'
import { plural } from '../search'
import { crossOf, mainFactId, normTrace } from '../norm'
import { coverageOf } from '../structure'
import { display, edit, factOf, factsOf, labelOf, openIssues, state, toast, valueOf, type Issue, type Paper } from '../store'
import type { Fact } from '../data'

export type Tab = 'all' | 'doubt' | 'accepted' | 'rejected'
export type Sort = 'order' | 'doubtful'

const props = defineProps<{
  paper: Paper
  facts: Fact[]
  visible: Fact[]
  issues: Issue[]
  resolved: Issue[]
  current: Issue | null
  selectedId: string | null
  hoverId: string | null
  tab: Tab
  sample: string
  sort: Sort
  reliable: number
  editing: boolean
  mobile?: boolean
  sheet?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:tab', v: Tab): void
  (e: 'update:sample', v: string): void
  (e: 'update:sort', v: Sort): void
  (e: 'update:editing', v: boolean): void
  (e: 'update:sheet', v: boolean): void
  (e: 'step', d: number): void
  (e: 'next'): void
  (e: 'acceptReliable'): void
  (e: 'coverage'): void
  (e: 'select', id: string): void
  (e: 'reveal'): void
  (e: 'accept'): void
  (e: 'reject'): void
  (e: 'restore'): void
  (e: 'saved'): void
  (e: 'pickIssue', id: string): void
  (e: 'resolve', how: 'fixed' | 'ok'): void
  (e: 'reopen', id: string): void
  (e: 'openCenter', v: 'structure'): void
}>()
const router = useRouter()

const sel = computed(() => (props.selectedId ? factOf(props.selectedId) : undefined))
const count = (s: Fact['status']) => props.facts.filter((f) => f.status === s).length
const nz = (n: number) => (n > 0 ? n : undefined)
const tabs = computed<{ id: Tab; label: string; n?: number }[]>(() => {
  const list: { id: Tab; label: string; n?: number }[] = [{ id: 'all', label: 'Все' }]
  if (props.issues.length || props.resolved.length || props.tab === 'doubt') list.push({ id: 'doubt', label: 'Замечания', n: nz(props.issues.length) })
  if (props.tab === 'accepted') list.push({ id: 'accepted', label: 'Принятые', n: nz(count('accepted')) })
  if (props.tab === 'rejected') list.push({ id: 'rejected', label: 'Отклонённые', n: nz(count('rejected')) })
  return list
})
const words = computed(() => sampleWords(props.paper.collection))
const sampleOpts = computed(() => [{ value: 'all', label: words.value.allCap }, ...props.paper.rows.map((r) => ({ value: r.id, label: rowTitle(props.paper, r.id) }))])
const sortOpts = computed(() => [
  { value: 'order' as Sort, label: words.value.byRows },
  { value: 'doubtful' as Sort, label: 'Сначала с замечаниями' },
])
const showFilters = computed(() => props.tab !== 'doubt')
const filterOn = computed(() => props.sample !== 'all' || props.sort !== 'order')
const cov = computed(() => coverageOf(props.paper))
const missing = computed(() => cov.value.total - cov.value.filled)
const missingText = computed(() =>
  missing.value > 0 ? `${missing.value} ${plural(missing.value, ['параметр', 'параметра', 'параметров'])} не найдено` : 'Все параметры найдены',
)

const menu = ref<'' | 'filter' | 'more'>('')
const tools = ref<HTMLElement | null>(null)
const toggle = (m: 'filter' | 'more') => (menu.value = menu.value === m ? '' : m)
const onDown = (e: Event) => {
  if (menu.value && !tools.value?.contains(e.target as Node)) menu.value = ''
}
const onEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') menu.value = ''
}
onMounted(() => {
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown, true)
  document.removeEventListener('keydown', onEsc)
})
const pickStatus = (t: Tab) => {
  emit('update:tab', props.tab === t ? 'all' : t)
  menu.value = ''
}
const pickSample = (v: string) => {
  emit('update:sample', v)
  menu.value = ''
}
const pickSort = (v: Sort) => {
  emit('update:sort', v)
  menu.value = ''
}
const bulk = () => {
  menu.value = ''
  emit('acceptReliable')
}

const reviewed = computed(() => props.facts.filter((f) => f.status !== 'new').length)
const left = computed(() => props.facts.length - reviewed.value)
const pct = computed(() => (props.facts.length ? Math.round((reviewed.value / props.facts.length) * 100) : 0))

const level = computed(() => {
  const m = new Map<string, Issue['level']>()
  for (const i of props.issues) {
    const id = mainFactId(i)
    if (id && m.get(id) !== 'conflict') m.set(id, i.level)
  }
  return m
})
const selIssue = computed(() => (props.current && props.issues.some((i) => i.id === props.current!.id) ? props.current : props.issues.find((i) => mainFactId(i) === props.selectedId) ?? null))
const relIds = computed(() => new Set(selIssue.value ? selIssue.value.factIds.filter((x) => x !== props.selectedId) : []))
const isSelIssue = (i: Issue) => props.current?.id === i.id
const curDone = computed(() => (props.current ? state.resolved[props.current.id] ?? null : null))
const DONE_WORD = { fixed: 'решено', ok: 'не ошибка' } as const
const LEVEL_WORD = { conflict: 'ошибка', doubt: 'предупреждение', warn: 'предупреждение' } as const
const related = computed(() => (sel.value ? props.issues.filter((i) => i.factIds.includes(sel.value!.id)) : []))
const otherRel = computed(() => related.value.filter((i) => i.id !== props.current?.id || props.tab !== 'doubt'))

const confOf = (c: number) => (c >= 0.9 ? { cls: 'dot--ok', text: 'Высокая' } : c >= 0.8 ? { cls: 'dot--doubt', text: 'Средняя' } : { cls: 'dot--conflict', text: 'Низкая' })

const groupTitle = (f: Fact) => (f.row === '*' ? 'Общие условия' : rowTitle(props.paper, f.row))
const dupKey = (f: Fact) => f.row + '|' + f.param
const dups = computed(() => {
  const m = new Map<string, number>()
  for (const f of props.visible) if (f.status !== 'rejected') m.set(dupKey(f), (m.get(dupKey(f)) ?? 0) + 1)
  return m
})
const firstOf = computed(() => {
  const first = new Map<string, string>()
  for (const f of props.visible) if (f.status !== 'rejected' && !first.has(dupKey(f))) first.set(dupKey(f), f.id)
  return first
})
const isDup = (f: Fact) => (dups.value.get(dupKey(f)) ?? 0) > 1 && f.status !== 'rejected'
const differs = computed(() => {
  const m = new Map<string, Set<string>>()
  for (const f of props.visible) if (f.status !== 'rejected') m.set(dupKey(f), (m.get(dupKey(f)) ?? new Set()).add(display(f)))
  return m
})
const isDiff = (f: Fact) => (differs.value.get(dupKey(f))?.size ?? 0) > 1
const isSecond = (f: Fact) => isDup(f) && firstOf.value.get(dupKey(f)) !== f.id
const edited = (f: Fact) => f.edited != null
const groups = computed(() => {
  const heads = props.sort === 'order' && props.sample === 'all'
  const out: { key: string; title: string; items: Fact[] }[] = []
  for (const f of props.visible) {
    const last = out[out.length - 1]
    if (heads && last && last.key === f.row) last.items.push(f)
    else if (!heads && last) last.items.push(f)
    else out.push({ key: heads ? f.row : 'all', title: heads ? groupTitle(f) : '', items: [f] })
  }
  return out
})

const ui = useViewState('facts-panel', () => ({ how: false, more: false }))
const how = toRef(ui, 'how')
const more = toRef(ui, 'more')
const moreOn = computed(() => more.value)
const trace = computed(() => (sel.value ? normTrace(sel.value, props.paper) : []))
const cross = computed(() => (sel.value ? crossOf(sel.value, props.paper) : null))
const manual = computed(() => sel.value?.source.kind === 'manual')
const isText = computed(() => !!sel.value && !!paramOf(props.paper.collection, sel.value.param).text)
const srcOf = (f: Fact) => {
  const k = f.source.kind
  if (k === 'table') return 'т.' + f.source.ref.replace('Табл. ', '')
  if (k === 'figure') return 'рис.' + f.source.ref.replace(/^\D+/, '')
  return k === 'manual' ? 'вручную' : 'текст'
}

const normDiffers = computed(() => !!sel.value && sel.value.raw !== display(sel.value))
const where = computed(() => (sel.value?.source.kind === 'figure' ? 'на рисунке' : sel.value?.source.kind === 'manual' ? 'введено' : 'в статье'))
const isEdited = computed(() => sel.value?.edited != null)
const arrowLabel = computed(() => (isEdited.value ? 'исправлено' : 'нормализовано'))
const restoreLabel = computed(() => (isEdited.value ? 'Отменить правку' : sel.value?.status === 'rejected' ? 'Отменить отклонение' : 'Отменить принятие'))
const rowText = computed(() => (!sel.value ? '' : rowTitle(props.paper, sel.value.row, 'nom')))
const quoteShown = computed(() => !!sel.value?.quote && props.paper.paragraphs.some((x) => x.replace(TOKEN, '$2').includes(sel.value!.quote!)))
const canShow = computed(() => !manual.value || quoteShown.value)

const exploreTo = computed(() => (sel.value ? { path: '/explore', query: { q: labelOf(sel.value) } } : null))
const bestOther = computed(() => {
  const f = sel.value
  if (!f) return null
  const others = state.papers.filter((p) => p.id !== props.paper.id && p.collection === props.paper.collection && p.processing >= 100)
  let best: { p: Paper; v: number } | null = null
  for (const p of others) {
    const vals = factsOf(p.id).filter((x) => x.param === f.param && x.status !== 'rejected').map(valueOf).filter((v): v is number => v != null)
    if (!vals.length) continue
    const v = Math.max(...vals)
    if (!best || v > best.v) best = { p, v }
  }
  return best?.p ?? others[0] ?? null
})
const compareSet = computed(() => {
  const first = bestOther.value
  if (!first) return []
  const more = state.papers.filter((p) => p.id !== props.paper.id && p.id !== first.id && p.collection === props.paper.collection && p.processing >= 100)
  return [first, ...more.slice(0, 1)]
})
const compareTo = computed(() => (compareSet.value.length ? { path: '/compare', query: { ids: [props.paper.id, ...compareSet.value.map((p) => p.id)].join(',') } } : null))
const compareLabel = computed(() => (compareSet.value.length > 1 ? `Сравнить с ещё ${compareSet.value.length} ${plural(compareSet.value.length, ['статьёй', 'статьями', 'статьями'])}` : compareSet.value[0] ? `Сравнить с «${compareSet.value[0].title}»` : ''))
const dive = (to: { path: string; query: Record<string, string> } | null) => {
  if (!to) return
  void openDeep(router, to)
}

const issueOnly = computed(() => props.tab === 'doubt' && !!props.current && !props.current.factIds.length)
const hasCard = computed(() => !!sel.value || issueOnly.value)
const showCard = computed(() => !props.mobile || (hasCard.value && !!props.sheet))
const pos = computed(() => props.visible.findIndex((f) => f.id === props.selectedId))
const closeSheet = () => emit('update:sheet', false)
const dragY = ref(0)
const dragging = ref(false)
const bodyEl = ref<HTMLElement | null>(null)
let t0: { x: number; y: number; head: boolean } | null = null
let axis: '' | 'x' | 'y' = ''
const touchOf = (e: TouchEvent) => e.touches[0] ?? e.changedTouches[0]
function tStart(e: TouchEvent) {
  const t = touchOf(e)
  if (!t) return
  t0 = { x: t.clientX, y: t.clientY, head: !!(e.target as HTMLElement | null)?.closest('.sh__head') }
  axis = ''
}
function tMove(e: TouchEvent) {
  const t = touchOf(e)
  if (!t || !t0) return
  const dx = t.clientX - t0.x
  const dy = t.clientY - t0.y
  if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) axis = Math.abs(dy) > Math.abs(dx) * 1.2 ? 'y' : 'x'
  if (axis === 'y' && dy > 0 && (t0.head || (bodyEl.value?.scrollTop ?? 0) <= 0)) {
    dragging.value = true
    dragY.value = dy
  }
}
function tEnd(e: TouchEvent) {
  const t = touchOf(e)
  const far = dragging.value && dragY.value > 90
  const dx = t && t0 ? t.clientX - t0.x : 0
  const dy = t && t0 ? t.clientY - t0.y : 0
  dragging.value = false
  dragY.value = 0
  const wasAxis = axis
  t0 = null
  axis = ''
  if (far) return closeSheet()
  if (wasAxis === 'x' && !props.editing && Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) emit('step', dx < 0 ? 1 : -1)
}
const onRow = (id: string) => emit('select', id)

const enter = (f: Fact) => !props.mobile && (state.hot = [f.source.anchor])
const leave = () => !props.mobile && (state.hot = [])

const list = ref<HTMLElement | null>(null)
function scrollRow(id: string | null, smooth = true) {
  if (!id) return
  void nextTick(() => {
    const row = list.value?.querySelector(`[data-fid="${id}"]`)
    if (!row) return
    if (props.mobile && props.sheet && list.value) {
      const c = list.value.getBoundingClientRect()
      const r = row.getBoundingClientRect()
      const delta = r.top - c.top - 96
      if (Math.abs(delta) > 1) list.value.scrollTo({ top: list.value.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
      return
    }
    const c = list.value!.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const head = list.value!.querySelector<HTMLElement>('.fp__group')?.offsetHeight ?? 0
    let delta = 0
    if (r.top < c.top + head + 4) delta = r.top - c.top - head - 4
    else if (r.bottom > c.bottom - 4) delta = r.bottom - c.bottom + 8
    if (Math.abs(delta) < 1) return
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'
    list.value!.scrollTo({ top: list.value!.scrollTop + delta, behavior: smooth && !calm ? 'smooth' : 'auto' })
  })
}
watch(() => props.selectedId, (id) => scrollRow(id))
watch(() => props.tab, () => scrollRow(props.selectedId, false))
watch(() => props.sheet, () => scrollRow(props.selectedId))
const scrollToSelected = () => scrollRow(props.selectedId, false)
onMounted(() => setTimeout(scrollToSelected, 160))
watch(() => more.value, () => setTimeout(scrollToSelected, 260))
defineExpose({ scrollToSelected })
useScrollMemory(list, 'facts-list')
useScrollMemory(bodyEl, 'card-body')
watch(() => props.selectedId, () => bodyEl.value && (bodyEl.value.scrollTop = 0), { flush: 'post' })

const draft = ref('')
const bad = ref(false)
const input = ref<HTMLInputElement | null>(null)
watch(
  () => props.editing,
  (on) => {
    if (!on || !sel.value) return
    draft.value = sel.value.raw
    bad.value = false
    void nextTick(() => {
      input.value?.focus()
      input.value?.select()
    })
  },
)
function save() {
  const f = sel.value
  if (!f) return
  const before = openIssues(props.paper).length
  if (!edit(f.id, draft.value)) {
    bad.value = true
    return
  }
  if (openIssues(props.paper).length < before) toast('Замечание снято')
  emit('update:editing', false)
  emit('saved')
}

function pickIssue(i: Issue) {
  emit('pickIssue', i.id)
}
const dotOf = (l: Issue['level']) => (l === 'conflict' ? 'dot--conflict' : 'dot--doubt')
const unitOf = computed(() => (sel.value ? paramOf(props.paper.collection, sel.value.param).unit : ''))
const example = computed(() => (sel.value ? display(sel.value) : ''))
const issueMode = computed(() => props.tab === 'doubt' && !!props.current)
</script>

<template>
  <aside class="fp" :class="{ 'fp--m': mobile, 'fp--sheet': mobile && sheet, 'fp--solo': tabs.length <= 1 }">
    <header class="fp__head">
      <h2>Проверено <span class="num">{{ reviewed }} из {{ facts.length }}</span></h2>
      <UiProgress class="fp__prog" :value="pct" tone="green" size="sm" label="Проверено фактов" />
      <button class="btn btn--ghost btn--sm fp__next" :disabled="!left" @click="emit('next')">
        Дальше <Icon name="arrow-right" :size="14" /><kbd>N</kbd>
      </button>
    </header>

    <div class="fp__bar">
      <nav v-if="tabs.length > 1" class="fp__tabs" aria-label="Какие факты показать">
        <button v-for="t in tabs" :key="t.id" :class="{ on: tab === t.id }" @click="emit('update:tab', t.id)">
          {{ t.label }}<span v-if="t.n != null" class="num">{{ t.n }}</span>
        </button>
      </nav>
      <div ref="tools" class="fp__tools">
        <div v-if="tab !== 'doubt'" class="fp__pop">
          <button class="icon-btn icon-btn--sm fp__tool" :class="{ on: filterOn || tab === 'accepted' || tab === 'rejected' }" aria-label="Фильтр" title="Фильтр" aria-haspopup="menu" :aria-expanded="menu === 'filter'" @click="toggle('filter')">
            <Icon name="filter" :size="16" />
          </button>
          <div v-if="menu === 'filter'" class="menu fp__menu" role="menu">
            <p class="menu__label">Статус</p>
            <button class="menu__item" :class="{ 'is-active': tab === 'accepted' }" role="menuitemradio" @click="pickStatus('accepted')">Принятые<span v-if="count('accepted')" class="num fp__n">{{ count('accepted') }}</span></button>
            <button class="menu__item" :class="{ 'is-active': tab === 'rejected' }" role="menuitemradio" @click="pickStatus('rejected')">Отклонённые<span v-if="count('rejected')" class="num fp__n">{{ count('rejected') }}</span></button>
            <template v-if="showFilters">
              <template v-if="paper.rows.length > 1">
                <div class="menu__sep" />
                <p class="menu__label">Образец</p>
                <button v-for="o in sampleOpts" :key="o.value" class="menu__item" :class="{ 'is-active': sample === o.value }" role="menuitemradio" @click="pickSample(o.value)">{{ o.label }}</button>
              </template>
              <div class="menu__sep" />
              <p class="menu__label">Порядок</p>
              <button v-for="o in sortOpts" :key="o.value" class="menu__item" :class="{ 'is-active': sort === o.value }" role="menuitemradio" @click="pickSort(o.value)">{{ o.label }}</button>
            </template>
          </div>
        </div>
        <div class="fp__pop">
          <button class="icon-btn icon-btn--sm fp__tool" aria-label="Ещё" title="Ещё" aria-haspopup="menu" :aria-expanded="menu === 'more'" @click="toggle('more')"><Icon name="dots" :size="16" /></button>
          <div v-if="menu === 'more'" class="menu fp__menu" role="menu">
            <button class="menu__item" role="menuitem" :disabled="reliable === 0" title="Без замечаний, уверенность от 90 %" @click="bulk">
              <Icon name="check" :size="16" /> Принять надёжные<span v-if="reliable" class="num fp__n">{{ reliable }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <UiSplit class="fp__split" id="paper-card" dir="col" sized="end" :initial="280" :min="200" :max="560" collapsible label="Карточка факта" :disabled="mobile">
      <template #start>
        <div ref="list" class="fp__list">
          <template v-if="tab === 'doubt'">
            <p v-if="!issues.length" class="fp__empty">Открытых замечаний нет.</p>
            <article
              v-for="i in issues" :key="i.id" class="iss" :class="{ on: isSelIssue(i), 'iss--err': i.level === 'conflict' }"
              :data-fid="mainFactId(i)" :aria-current="isSelIssue(i) || undefined"
              @mouseenter="!mobile && (state.hot = i.anchors)" @mouseleave="!mobile && (state.hot = [])"
            >
              <button type="button" class="iss__head" @click="pickIssue(i)">
                <i class="dot" :class="dotOf(i.level)" /><span class="iss__t">{{ i.title }}</span><span class="iss__lv">{{ LEVEL_WORD[i.level] }}</span>
              </button>
              <p class="iss__text">{{ i.text }}</p>

            </article>

            <template v-if="resolved.length">
              <section class="fp__grp"><h4 class="fp__group">Разобрано</h4>
              <article
                v-for="i in resolved" :key="i.id" class="iss iss--done" :class="{ on: isSelIssue(i) }"
                :data-fid="mainFactId(i)" :aria-current="isSelIssue(i) || undefined"
              >
                <button type="button" class="iss__head" @click="pickIssue(i)">
                  <Icon name="check" :size="15" class="iss__ok" /><span class="iss__t">{{ i.title }}</span><span class="iss__lv">{{ DONE_WORD[state.resolved[i.id] ?? 'fixed'] }}</span>
                </button>
              </article></section>
            </template>
          </template>

          <template v-else>
            <p v-if="!visible.length" class="fp__empty">Здесь пока пусто.</p>
            <section v-for="g in groups" :key="g.key" class="fp__grp">
              <h4 v-if="g.title" class="fp__group">{{ g.title }}</h4>
              <button v-for="f in g.items" :key="f.id"
                class="row"
                :class="{ sel: f.id === selectedId, hov: f.id === hoverId, rel: relIds.has(f.id), rej: f.status === 'rejected', sub: isSecond(f), acc: f.status === 'accepted' }"
                :data-fid="f.id"
                @click="onRow(f.id)"
                @mouseenter="enter(f)"
                @mouseleave="leave"
              >
                <span class="row__mark">
                  <Icon v-if="edited(f) && f.status !== 'rejected'" name="edit" :size="13" class="row__ed" />
                  <Icon v-else-if="f.status === 'accepted'" name="check" :size="15" class="row__ok" />
                </span>
                <span class="row__name">
                  <span class="row__label">{{ labelOf(f) }}</span>
                  <span v-if="isSecond(f)" class="row__tag">{{ f.source.kind === 'figure' ? 'с рисунка' : f.source.kind === 'table' ? 'из таблицы' : 'из текста' }}</span>
                  <span v-else-if="isDup(f) && isDiff(f)" class="row__tag row__tag--n">2 значения</span>
                  <span v-if="edited(f) && f.status !== 'rejected'" class="row__tag row__tag--ed">исправлено</span>
                  <i v-if="level.get(f.id) && f.status !== 'rejected'" class="dot" :class="dotOf(level.get(f.id)!)" data-tip="Есть замечание" />
                </span>
                <span class="row__src">{{ srcOf(f) }}</span>
                <span class="row__val num">{{ display(f) }}</span>
              </button>
            </section>
          </template>
        </div>

        <button v-if="cov.total" type="button" class="fp__cov" :data-tip="mobile ? undefined : `Найдено ${cov.filled} из ${cov.total}`" @click="emit('coverage')">
          {{ missingText }} <Icon name="chevron-right" :size="14" />
        </button>
      </template>

      <template #end>
        <Teleport to="body" :disabled="!mobile">
          <Transition name="bd">
            <div v-if="mobile && sheet && hasCard" class="bd" @click="closeSheet" />
          </Transition>
          <Transition :name="mobile ? 'sh' : ''">
            <section
              v-if="showCard"
              :key="mobile ? 'sheet' : 'card'"
              class="card"
              :class="{ 'card--sheet': mobile, 'card--empty': !sel, drag: dragging }"
              :style="mobile ? { '--dy': dragY + 'px' } : undefined"
              :role="mobile ? 'dialog' : undefined"
              :aria-label="mobile ? 'Факт' : undefined"
              @touchstart.passive="mobile ? tStart($event) : undefined"
              @touchmove.passive="mobile ? tMove($event) : undefined"
              @touchend.passive="mobile ? tEnd($event) : undefined"
              @touchcancel.passive="mobile ? tEnd($event) : undefined"
            >
              <div v-if="mobile" class="sh__head">
                <i class="sh__grip" />
                <div v-if="!issueOnly" class="sh__nav">
                  <button class="icon-btn sh__arrow sh__arrow--prev" aria-label="Предыдущий факт" :disabled="pos <= 0" @click="emit('step', -1)"><Icon name="chevron-right" :size="20" /></button>
                  <span class="num sh__pos">{{ pos + 1 }} из {{ visible.length }}</span>
                  <button class="icon-btn sh__arrow" aria-label="Следующий факт" :disabled="pos < 0 || pos >= visible.length - 1" @click="emit('step', 1)"><Icon name="chevron-right" :size="20" /></button>
                </div>
              </div>

              <div v-if="issueOnly && current" ref="bodyEl" class="card__body">
                <div class="card__top">
                  <p class="card__label">Замечание · {{ curDone ? DONE_WORD[curDone] : LEVEL_WORD[current.level] }}</p>
                  <p class="card__ititle"><Icon v-if="curDone" name="check" :size="16" class="card__iss-ok" /><i v-else class="dot" :class="dotOf(current.level)" />{{ current.title }}</p>
                </div>
                <p class="card__itext">{{ current.text }}</p>
                <button type="button" class="card__show card__show--l" @click="emit('openCenter', 'structure')"><Icon name="layers" :size="16" /> Открыть структуру → условия</button>
              </div>
              <div v-else-if="!sel" class="card__none"><Icon name="target" :size="24" /><p>Выберите факт в списке или в статье</p><p class="card__none-s">Здесь появятся значение, источник и действия</p></div>
              <div v-else ref="bodyEl" class="card__body">
                <div class="card__top">
                  <p class="card__label">{{ labelOf(sel) }} · {{ rowText }}</p>
                  <p class="card__value num" :class="{ rej: sel.status === 'rejected', txt: isText }">{{ display(sel) }}</p>
                </div>
                <p v-if="normDiffers || isEdited || manual" class="card__raw">
                  <template v-if="isEdited">{{ where }} «{{ sel.raw }}» → <b>исправлено {{ display(sel) }}</b></template>
                  <template v-else>{{ where }}: «{{ sel.raw }}»<template v-if="normDiffers"> → {{ arrowLabel }}: {{ display(sel) }}</template></template>
                </p>
                <p v-if="manual && sel.quote" class="card__raw card__raw--q">цитата «{{ sel.quote }}»</p>
                <div class="card__src">
                  <span class="card__where">{{ manual ? `стр. ${sel.source.page} · добавлено вручную` : `стр. ${sel.source.page} · ${sel.source.ref}, ${sel.source.where}` }}</span>
                  <button v-if="canShow" class="card__show" @click="emit('reveal')"><Icon name="eye" :size="16" /> Показать в статье</button>
                </div>
                <div v-if="issueMode && current" class="card__iss" :class="{ done: !!curDone }">
                  <p class="card__iss-t">
                    <Icon v-if="curDone" name="check" :size="15" class="card__iss-ok" /><i v-else class="dot" :class="dotOf(current.level)" />
                    <span>{{ current.title }}</span><b class="card__lv">{{ curDone ? DONE_WORD[curDone] : LEVEL_WORD[current.level] }}</b>
                  </p>
                  <p class="card__iss-x">{{ current.text }}</p>
                </div>
                <button v-else-if="!editing && !moreOn && otherRel.length" type="button" class="card__note" @click="more = true">
                  <i class="dot" :class="dotOf(otherRel[0]!.level)" /><span>{{ otherRel[0]!.title }}</span><b class="card__lv">{{ LEVEL_WORD[otherRel[0]!.level] }}</b><Icon name="chevron-right" :size="14" />
                </button>
                <button class="card__more" :aria-expanded="more" @click="more = !more">
                  Подробнее <Icon name="chevron-right" :size="14" class="card__chev" :class="{ open: more }" />
                </button>

                <template v-if="moreOn">
                  <ul v-if="otherRel.length" class="card__issues">
                    <li v-for="i in otherRel" :key="i.id">
                      <i class="dot" :class="dotOf(i.level)" />
                      <div>
                        <b>{{ i.title }}</b>
                        <p>{{ i.text }}</p>
                      </div>
                    </li>
                  </ul>
                  <p v-if="!manual" class="card__conf"><i class="dot" :class="confOf(sel.confidence).cls" />{{ confOf(sel.confidence).text }} уверенность <span class="num">{{ Math.round(sel.confidence * 100) }} %</span></p>
                  <p v-if="cross" class="card__cross num" :class="{ over: cross.over }">
                    <i v-if="cross.over" class="dot dot--doubt" />{{ cross.text }}<template v-if="cross.over"> — проверьте</template>
                  </p>
                  <blockquote v-if="sel.quote" class="card__quote">«{{ sel.quote }}»</blockquote>

                  <button class="card__how" :aria-expanded="how" @click="how = !how">
                    Как нормализовано <Icon name="chevron-right" :size="14" class="card__chev" :class="{ open: how }" />
                  </button>
                  <ol v-if="how" class="trace">
                    <li v-for="(t, i) in trace" :key="i" :class="{ last: i === trace.length - 1 }">
                      <span class="trace__k">{{ t.k }}</span><span class="trace__v num">{{ t.v }}</span>
                    </li>
                  </ol>

                  <div class="card__dive">
                    <button type="button" class="dive" @click="dive(exploreTo)"><Icon name="search" :size="15" /><span>Где ещё встречается {{ labelOf(sel) }}</span><Icon name="chevron-right" :size="14" class="dive__go" /></button>
                    <button v-if="compareTo" type="button" class="dive" :data-tip="compareSet.map((p) => p.title).join(' · ')" @click="dive(compareTo)"><Icon name="columns" :size="15" /><span>{{ compareLabel }}</span><Icon name="chevron-right" :size="14" class="dive__go" /></button>
                  </div>
                </template>
              </div>

              <form v-if="sel && editing" class="card__bar card__edit" @submit.prevent="save">
                <div class="card__row">
                  <input
                    ref="input"
                    v-model="draft"
                    class="card__input num"
                    :class="{ bad }"
                    spellcheck="false"
                    enterkeyhint="done"
                    aria-label="Новое значение"
                    :placeholder="`например ${example}`"
                    @input="bad = false"
                    @keydown.esc.stop.prevent="emit('update:editing', false)"
                  />
                  <button type="submit" class="btn btn--dark">Сохранить <kbd>Enter</kbd></button>
                  <button type="button" class="btn btn--ghost" @click="emit('update:editing', false)">Отмена <kbd>Esc</kbd></button>
                </div>
                <p class="card__hint" :class="{ bad }">{{ bad ? `Не понял значение — например, ${example}` : unitOf ? `Единица по умолчанию: ${unitOf}` : 'Введите значение' }}</p>
              </form>
              <div v-else-if="hasCard" class="card__bar">
                <div class="card__act">
                  <template v-if="issueMode && curDone">
                    <button class="btn btn--soft card__main" @click="emit('reopen', current!.id)"><Icon name="undo" :size="15" /> Вернуть</button>
                  </template>
                  <template v-else-if="issueMode">
                    <button class="btn btn--dark card__main" :data-tip="issueOnly ? 'Отметить замечание решённым' : 'Принять значение и закрыть замечание'" @click="emit('resolve', 'fixed')"><Icon name="check" :size="15" /> Решено <kbd>Enter</kbd></button>
                    <button class="btn btn--ghost card__ok" data-tip="Замечание неверное — значение остаётся как есть" @click="emit('resolve', 'ok')">Не ошибка</button>
                    <button v-if="sel && !issueOnly" class="btn btn--ghost" aria-label="Исправить" @click="emit('update:editing', true)"><Icon name="edit" :size="15" /><span class="card__t">Исправить</span><kbd>E</kbd></button>
                  </template>
                  <template v-else-if="sel && sel.status === 'new'">
                    <button class="btn btn--dark card__main" @click="emit('accept')"><Icon name="check" :size="15" /> Принять <kbd>Enter</kbd></button>
                    <button class="btn btn--ghost" aria-label="Исправить" @click="emit('update:editing', true)"><Icon name="edit" :size="15" /><span class="card__t">Исправить</span><kbd>E</kbd></button>
                    <button class="btn btn--ghost" aria-label="Отклонить" @click="emit('reject')"><Icon name="x" :size="15" /><span class="card__t">Отклонить</span><kbd>⌫</kbd></button>
                  </template>
                  <template v-else-if="sel">
                    <button class="btn btn--soft card__main" @click="emit('restore')"><Icon name="undo" :size="15" /> {{ restoreLabel }}</button>
                    <button v-if="sel.status === 'accepted'" class="btn btn--ghost" @click="emit('update:editing', true)"><Icon name="edit" :size="15" /><span class="card__t">Исправить</span><kbd>E</kbd></button>
                  </template>
                </div>
              </div>
            </section>
          </Transition>
        </Teleport>
      </template>
    </UiSplit>
  </aside>
</template>

<style scoped>
.fp { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg); container-type: inline-size; }
.fp__split.fp__split.fp__split :deep(.spl__bar) { width: auto; height: 1px; cursor: row-resize; }
.fp__split.fp__split.fp__split :deep(.spl__bar::before) { inset: -5px 0; }
.fp__split.fp__split.fp__split :deep(.spl__grip) { width: 32px; height: 4px; }
.fp__split.fp__split.fp__split :deep(.spl__tab) { left: auto; right: var(--s3); top: auto; translate: none; writing-mode: horizontal-tb; padding: var(--s2); }
.fp__split.fp__split.fp__split :deep(.spl__tab--end) { bottom: 4px; }
.fp .fp__split { flex: 1 1 0; height: auto; }
.fp__head { flex: none; height: 48px; display: flex; align-items: center; gap: var(--s3); padding: 0 var(--s4) 0 var(--s5); }
.fp__head h2 { font-size: var(--fs-body); font-weight: 500; white-space: nowrap; }
.fp__head h2 .num { margin-left: var(--s1); font-weight: 400; color: var(--muted); }
.fp__prog { flex: 1; min-width: 24px; }
.fp__next { flex: none; }
.fp .btn kbd {
  position: static; flex: none; height: 18px; min-width: 18px; margin: 0 0 0 var(--s1); padding: 0 5px; font-size: var(--fs-xs); font-weight: 400;
  background: transparent; color: var(--muted); border-color: var(--line-2); opacity: 0.8; pointer-events: none; transition: opacity 120ms ease;
}
.card__act .btn--ghost kbd { display: none; }
.card__main kbd { border-color: color-mix(in srgb, currentColor 30%, transparent); color: inherit; opacity: 0.6; }
.fp .btn:hover kbd, .fp .btn:focus-visible kbd { opacity: 1; }
.fp__bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--s2); height: 44px; padding: 0 var(--s3) 0 var(--s4); }
.fp__tabs { display: flex; gap: 2px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.fp__tabs::-webkit-scrollbar { display: none; }
.fp__tabs button {
  flex: none; display: inline-flex; align-items: center; gap: var(--s2); height: 32px; padding: 0 var(--s3); border-radius: var(--r-pill);
  font-size: var(--fs-sm); font-weight: 500; white-space: nowrap; color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease;
}
.fp__tabs button:hover { color: var(--ink); }
.fp__tabs button.on { color: var(--ink); background: var(--bg-2); }
.fp__tabs .num { font-weight: 400; color: var(--muted); }
.fp__tools { flex: none; display: flex; align-items: center; margin-left: auto; }
.card__raw--q { overflow-wrap: anywhere; }
.fp__pop { position: relative; }
.fp__tool { color: var(--muted); }
.fp__tool.on { color: var(--ink); background: var(--bg-2); }
.fp__menu { top: calc(100% + 4px); right: 0; min-width: 220px; max-height: min(60dvh, 420px); overflow-y: auto; overscroll-behavior: contain; }
.fp__menu .menu__item:disabled { opacity: 0.4; }
.fp__n { margin-left: auto; font-size: var(--fs-xs); color: var(--muted); }
.menu__item.is-active { color: var(--ink); font-weight: 500; }
.fp__cov {
  flex: none; display: flex; align-items: center; gap: var(--s1); height: 36px; padding: 0 var(--s5); font-size: var(--fs-sm); color: var(--muted);
  border-top: 1px solid var(--line); transition: color var(--t) ease;
}
.fp__cov:hover { color: var(--ink); }
.fp__cov .num { color: var(--ink-2); }

.fp__list { flex: 1; min-height: 120px; overflow: auto; padding: 0 var(--s2) var(--s3); }
.fp__empty { padding: var(--s6) var(--s3); font-size: var(--fs-sm); color: var(--muted); }
.fp__grp { position: relative; }
.fp__group { position: sticky; top: 0; z-index: 2; margin: 0 calc(-1 * var(--s2)); padding: var(--s3) calc(var(--s3) + var(--s2)) var(--s1); font-size: var(--fs-xs); font-weight: 500; color: var(--muted); background: var(--bg); box-shadow: 0 2px 0 var(--bg); }
.fp__grp:first-child > .fp__group { padding-top: var(--s2); }
.fp--solo { position: relative; }
.fp--solo .fp__head { padding-right: calc(var(--s3) + 64px); }
.fp--solo .fp__bar { position: absolute; top: 0; right: var(--s3); z-index: 3; height: 48px; padding: 0; }

.row {
  width: 100%; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: var(--s3);
  min-height: var(--row-fact); padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-body);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}
.row:hover { background: var(--bg-2); }
.row.hov { background: var(--blue-wash); }
.row.sel { background: var(--card); box-shadow: inset 0 0 0 1px var(--line-2); }
.row__mark { display: grid; place-items: center; }
.row__ok { color: var(--sev-ok); }
.row__ed { color: var(--ink-2); }
.row.rel { background: var(--blue-wash); }
.row.rel.sel { background: var(--card); }
.row__name { min-width: 0; display: flex; align-items: center; gap: var(--s2); }
.row__label { flex: 0 1 auto; min-width: 3.5ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__name .dot { flex: none; }
.row__tag { flex: 0 100 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
.row__tag--ed { color: var(--ink-2); }
.row__tag--n { padding: 1px 7px; border-radius: var(--r-pill); box-shadow: inset 0 0 0 1px var(--line-2); }
.row.sub { min-height: var(--row-fact-sub); }
.row.sub .row__label, .row.sub .row__val { color: var(--muted); font-weight: 400; }
.row.sub .row__name { padding-left: var(--s3); }
.row__src { min-width: 34px; font-size: var(--fs-xs); color: var(--faint); white-space: nowrap; text-align: right; }
.row:hover .row__src, .row.sel .row__src { color: var(--muted); }
.row__val { min-width: 74px; text-align: right; font-weight: 500; }
.row.rej .row__label, .row.rej .row__val { text-decoration: line-through; color: var(--faint); }
.iss { margin: 0 0 2px; padding: var(--s2) var(--s3) var(--s3); border-radius: var(--r); transition: background-color var(--t) ease, box-shadow var(--t) ease; }
.iss:hover { background: var(--bg-2); }
.iss.on { background: var(--card); box-shadow: inset 0 0 0 1px var(--line-2); }
.iss__head { width: 100%; display: flex; align-items: flex-start; gap: var(--s2); padding: 0; text-align: left; font-size: var(--fs-body); font-weight: 500; line-height: 1.4; }
.iss__head:disabled { cursor: default; }
.iss__head .dot { margin-top: 7px; flex: none; }
.iss__t { flex: 1; min-width: 0; }
.iss__lv { flex: none; padding-left: var(--s2); font-size: var(--fs-xs); font-weight: 400; color: var(--muted); white-space: nowrap; }
.iss--err .iss__lv { color: var(--ink-2); }
.iss__text { margin: var(--s1) 0 0 var(--s4); font-size: var(--fs-sm); color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.iss__act { margin: var(--s3) 0 0 var(--s4); display: flex; flex-wrap: wrap; gap: var(--s1); }
.iss--done { padding-bottom: var(--s2); }
.iss--done .iss__t { color: var(--muted); font-weight: 400; }
.iss--done .iss__lv { color: var(--muted); }
.iss__ok { flex: none; margin-top: 3px; color: var(--sev-ok); }
.iss__act--done { margin-top: var(--s1); }
.iss__back { display: inline-flex; align-items: center; gap: var(--s1); height: 28px; padding: 0 var(--s2); margin-left: calc(-1 * var(--s2)); border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--ink-2); transition: background-color var(--t) ease, color var(--t) ease; }
.iss__back:hover { background: var(--bg-2); color: var(--ink); }
.card {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--card);
  --fs-hero: 40px;
}
.card__none { flex: 1; min-height: 0; display: grid; place-content: center; justify-items: center; gap: var(--s2); padding: var(--s5); text-align: center; color: var(--muted); font-size: var(--fs-body); }
.card__none-s { font-size: var(--fs-sm); color: var(--faint); }
.card__body { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--s4) var(--s5) var(--s3); }
.card__ititle { display: flex; align-items: flex-start; gap: var(--s2); margin: var(--s1) 0 0; font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; }
.card__ititle .dot { margin-top: 8px; flex: none; }
.card__itext { margin: var(--s2) 0 0; font-size: var(--fs-body); line-height: 1.5; color: var(--ink-2); }
.card__show--l { margin: var(--s3) 0 0 calc(-1 * var(--s2)); }
.card__top { position: sticky; top: calc(-1 * var(--s4)); z-index: 2; margin: calc(-1 * var(--s4)) calc(-1 * var(--s5)) 0; padding: var(--s4) var(--s5) var(--s1); background: var(--card); }
.card__raw b { font-weight: 500; color: var(--ink); }
.card__label { font-size: var(--fs-sm); color: var(--muted); }
.card__value { font-size: var(--fs-hero); font-weight: 300; line-height: 1.1; letter-spacing: -0.02em; margin: var(--s1) 0 0; overflow-wrap: anywhere; }
.card__value.rej { color: var(--faint); text-decoration: line-through; }
.card__value.txt, .card--sheet .card__value.txt { font-size: var(--fs-h2); font-weight: 500; line-height: 1.3; letter-spacing: 0; }
.card__raw { font-size: var(--fs-sm); color: var(--muted); }
.card__conf { margin-top: var(--s3); display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-sm); color: var(--ink-2); }
.card__conf .num { color: var(--muted); font-size: var(--fs-xs); }
.card__cross { margin-top: var(--s1); display: flex; align-items: flex-start; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.card__cross.over { color: var(--ink); }
.card__cross .dot { margin-top: 7px; flex: none; }
.card__src { margin-top: var(--s1); display: flex; align-items: center; justify-content: space-between; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.card__where { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__show { flex: none; display: inline-flex; align-items: center; gap: var(--s2); height: 32px; padding: 0 var(--s2); border-radius: var(--r-sm); font-size: var(--fs-sm); font-weight: 500; color: var(--ink); transition: background-color var(--t) ease; }
.card__show:hover { background: var(--bg-2); }
.card__quote { margin: var(--s2) 0 0; padding: var(--s1) var(--s3); border-left: 2px solid var(--line-2); font-size: var(--fs-sm); line-height: 1.45; color: var(--muted); overflow-wrap: anywhere; max-height: 56px; overflow: auto; }
.card__more { margin: var(--s1) 0 0 calc(-1 * var(--s1)); display: inline-flex; align-items: center; gap: var(--s1); height: 32px; padding: 0 var(--s1); border-radius: var(--r-xs); font-size: var(--fs-sm); color: var(--ink-2); transition: color var(--t) ease; }
.card__more:hover { color: var(--ink); }
.card__more .card__chev { transition: rotate var(--t) ease; }
.card__more[aria-expanded='true'] .card__chev { rotate: 90deg; }
.card__note { width: 100%; display: flex; align-items: center; gap: var(--s2); min-height: 32px; margin: var(--s1) 0 0; padding: 0; font-size: var(--fs-sm); color: var(--ink-2); text-align: left; }
.card__lv { flex: none; font-weight: 400; font-size: var(--fs-xs); color: var(--muted); }
.card__note span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__note :deep(.ico) { color: var(--muted); }
.card__note:hover { color: var(--ink); }
.card__how { margin: var(--s2) 0 0 calc(-1 * var(--s1)); display: inline-flex; align-items: center; gap: var(--s1); height: 32px; padding: 0 var(--s1); border-radius: var(--r-xs); font-size: var(--fs-sm); color: var(--ink-2); transition: color var(--t) ease; }
.card__how:hover { color: var(--ink); }
.card__chev { transition: rotate var(--t) ease; }
.card__chev.open { rotate: 90deg; }
.trace { list-style: none; margin: var(--s1) 0 0 3px; padding: 0; font-size: var(--fs-sm); }
.trace li { position: relative; display: flex; gap: var(--s2); padding: 0 0 var(--s1) var(--s4); line-height: 1.4; }
.trace li::before { content: ''; position: absolute; left: 0; top: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--card); box-shadow: 0 0 0 1.5px var(--line-2); }
.trace li::after { content: ''; position: absolute; left: 3px; top: 15px; bottom: -1px; width: 1px; background: var(--line-2); }
.trace li.last::after { display: none; }
.trace li.last::before { background: var(--ink); box-shadow: none; }
.trace__k { flex: none; min-width: 66px; color: var(--muted); }
.trace__v { min-width: 0; overflow-wrap: anywhere; }
.trace li.last .trace__v { font-weight: 500; }
.card__issues { list-style: none; padding: 0; margin: var(--s1) 0 0; display: flex; flex-direction: column; gap: var(--s2); }
.card__issues li { display: flex; gap: var(--s2); font-size: var(--fs-sm); }
.card__issues .dot { margin-top: 7px; }
.card__issues b { font-weight: 500; }
.card__issues p { color: var(--muted); }
.card__hint { margin-top: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.card__hint.bad { color: var(--red); }
.card__dive { margin-top: var(--s3); display: grid; border-top: 1px solid var(--line); }
.dive { display: flex; align-items: center; gap: var(--s2); min-height: 40px; font-size: var(--fs-sm); color: var(--ink-2); border-bottom: 1px solid var(--line); transition: color var(--t) ease; }
.dive span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dive .ico { color: var(--muted); }
.dive:hover { color: var(--ink); }
.dive:hover .dive__go { color: var(--blue); translate: 1px -1px; }
.dive__go { transition: translate var(--t) ease, color var(--t) ease; }
.card__bar { flex: none; padding: var(--s3) var(--s5) var(--s4); background: var(--card); }
.card__iss { margin: var(--s1) 0 0; padding: 0; }
.card__iss-t { display: flex; align-items: flex-start; gap: var(--s2); font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.4; }
.card__iss-t span { flex: 1; min-width: 0; }
.card__iss-t .dot { margin-top: 7px; flex: none; }
.card__iss-ok { flex: none; margin-top: 3px; color: var(--sev-ok); }
.card__iss-x { margin: var(--s1) 0 0 var(--s4); font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
.card__iss.done .card__iss-t span { color: var(--muted); }
.card__ok { flex: none; }
.card__act { display: flex; gap: var(--s2); }
.card__act .btn { height: 36px; padding: 0 var(--s3); font-size: var(--fs-body); }
.card__act .card__main { flex: 1; justify-content: center; }
.card__edit { display: grid; gap: var(--s2); }
.card__row { display: flex; gap: var(--s2); }
.card__row .card__input { flex: 1; min-width: 0; }
.card__row .btn { height: 40px; padding: 0 var(--s3); flex: none; }
.card__edit .card__hint { margin: 0; }
.card__input { width: 100%; height: 40px; padding: 0 var(--s3); font-size: var(--fs-h2); border-radius: var(--r-sm); border: 1px solid var(--line-2); background: var(--bg); outline: none; transition: border-color var(--t) ease, box-shadow var(--t) ease; }
.card__input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
.card__input.bad { border-color: var(--red); box-shadow: 0 0 0 3px var(--red-soft); }
@container (max-width: 420px) {
  .fp .btn kbd { display: none; }
  .card__act .btn { padding: 0 var(--s2); }
  .fp__head { padding-left: var(--s4); }
  .fp__cov { padding-left: var(--s4); }
  .card__body, .card__bar { padding-left: var(--s4); padding-right: var(--s4); }
  .card__top { margin-left: calc(-1 * var(--s4)); margin-right: calc(-1 * var(--s4)); padding-left: var(--s4); padding-right: var(--s4); }
}
@container (max-width: 380px) {
  .card__t { display: none; }
}
.bd { position: fixed; inset: 0; z-index: 70; background: rgb(11 11 12 / 0.4); }
.bd-enter-active, .bd-leave-active { transition: opacity 260ms ease; }
.bd-enter-from, .bd-leave-to { opacity: 0; }

.card--sheet {
  position: fixed; z-index: 71; left: 0; right: 0; bottom: 0; height: auto; max-height: 82dvh; overflow: hidden;
  border-radius: var(--r-lg) var(--r-lg) 0 0; border-top: 0; animation: none; translate: 0 var(--dy, 0px);
  box-shadow: var(--shadow-pop), 0 0 0 1px var(--line);
}
.card--sheet.drag { transition: none; }
.sh-enter-active, .sh-leave-active { transition: transform 260ms var(--ease); }
.sh-enter-from, .sh-leave-to { transform: translateY(100%); }
.sh__head { flex: none; touch-action: none; padding: var(--s2) var(--s2) 0; }
.sh__grip { display: block; width: 40px; height: 5px; margin: 0 auto var(--s1); border-radius: var(--r-pill); background: var(--line-2); }
.sh__nav { display: flex; align-items: center; justify-content: space-between; }
.sh__pos { font-size: var(--fs-sm); color: var(--muted); }
.sh__arrow { width: 44px; height: 44px; }
.sh__arrow--prev :deep(svg) { rotate: 180deg; }
.sh__arrow:disabled { opacity: 0.3; }
.card--sheet .card__body { padding: 0 var(--s4) var(--s3); }
.card--sheet .card__top { margin: 0 calc(-1 * var(--s4)); padding: 0 var(--s4) var(--s1); top: 0; }
.card--sheet .card__note { align-items: flex-start; padding: var(--s2) 0; }
.card--sheet .card__note .dot { margin-top: 8px; }
.card--sheet .card__note span { white-space: normal; overflow: visible; text-overflow: clip; }
.card--sheet .card__value { font-size: 44px; }
.card--sheet .card__label, .card--sheet .card__raw, .card--sheet .card__src, .card--sheet .card__conf, .card--sheet .card__cross, .card--sheet .card__quote, .card--sheet .trace, .card--sheet .card__issues li { font-size: var(--fs-body); }
.card--sheet .card__show { height: 44px; padding: 0 var(--s3); }
.card--sheet .card__src { flex-direction: column; align-items: flex-start; gap: 0; }
.card--sheet .card__where { white-space: normal; overflow: visible; }
.card--sheet .card__show { margin-left: calc(-1 * var(--s3)); }
.card--sheet .card__more { height: 44px; font-size: var(--fs-body); }
.card--sheet .card__note { min-height: 44px; font-size: var(--fs-body); }
.card--sheet .card__how { height: 44px; font-size: var(--fs-body); }
.card--sheet .card__quote { max-height: none; }
.card--sheet .dive { min-height: 48px; font-size: var(--fs-body); }
.card--sheet .card__bar { padding: var(--s3) var(--s4) calc(var(--s3) + var(--safe-b)); box-shadow: 0 -8px 16px -12px rgb(0 0 0 / 0.25); }
.card--sheet .card__act .btn { height: 48px; font-size: 15px; justify-content: center; padding: 0 var(--s4); }
.card--sheet .card__act { gap: var(--s2); }
.card--sheet .card__act .btn { flex: 1 1 0; min-width: 0; padding: 0 var(--s2); }
.card--sheet .card__act .card__main { flex: 1.3 1 0; }
.card--sheet .card__act .btn:not(.card__main) .ico { display: none; }
.card--sheet .card__act--long .card__main { flex: 1 1 100%; }
.card--sheet .card__input { height: 48px; font-size: 18px; }
.card--sheet .card__row { flex-wrap: wrap; }
.card--sheet .card__row .card__input { flex-basis: 100%; }
.card--sheet .card__row .btn { flex: 1 1 0; height: 48px; }
.card--sheet kbd { display: none; }

@media (max-width: 768px) {
  .fp--m { border-left: 0; }
  .fp--m .fp__head { padding: 0 var(--s4); height: 52px; }
  .fp--m .fp__next { height: 44px; }
  .fp--m .fp__bar { height: 48px; padding: 0 var(--s2) 0 var(--s3); }
  .fp--m.fp--solo .fp__bar { height: 52px; padding: 0; right: var(--s2); }
  .fp--m.fp--solo .fp__head { padding-right: calc(var(--s2) + 88px); }
  .fp--m .fp__tabs button { height: 44px; font-size: var(--fs-body); }
  .fp--m .fp__tool { width: 44px; height: 44px; }
  .fp--m .fp__menu { max-height: 55dvh; }
  .fp--m.fp--sheet .fp__list { padding-bottom: 62dvh; }
  .fp--m .fp__cov { height: 48px; padding: 0 var(--s4); font-size: var(--fs-body); }
  .fp--m .fp__list { padding: 0 var(--s2) calc(var(--s6) + var(--safe-b)); }
  .fp--m .row { grid-template-columns: 16px minmax(0, 1fr) auto; min-height: 52px; font-size: 15px; border-radius: var(--r); }
  .fp--m .row__src { display: none; }
  .fp--m .row.sel { background: var(--bg-2); box-shadow: none; }
  .fp--m .row__val { min-width: 0; }
  .fp--m .fp__group { margin: 0 calc(-1 * var(--s2)); padding: var(--s4) calc(var(--s3) + var(--s2)) var(--s1); }
  .fp--m .iss h3 { font-size: 15px; }
  .fp--m .iss p { font-size: var(--fs-body); }
  .fp--m .iss__act .btn { height: 44px; }
  .fp--m .iss__back { height: 44px; padding: 0 var(--s3); margin-left: calc(-1 * var(--s3)); font-size: var(--fs-body); }
}
</style>
