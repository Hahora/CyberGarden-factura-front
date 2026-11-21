<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from '../components/Icon.vue'
import PaperReview from '../components/PaperReview.vue'
import Thread from '../components/Thread.vue'
import DupNotice from '../components/DupNotice.vue'
import BackChip from '../components/BackChip.vue'
import UiProgress from '../components/UiProgress.vue'
import UiSpinner from '../components/UiSpinner.vue'
import { openDeep, useViewState } from '../viewState'
import { ask, askPaper } from '../query'
import { STAGES, setPaperTopic, acceptAll, chatOf, chatOfPaper, collectionOf, exportJSON, factsOf, levelDot, openIssues, paperOf, pinChat, projectOf, qualityOf, state, topLevel, valueOf } from '../store'
import { COLLECTIONS, fmt, paramOf, rowLabel, sampleWords } from '../data'
import { plural } from '../search'
import { coverageOf } from '../structure'
import { mainFactId } from '../norm'
import { fmtInt } from '../fmt'

const props = defineProps<{ id: string }>()
const route = useRoute()
const router = useRouter()
const chat = computed(() => chatOf(props.id))
const project = computed(() => projectOf(chat.value?.projectId))
const collection = computed(() => collectionOf(chat.value))
const paper = computed(() => paperOf(chat.value?.paperId))

type Mode = 'chat' | 'facts' | 'paper'
const mode = computed<Mode>(() => {
  const q = route.query.view
  if (q === 'chat' || q === 'facts' || q === 'paper') return q
  if (q === 'review') return 'facts'
  if (state.mobile && q === 'facts' && ['structure', 'links', 'coverage'].includes(String(route.query.pane))) return 'paper'
  if (state.mobile && !route.query.fact) return 'chat'
  return 'facts'
})
const view = computed(() => (mode.value === 'chat' ? 'chat' : 'review'))
const MODES = [
  { v: 'review' as const, icon: 'doc' as const, label: 'Разбор' },
  { v: 'chat' as const, icon: 'chat' as const, label: 'Чат по статье' },
]
const setMode = (v: Mode, fact?: string) => {
  const to = { query: { view: v, ...(fact ? { fact } : {}), ...(route.query.pane ? { pane: route.query.pane } : {}) } }
  void (state.mobile ? router.replace(to) : router.push(to))
}
const setView = (v: 'review' | 'chat', fact?: string) => setMode(v === 'chat' ? 'chat' : 'facts', fact)
const rev = ref<InstanceType<typeof PaperReview> | null>(null)
const onMode = (v: 'review' | 'chat') => (v === 'review' && view.value === 'review' ? rev.value?.expandFacts() : setView(v))
const cov = computed(() => (paper.value ? coverageOf(paper.value) : null))
const openCoverage = () => void openDeep(router, { query: { view: state.mobile ? 'paper' : 'facts', pane: 'coverage' } })
const openReview = (fact?: string) => void openDeep(router, { query: { view: state.mobile ? 'paper' : 'facts', ...(fact ? { fact } : {}), ...(route.query.pane ? { pane: route.query.pane } : {}) } })
const pane = computed<'facts' | 'paper'>(() => (mode.value === 'paper' ? 'paper' : 'facts'))

function openCite(factId: string, paperId: string) {
  if (paperId === paper.value?.id) return openReview(factId)
  const c = chatOfPaper(paperId)
  if (c) void openDeep(router, `/c/${c.id}?${state.mobile ? 'view=paper&' : ''}fact=${encodeURIComponent(factId)}`)
}

const quality = computed(() => (paper.value ? qualityOf(paper.value) : null))
const issues = computed(() => (paper.value ? openIssues(paper.value) : []))
const best = computed(() => (paper.value ? paramOf(paper.value.collection, COLLECTIONS[paper.value.collection].best) : null))
const summaryRows = computed(() => {
  const p = paper.value
  if (!p) return []
  const c = COLLECTIONS[p.collection]
  const facts = factsOf(p.id).filter((f) => f.status !== 'rejected')
  return p.rows.map((r) => ({
    id: r.id,
    label: rowLabel(p, r.id),
    cells: c.table.map((k) => {
      const f = facts.find((x) => x.row === r.id && x.param === k)
      return { k, f, text: f ? fmt(valueOf(f), paramOf(p.collection, k), false) : '—' }
    }),
  }))
})
const issueDot = computed(() => levelDot(paper.value ? topLevel(paper.value) : null))
const left = computed(() => (paper.value ? factsOf(paper.value.id).filter((f) => f.status === 'new').length : 0))
const reviewed = computed(() => (quality.value ? quality.value.total - left.value : 0))
const issueFacts = computed(() => new Set(issues.value.flatMap((i) => i.factIds)))
const PAPER_SUGGEST = computed(() => [paper.value?.collection === 'rag' ? 'Какая конфигурация лучшая?' : 'Какой образец лучший?', 'Где данные не сходятся?', 'Чего не хватает?'])
const sumUi = useViewState('summary', () => ({ issues: false }))
const quick = (q: string) => chat.value && askPaper(chat.value.id, q)

const fileName = computed(() => paper.value?.file ?? (paper.value ? paper.value.id + '.pdf' : ''))
const pct = computed(() => Math.min(100, Math.floor(paper.value?.processing ?? 0)))
const stage = computed(() => Math.min(STAGES.length - 1, Math.floor((pct.value / 100) * STAGES.length)))
const TOPIC_BY = { project: 'тема проекта', text: 'по названию и аннотации', guess: 'не уверен — проверьте', manual: 'выбрано вами' } as const
const topicAsk = ref(false)
const otherTopic = computed(() => Object.values(COLLECTIONS).find((x) => x.id !== paper.value?.collection))
const authorsLine = computed(() => (paper.value?.mine ? `Загружено вами · ${paper.value.pages} стр.` : paper.value ? `${paper.value.authors}, ${paper.value.year}` : ''))
const topicBy = computed(() => (paper.value?.topicBy ? TOPIC_BY[paper.value.topicBy] : null))
const found = computed(() => (paper.value ? Math.round((factsOf(paper.value.id).length * pct.value) / 100) : 0))
</script>

<template>
  <div v-if="!chat" class="missing">
    <p>Чат не найден — возможно, его удалили.</p>
    <RouterLink to="/app" class="btn btn--soft">На главную</RouterLink>
  </div>

  <div v-else-if="chat.kind === 'paper' && paper" class="pv">
    <nav v-if="paper.processing >= 100 && state.mobile" class="seg3" role="tablist" aria-label="Режим статьи">
      <button v-for="m in (['chat', 'facts', 'paper'] as const)" :key="m" type="button" role="tab" :aria-selected="mode === m" :class="{ on: mode === m }" @click="setMode(m)">
        {{ m === 'chat' ? 'Чат' : m === 'facts' ? 'Факты' : 'Статья' }}
        <span v-if="m === 'facts' && issues.length" class="dot" :class="issueDot" />
      </button>
    </nav>

    <header v-if="paper.processing < 100 && !state.mobile" class="tabs tabs--title">
      <BackChip class="tabs__back" />
      <span class="tabs__name" :title="fileName">{{ fileName }}</span>
    </header>

    <header v-if="paper.processing >= 100 && !state.mobile && view === 'chat'" class="tabs tabs--head">
      <BackChip class="tabs__back" />
      <div class="tabs__title"><h1 :title="paper.title">{{ paper.title }}</h1><p>{{ paper.authors }} · {{ paper.year }}</p></div>
      <nav class="tabs tabs--in" aria-label="Режим статьи">
        <button v-for="m in MODES" :key="m.v" type="button" class="tabs__btn" :class="{ 'is-on': view === m.v }" @click="setView(m.v)">
          <Icon :name="m.icon" :size="16" />{{ m.label }}
        </button>
      </nav>
      <span class="tabs__gap" aria-hidden="true" />
    </header>

    <PaperReview
      v-if="view === 'review' && paper.processing >= 100"
      ref="rev"
      :key="'r' + paper.id"
      :paper-id="paper.id"
      :pane="state.mobile ? pane : undefined"
      class="pv__body"
      @update:pane="(v) => setMode(v)"
    >
      <template #back><BackChip /></template>
      <template #modes>
        <nav class="tabs tabs--in" aria-label="Режим статьи">
          <button v-for="m in MODES" :key="m.v" type="button" class="tabs__btn" :class="{ 'is-on': view === m.v }" @click="onMode(m.v)">
            <Icon :name="m.icon" :size="16" />{{ m.label }}
          </button>
        </nav>
      </template>
    </PaperReview>

    <Thread
      v-else
      class="pv__body"
      :chat="chat"
      :collection="paper.collection"
      :show-explore="false"
      placeholder="Спросите об этой статье…"
      @send="(t) => askPaper(chat!.id, t)"
      @cite="openCite"
    >
      <template #lead>
        <div class="upl">
          <div class="file">
            <span class="file__ico"><Icon name="doc" :size="20" /></span>
            <span class="file__txt">
              <b>{{ fileName }}</b>
              <span class="num">PDF · {{ paper.pages }} стр.</span>
            </span>
          </div>
        </div>

        <DupNotice :paper-id="paper.id" />
        <section v-if="paper.processing < 100" class="prog" aria-live="polite">
          <div class="prog__head">
            <span class="prog__logo"><Icon name="logo" :size="22" /></span>
            <p class="prog__title">Разбираю статью…</p>
            <span class="prog__pct num">{{ pct }}%</span>
          </div>
          <UiProgress :value="pct" label="Разбор статьи" />
          <div v-if="topicBy" class="topic" :class="{ 'is-guess': paper.topicBy === 'guess' }" data-tip="Определена по названию; можно поменять">
            <span class="topic__lbl">Тема статьи:</span>
            <span class="topic__seg" role="radiogroup" aria-label="Тема статьи">
              <button
                v-for="c in Object.values(COLLECTIONS)" :key="c.id" type="button" role="radio" :aria-checked="paper.collection === c.id"
                :class="{ on: paper.collection === c.id }" :disabled="paper.topicBy === 'project'" @click="setPaperTopic(paper.id, c.id)"
              ><Icon :name="c.icon" :size="14" />{{ state.mobile ? c.name.split(' ')[0] : c.name }}</button>
            </span>
            <span class="topic__why">{{ topicBy }}</span>
          </div>
          <ol class="prog__stages" role="list">
            <li v-for="(s, i) in STAGES" :key="s" :class="{ 'is-done': i < stage, 'is-now': i === stage }">
              <span class="prog__mark" aria-hidden="true">
                <Icon v-if="i < stage" name="check" :size="13" />
                <UiSpinner v-else-if="i === stage" :size="14" tone="blue" label="Выполняется" />
              </span>{{ s }}
            </li>
          </ol>
          <p class="prog__found">Найдено фактов: <b class="num">{{ found }}</b> · каждый со ссылкой на место в PDF</p>
        </section>

        <section v-else class="sum">
          <div class="sum__head">
            <Icon name="logo" :size="22" />
            <div>
              <p class="sum__title">Статья разобрана</p>
              <p class="sum__sub">{{ paper.title }} · {{ authorsLine }}</p>
              <p v-if="paper.mine && paper.topicBy !== 'project'" class="sum__topic">
                Тема статьи: {{ COLLECTIONS[paper.collection].name }}<template v-if="paper.topicBy === 'manual'"> (выбрано вами)</template>
                <button v-if="!topicAsk" type="button" class="sum__chg" @click="topicAsk = true">сменить</button>
                <template v-else-if="otherTopic">
                  <span class="sum__conf">Разобрать заново как «{{ otherTopic.name }}»?</span>
                  <button type="button" class="btn btn--soft btn--sm" @click="setPaperTopic(paper.id, otherTopic.id); topicAsk = false">Разобрать</button>
                  <button type="button" class="btn btn--ghost btn--sm" @click="topicAsk = false">Отмена</button>
                </template>
              </p>
            </div>
          </div>
          <p v-if="quality" class="sum__q">
            <span class="num">{{ fmtInt(quality.total) }} {{ plural(quality.total, ['факт', 'факта', 'фактов']) }}</span>
            <i aria-hidden="true">·</i>
            <button v-if="issues.length" type="button" class="sum__iss num" :aria-expanded="sumUi.issues" @click="sumUi.issues = !sumUi.issues">
              <span class="dot" :class="issueDot" />{{ issues.length }} {{ plural(issues.length, ['замечание', 'замечания', 'замечаний']) }}<Icon class="sum__chev" :class="{ 'is-open': sumUi.issues }" name="chevron-right" :size="14" />
            </button>

          </p>

          <table class="sum__table">
            <thead>
              <tr>
                <th>{{ sampleWords(paper.collection).cap }}</th>
                <th v-for="k in COLLECTIONS[paper.collection].table" :key="k" class="num">
                  {{ paramOf(paper.collection, k).label }}<span v-if="paramOf(paper.collection, k).unit">, {{ paramOf(paper.collection, k).unit }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in summaryRows" :key="r.id">
                <td>{{ r.label }}</td>
                <td v-for="c in r.cells" :key="c.k" class="num">
                  <button v-if="c.f" type="button" class="sum__cell" :class="{ 'is-issue': issueFacts.has(c.f.id), 'is-best': c.k === best?.key }" @click="openReview(c.f.id)">
                    {{ c.text }}
                  </button>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>

          <p v-if="issueFacts.size" class="sum__legend"><span class="sum__key">12,3</span> пунктиром отмечены числа с замечаниями</p>

          <ul v-if="issues.length && sumUi.issues" class="sum__issues" role="list">
            <li v-for="i in issues" :key="i.id">
              <span class="dot" :class="levelDot(i.level)" />
              <span><b>{{ i.title }}.</b> {{ i.text }}</span>
              <button v-if="mainFactId(i)" type="button" class="olink" @click="openReview(mainFactId(i))">Показать в статье<Icon name="arrow-up-right" :size="15" /></button>
            </li>
          </ul>

          <div class="sum__ask">
            <button v-if="quality && quality.total" type="button" class="btn btn--dark sum__go" @click="openReview()">{{ reviewed === 0 ? `Проверить ${quality.total} ${plural(quality.total, ['факт', 'факта', 'фактов'])}` : left > 0 ? `Продолжить: осталось ${left}` : 'Открыть разбор' }} <Icon name="arrow-right" :size="15" /></button>
            <button v-for="q in PAPER_SUGGEST" :key="q" type="button" class="sum__chip" @click="quick(q)">{{ q }}</button>
            <button v-if="cov" type="button" class="sum__cov" @click="openCoverage">{{ cov.total - cov.filled > 0 ? `${cov.total - cov.filled} ${plural(cov.total - cov.filled, ['параметр', 'параметра', 'параметров'])} не найдено` : 'Все параметры найдены' }}<Icon name="chevron-right" :size="14" /></button>
          </div>
        </section>
      </template>
    </Thread>

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="state.mobile && state.paperInfo && paper" class="info__bd" @click="state.paperInfo = false" />
      </Transition>
      <Transition name="sheet">
        <section v-if="state.mobile && state.paperInfo && paper" class="info" role="dialog" aria-modal="true" aria-label="О статье">
          <span class="info__grip" aria-hidden="true" />
          <h2 class="info__title">{{ paper.title }}</h2>
          <p class="info__meta">{{ paper.mine ? 'Загружено вами' : paper.authors + ' · ' + paper.year }}</p>
          <p class="info__meta">{{ paper.journal }}</p>
          <p v-if="project" class="info__proj"><Icon name="folder" :size="15" />{{ project.name }}</p>
          <div v-if="quality" class="info__stats">
            <div><b class="num">{{ fmtInt(quality.total) }}</b><span>{{ plural(quality.total, ['факт', 'факта', 'фактов']) }}</span></div>
            <div><b class="num">{{ quality.sourced }}%</b><span>с источником</span></div>
            <div><b class="num">{{ quality.accepted }}</b><span>принято</span></div>
            <div :class="{ 'is-warn': issues.length }"><b class="num">{{ issues.length }}</b><span>{{ plural(issues.length, ['замечание', 'замечания', 'замечаний']) }}</span></div>
          </div>
          <div class="info__acts">
            <button type="button" class="info__act" @click="acceptAll(paper.id); state.paperInfo = false"><Icon name="check" :size="20" />Принять все факты</button>
            <button type="button" class="info__act" @click="exportJSON([paper.id], paper.id + '.json'); state.paperInfo = false"><Icon name="export" :size="20" />Экспорт JSON</button>
            <button type="button" class="info__act" @click="pinChat(chat.id); state.paperInfo = false"><Icon name="pin" :size="20" />{{ chat.pinned ? 'Открепить чат' : 'Закрепить чат' }}</button>
            <button type="button" class="info__act" @click="state.paperInfo = false; setMode('paper')"><Icon name="doc" :size="20" />Открыть статью</button>
          </div>
        </section>
      </Transition>
    </Teleport>
  </div>

  <div v-else class="ask">
    <header class="ask__head">
      <BackChip />
      <RouterLink v-if="project" :to="'/p/' + project.id" class="ask__crumb"><Icon name="folder" :size="16" />{{ project.name }}</RouterLink>
      <span v-if="project" class="ask__sep">/</span>
      <span class="ask__title">{{ chat.title }}</span>
    </header>
    <Thread
      :chat="chat"
      :collection="collection"
      :lock-collection="!!chat.projectId || chat.turns.length > 0"
      @send="(t) => ask(chat!.id, t)"
      @cite="openCite"
      @collection="(c) => chat && (chat.collection = c)"
    />
  </div>
</template>

<style scoped>
.missing { height: 100%; display: grid; place-content: center; justify-items: center; gap: 14px; color: var(--muted); }
.pv { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); }
.pv__body { grid-row: 2; min-height: 0; min-width: 0; }
.tabs { display: flex; align-items: center; gap: 2px; height: 44px; padding: 0 16px; border-bottom: 1px solid var(--line); }
.tabs__btn {
  position: relative; display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border-radius: var(--r-sm);
  color: var(--muted); font-weight: 500; transition: color var(--t) ease, background-color var(--t) ease;
}
.tabs__btn:hover { color: var(--ink); background: var(--bg-2); }
.tabs__btn.is-on { color: var(--ink); background: var(--bg-2); }
.tabs--head { height: auto; gap: var(--s3); padding: var(--s3) var(--s3) var(--s3) var(--s5); }
.tabs__title { min-width: 0; flex: 1; }
.tabs__title h1 { font-size: var(--fs-h2); font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs__title p { margin-top: 2px; font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs__gap { flex: none; width: 36px; }
.tabs__name { flex: 1; min-width: 0; margin-left: var(--s3); font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tabs--title .tabs__name { margin-left: 0; color: var(--ink-2); font-weight: 500; }
.sum__go { margin: var(--s2) var(--s2) 0 0; }
.tabs--in { height: auto; padding: 3px; gap: 2px; border: 0; border-radius: var(--r); background: var(--bg-2); }
.tabs--in .tabs__btn { height: 30px; padding: 0 var(--s3); font-size: var(--fs-sm); }
.tabs--in .tabs__btn:hover { background: transparent; }
.tabs--in .tabs__btn.is-on { background: var(--card); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 0 0 1px var(--line); }

.ask { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); grid-template-columns: minmax(0, 1fr); }
.ask__head { display: flex; align-items: center; gap: var(--s2); min-width: 0; height: 52px; padding: 0 var(--s6); border-bottom: 1px solid var(--line); }
.ask__crumb { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.ask__crumb:hover { color: var(--ink); }
.ask__sep { color: var(--faint); }
.ask__title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sum { display: grid; gap: var(--s4); min-width: 0; padding: var(--s5); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); animation: sum-in 360ms var(--ease) both; }
@keyframes sum-in { from { opacity: 0; translate: 0 6px; } }
.sum__head { display: flex; gap: 12px; align-items: center; }
.sum__title { font-weight: 600; font-size: var(--fs-h2); line-height: 1.3; }
.sum__topic { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); margin-top: var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.sum__chg { color: var(--blue); font-weight: 500; }
.sum__chg:hover { text-decoration: underline; text-underline-offset: 3px; }
.sum__conf { color: var(--ink-2); }
.sum__sub { font-size: var(--fs-sm); color: var(--muted); }
.sum__q { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); font-size: var(--fs-body); color: var(--ink-2); }
.sum__q i { font-style: normal; color: var(--faint); }
.sum__iss { display: inline-flex; align-items: center; gap: var(--s2); color: var(--ink-2); border-radius: var(--r-sm); }
.sum__iss:hover { color: var(--ink); }
.sum__chev { color: var(--muted); transition: rotate 200ms var(--ease); }
.sum__chev.is-open { rotate: 90deg; }
.sum__cov { display: inline-flex; align-items: center; gap: 2px; min-height: 32px; margin-top: var(--s2); padding: 0 var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.sum__cov:hover { color: var(--ink); }
.sum__table { width: 100%; border-collapse: collapse; font-size: var(--fs-body); }
.sum__table th { padding: 0 var(--s2) var(--s2); text-align: right; font-weight: 500; font-size: var(--fs-xs); color: var(--muted); border-bottom: 1px solid var(--line); }
.sum__table th:first-child, .sum__table td:first-child { text-align: left; padding-left: 0; }
.sum__table td { height: var(--row-td-sm); padding: 2px var(--s2); text-align: right; border-bottom: 1px solid var(--line); }
.sum__cell { padding: 4px 6px; margin: 2px -6px; border-radius: var(--r-xs); transition: background-color var(--t) ease; }
.sum__cell:hover { background: var(--blue-soft); }
.sum__cell.is-best { font-weight: 600; }
@media (max-width: 768px) { .sum__cell { display: inline-flex; align-items: center; justify-content: flex-end; min-width: 44px; min-height: 44px; margin: 0 -6px; } .sum__table td { height: 48px; } }
.sum__cell.is-issue { text-decoration: underline dotted var(--amber); text-underline-offset: 4px; }
.sum__legend { margin: calc(-1 * var(--s2)) 0 0; font-size: var(--fs-xs); color: var(--muted); }
.sum__key { text-decoration: underline dotted var(--amber); text-underline-offset: 4px; color: var(--ink-2); }
.sum__issues { list-style: none; padding: 0; display: grid; gap: 8px; }
.sum__issues li { display: grid; grid-template-columns: auto 1fr auto; align-items: start; gap: var(--s3); font-size: var(--fs-body); line-height: 1.5; }
.sum__issues .dot { margin-top: 7px; }
.sum__issues b { font-weight: 600; }
.olink { display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--fs-body); font-weight: 500; color: var(--blue); white-space: nowrap; }
.olink:hover { text-decoration: underline; text-underline-offset: 3px; }
.sum__ask { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
.sum__chip { min-height: 32px; padding: 0 var(--s3); margin-top: var(--s2); border-radius: var(--r-pill); font-size: var(--fs-sm); box-shadow: inset 0 0 0 1px var(--line-2); transition: background-color var(--t) ease; }
.sum__chip:hover { background: var(--bg-2); }
@media (max-width: 768px) {
  .ask__head { display: none; }
  .ask { grid-template-rows: minmax(0, 1fr); }
  .tabs { height: 48px; padding: 0 10px; gap: 6px; }
  .tabs__btn { flex: 1; justify-content: center; height: 38px; }
  .sum { padding: var(--s4); }
  .sum__table { font-size: var(--fs-sm); display: block; overflow-x: auto; white-space: nowrap; }
  .sum__issues li { grid-template-columns: auto 1fr; }
  .sum__issues .olink { grid-column: 2; justify-self: start; min-height: 40px; align-items: center; }
  .sum__chip { min-height: 40px; }
}
.seg3 { flex: none; display: flex; gap: 2px; margin: 8px 12px 4px; padding: 3px; border-radius: var(--r); background: var(--bg-2); }
.seg3 button {
  flex: 1; height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: var(--r-sm);
  font-size: 15px; font-weight: 500; color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease;
}
.seg3 button.on { color: var(--ink); background: var(--card); box-shadow: 0 1px 3px rgb(0 0 0 / 0.14); }
.info__bd { position: fixed; inset: 0; z-index: 85; background: rgb(0 0 0 / 0.4); }
.info {
  position: fixed; z-index: 86; left: 0; right: 0; bottom: 0; max-height: 85dvh; overflow: auto;
  padding: 10px 20px calc(16px + var(--safe-b)); border-radius: var(--r-lg) var(--r-lg) 0 0;
  background: var(--card); box-shadow: var(--shadow-pop);
}
.info__grip { display: block; width: 40px; height: 5px; margin: 0 auto 14px; border-radius: var(--r-pill); background: var(--line-2); }
.info__title { font-size: 19px; font-weight: 600; line-height: 1.3; }
.info__meta { margin-top: 4px; font-size: var(--fs-sm); color: var(--muted); }
.info__proj { margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--ink-2); }
.info__stats { margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.info__stats div { display: grid; padding: 10px; border-radius: var(--r); background: var(--bg-2); }
.info__stats b { font-size: 20px; font-weight: 400; }
.info__stats span { font-size: 11px; color: var(--muted); }
.info__stats .is-warn b { color: var(--amber); }
.info__acts { margin-top: 14px; display: grid; }
.info__act { display: flex; align-items: center; gap: 14px; min-height: 52px; font-size: 16px; border-bottom: 1px solid var(--line); }
.info__act:last-child { border-bottom: 0; }
.info__act :deep(.ico) { color: var(--muted); }
.sheet-enter-active, .sheet-leave-active { transition: translate 280ms var(--ease); }
.sheet-enter-from, .sheet-leave-to { translate: 0 100%; }
.upl { display: flex; justify-content: flex-end; }
.file {
  display: flex; align-items: center; gap: 12px; max-width: min(360px, 85%); padding: 10px 16px 10px 10px;
  border-radius: var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg); background: var(--bg-2); animation: sum-in 300ms var(--ease) both;
}
.file__ico { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: var(--r); background: var(--red); color: #fff; }
.file__txt { display: grid; min-width: 0; }
.file__txt b { font-weight: 500; font-size: var(--fs-body); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file__txt span { font-size: var(--fs-xs); color: var(--muted); }

.prog { display: grid; gap: var(--s4); padding: var(--s5); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); animation: sum-in 360ms var(--ease) both; }
.prog__head { display: flex; align-items: center; gap: 12px; }
.prog__logo { display: grid; }
.prog__title { flex: 1; font-weight: 600; font-size: var(--fs-h2); }
.prog__pct { font-size: var(--fs-sm); color: var(--muted); }
.prog__stages { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 16px; }
.prog__stages li { display: flex; align-items: center; gap: var(--s2); font-size: var(--fs-body); color: var(--faint); transition: color var(--t) ease; }
.prog__stages li.is-done { color: var(--ink-2); }
.prog__stages li.is-now { color: var(--ink); font-weight: 500; }
.prog__mark { width: 16px; height: 16px; flex: none; display: grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-2); color: var(--green); }
.is-done .prog__mark { box-shadow: none; }
.is-now .prog__mark { box-shadow: none; }
.prog__found { font-size: var(--fs-sm); color: var(--muted); }
.prog__found b { color: var(--ink); font-weight: 600; }
@media (max-width: 768px) {
  .prog { padding: var(--s4); }
  .prog__stages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.prog { min-width: 0; }
.topic { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3); font-size: var(--fs-sm); }
.topic__lbl { color: var(--muted); }
.topic__seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: var(--r-sm); background: var(--bg-2); }
.topic__seg button { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: var(--r-sm); color: var(--muted); }
.topic__seg button.on { color: var(--ink); background: var(--card); box-shadow: 0 1px 3px rgb(0 0 0 / 0.14); }
.topic__seg button:disabled:not(.on) { opacity: 0.4; }
.topic__why { color: var(--faint); }
.topic.is-guess .topic__why { color: var(--amber); }
</style>

