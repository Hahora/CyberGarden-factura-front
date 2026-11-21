<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import UiEmpty from './UiEmpty.vue'
import {
  INHERITED_TEXT, ISSUE_STATE_RU, checkLabel, issue, issueRecords, issueState, issueTodo, issuesOf, markClass, paperPath, publication, recordIds, reopenIssue, resolveIssue, resultLink, reviewInherited, reviewOf,
  type Domain, type IssueRow, type IssueState,
} from '../case'
import {
  ragCheckGroup, ragCheckLabel, ragFmtValue, ragIssue, ragIssuesOf, ragMetricName, ragPublication, ragResult,
  ragReviewMark, ragIsRejected, ragConfigNameOf,
} from '../case/rag'
import { toast } from '../store'
import { ruText } from '../case/ask'
import { isApi, DEV_TEXT } from '../config'

const props = withDefaults(defineProps<{
  pids?: string[]
  items?: { pid: string; iid: string }[]
  limit?: number
  group?: boolean
  checks?: string[]
  onlyGroups?: string[]
  showPaper?: boolean
  inPaper?: boolean
  selected?: string
  domain?: Domain
  cards?: boolean
}>(), { group: true, showPaper: true, pids: () => [], domain: 'solar' })
const emit = defineEmits<{ show: [i: IssueRow] }>()
const router = useRouter()
const route = useRoute()
const runId = computed(() => (route.path.startsWith('/run/') ? String(route.params.id ?? '') : typeof route.query.run === 'string' ? route.query.run : ''))
const withRun = <T extends { path: string; query?: Record<string, string> }>(to: T) => (runId.value ? { ...to, query: { ...to.query, run: runId.value } } : to)

const rag = computed(() => props.domain === 'rag')
const key = (i: IssueRow) => i.publication_id + ':' + i.issue_id
const stateOf = (i: IssueRow): IssueState => issueState(i.publication_id, i.issue_id, props.domain)
const labelOf = (i: IssueRow) => (rag.value ? ragCheckLabel(i.check_name) : checkLabel(i.check_name))
const isOpen = (i: IssueRow) => stateOf(i) === 'open'

const all = computed<IssueRow[]>(() => {
  const l = props.items
    ? props.items.map((x) => (rag.value ? ragIssue(x.pid, x.iid) : issue(x.pid, x.iid))).filter((i): i is IssueRow => !!i)
    : props.pids.flatMap((p) => (rag.value ? ragIssuesOf(p) : issuesOf(p)))
  let f = props.checks?.length ? l.filter((i) => props.checks!.includes(i.check_name)) : l
  if (rag.value && props.onlyGroups?.length) f = f.filter((i) => props.onlyGroups!.includes(ragCheckGroup(i.check_name, i.description)))
  return [...f.filter(isOpen), ...f.filter((i) => !isOpen(i))]
})
const openCount = computed(() => all.value.filter(isOpen).length)
const expanded = ref(false)
const list = computed(() => (props.limit && !expanded.value ? all.value.slice(0, props.limit) : all.value))

const groups = computed(() => {
  const m = new Map<string, IssueRow[]>()
  const gk = (i: IssueRow) => (rag.value ? ragCheckGroup(i.check_name, i.description) : i.check_name)
  for (const i of list.value) {
    const l = m.get(gk(i))
    if (l) l.push(i)
    else m.set(gk(i), [i])
  }
  const open = (items: IssueRow[]) => items.filter(isOpen).length
  return [...m]
    .map(([name, items]) => ({ name, label: rag.value ? name : checkLabel(name), items, open: open(items) }))
    .sort((a, b) => b.open - a.open || b.items.length - a.items.length)
})

const isEn = (t: string) => !/[а-яё]/i.test(t)

const MAXREC = 6
const ragRecords = (i: IssueRow) => recordIds(i).map((rid) => {
  const row = ragResult(i.publication_id, rid)
  return {
    rid, row,
    name: row ? `${ragMetricName(row)} ${ragFmtValue(row)}` : 'значение',
    device: row ? ragConfigNameOf(i.publication_id, row.config_id) : '',
    page: row?.source_page ?? '',
    rejected: row ? ragIsRejected(row) : false,
    mark: row ? ragReviewMark(row) : null,
    to: resultLink(i.publication_id, rid, 'rag'),
  }
})
const recs = (i: IssueRow) => (rag.value ? ragRecords(i) : issueRecords(i.publication_id, i.issue_id)).slice(0, MAXREC)
const more = (i: IssueRow) => Math.max(0, recordIds(i).length - MAXREC)
const title = (pid: string) => (rag.value ? ragPublication(pid) : publication(pid))?.title ?? ''
const autoFixed = (i: IssueRow) => {
  const ids = recordIds(i)
  return ids.length > 0 && ids.every((rid) => { const rv = reviewOf(i.publication_id, rid, props.domain); return rv.status === 'rejected' || rv.corrected != null })
}

function show(i: IssueRow) {
  emit('show', i)
  if (!props.inPaper) void router.push(withRun({ path: paperPath(i.publication_id, props.domain), query: { i: i.issue_id } }))
}
function mark(i: IssueRow, how: 'fixed' | 'ok') {
  if (isApi) return
  const d = props.domain
  const prev = resolveIssue(i.publication_id, i.issue_id, how, d)
  const back = () => (prev === 'open' ? reopenIssue(i.publication_id, i.issue_id, d) : resolveIssue(i.publication_id, i.issue_id, prev, d))
  toast(`${how === 'ok' ? 'Не ошибка' : 'Исправлено'}: ${labelOf(i).toLowerCase()} · ${i.publication_id}`, { label: 'Вернуть', run: back })
}
function reopen(i: IssueRow) {
  if (isApi) return
  const prev = stateOf(i)
  reopenIssue(i.publication_id, i.issue_id, props.domain)
  toast(`Замечание снова открыто · ${i.publication_id}`, { label: 'Отменить', run: () => { if (prev !== 'open') resolveIssue(i.publication_id, i.issue_id, prev, props.domain) } })
}

const root = ref<HTMLElement | null>(null)
watch(() => props.selected, async (v) => {
  if (!v) return
  if (props.limit && !list.value.some((i) => i.issue_id === v)) expanded.value = true
  await nextTick()
  root.value?.querySelector('.it.is-sel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}, { immediate: true })
</script>

<template>
  <div ref="root" class="il">
    <UiEmpty v-if="!all.length" icon="check" title="Замечаний нет" text="Проверки не нашли ничего подозрительного." compact />
    <template v-else>
      <section v-for="g in group ? groups : [{ name: '', label: '', items: list, open: 0 }]" :key="g.name" class="il__g">
        <h3 v-if="group" class="il__h">{{ g.label }}<span class="num">{{ g.open ? g.open + ' открыто' : 'все закрыты' }}</span></h3>
        <ul class="il__ul" :class="cards ? 'il__ul--cards' : 'card'" role="list">
          <li
            v-for="i in g.items" :key="key(i)" class="it"
            :class="{ 'is-done': !isOpen(i), 'is-sel': selected === i.issue_id, card: cards, 'it--card': cards }"
          >
            <div v-if="cards" class="it__head">
              <span class="dot" :class="isOpen(i) ? 'dot--warn' : 'dot--ok'" :data-tip="isOpen(i) ? 'Нужно проверить' : ISSUE_STATE_RU[stateOf(i)]" aria-hidden="true" />
              <b class="it__ttl">{{ labelOf(i) }}</b>
              <span v-if="!isOpen(i)" class="mark mark--ok"><Icon name="check" :size="14" />{{ ISSUE_STATE_RU[stateOf(i)] }}</span>
              <span v-if="i.source_page" class="it__pg num">стр. {{ i.source_page }}</span>
            </div>
            <div class="it__top">
              <span v-if="!cards" class="dot" :class="isOpen(i) ? 'dot--warn' : 'dot--ok'" :data-tip="isOpen(i) ? 'Нужно проверить' : ISSUE_STATE_RU[stateOf(i)]" aria-hidden="true" />
              <div class="it__main">
                <p v-if="!group && !cards" class="it__k">{{ labelOf(i) }}</p>
                <p v-if="rag && isEn(i.description)" class="it__cap">Описание из разметки (англ.)</p>
                <p class="it__t">{{ rag ? i.description : ruText(i.description) }}</p>
                <p class="rowid it__id">issues · {{ i.issue_id }} · {{ i.check_name }}<template v-if="i.source_page"> · стр. {{ i.source_page }}</template></p>
                <p v-if="!cards" class="it__m">
                  <b v-if="showPaper" class="num" :data-tip="title(i.publication_id)">{{ i.publication_id }}</b>{{ showPaper && i.source_page ? ' · ' : '' }}{{ i.source_page ? 'стр. ' + i.source_page : '' }}
                  <span v-if="!isOpen(i)" class="mark mark--ok"><Icon name="check" :size="14" />{{ ISSUE_STATE_RU[stateOf(i)] }}</span>
                </p>
                <p v-if="isOpen(i)" class="it__todo"><b>Что сделать.</b> {{ issueTodo(i) }}</p>
                <ul v-if="recs(i).length" class="it__c" role="list" aria-label="Значения из замечания">
                  <li class="it__lbl">{{ recordIds(i).length > 1 ? 'Значения' : 'Значение' }}</li>
                  <li v-for="r in recs(i)" :key="r.rid">
                    <RouterLink
                      :to="withRun(r.to)" class="chip chip--sm chip--link" :class="{ 'is-rejected': r.rejected }"
                      :data-tip="[r.device, r.page && 'стр. ' + r.page, r.mark && reviewInherited(i.publication_id, r.rid, domain) ? INHERITED_TEXT : r.mark?.tip].filter(Boolean).join(' · ') || undefined"
                    >
                      <span class="val chip__t num">{{ r.name }}</span>
                      <span v-if="r.mark" class="mark" :class="markClass(r.mark)">{{ r.mark.text }}</span>
                      <span class="rowid">{{ r.rid }}</span>
                    </RouterLink>
                  </li>
                  <li v-if="more(i)"><span class="chip chip--sm chip--soft">ещё {{ more(i) }}</span></li>
                </ul>
              </div>
            </div>
            <div class="it__acts">
              <button type="button" class="btn btn--soft btn--sm" @click="show(i)"><Icon name="eye" :size="16" />Показать в PDF</button>
              <template v-if="isOpen(i)">
                <button type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : 'Вы поправили число в статье или в данных — пометить замечание исправленным'" @click="mark(i, 'fixed')"><Icon name="check" :size="16" />Отметить исправленным</button>
                <button type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : 'Проверили: в статье всё верно, программа ошиблась — закрыть замечание'" @click="mark(i, 'ok')">Это не ошибка</button>
              </template>
              <button v-else-if="!autoFixed(i)" type="button" class="btn btn--ghost btn--sm" :disabled="isApi" :data-tip="isApi ? DEV_TEXT : undefined" @click="reopen(i)"><Icon name="undo" :size="16" />Открыть снова</button>
            </div>
          </li>
        </ul>
      </section>
      <div v-if="limit && all.length > limit" class="il__foot">
        <button type="button" class="btn btn--soft btn--sm" :aria-expanded="expanded" @click="expanded = !expanded">
          {{ expanded ? 'Свернуть' : `Показать все ${all.length}` }}
        </button>
        <span v-if="!expanded && openCount < all.length" class="il__cnt">открыто {{ openCount }} из {{ all.length }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.il { display: grid; gap: var(--s5); min-width: 0; }
.il__g { display: grid; gap: var(--s2); min-width: 0; }
.il__h { display: flex; align-items: baseline; gap: var(--s2); padding: 0 var(--s1); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.il__h .num { font-weight: 400; font-size: var(--fs-xs); color: var(--faint); }
.il__ul { list-style: none; padding: 0; margin: 0; display: grid; overflow: hidden; }
.il__ul > li + li { border-top: 1px solid var(--line); }

.it { display: grid; gap: var(--s3); padding: var(--s4); min-width: 0; transition: background-color var(--t) ease; }
.it.is-sel { background: var(--blue-wash); box-shadow: inset 2px 0 0 var(--blue); }
.it__top { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--s3); align-items: start; }
.it__top > .dot { margin-top: 7px; }
.it__main { display: grid; gap: var(--s1); min-width: 0; }
.it__k { font-size: var(--fs-sm); font-weight: 600; color: var(--ink); }
.it__cap { font-size: var(--fs-xs); color: var(--faint); line-height: 1.3; }
.it__t { font-size: var(--fs-body); line-height: 1.45; color: var(--ink); overflow-wrap: anywhere; }
.it__m { font-size: var(--fs-xs); line-height: 1.6; color: var(--muted); }
.it__m .mark { margin-left: var(--s2); }
.it__m b { font-weight: 600; color: var(--ink-2); }
.it__todo { font-size: var(--fs-sm); line-height: 1.45; color: var(--ink-2); }
.it__todo b { font-weight: 600; }
.it__c { list-style: none; padding: 0; margin: var(--s1) 0 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
.it__c { align-items: center; }
.it__lbl { font-size: var(--fs-xs); color: var(--muted); }
.it__c .mark { height: 18px; margin-left: var(--s1); }
.it__acts { display: flex; flex-wrap: wrap; gap: var(--s2); padding-left: calc(7px + var(--s3)); }
.il__ul--cards { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s3); }
.il__ul--cards > li + li { border-top: 0; }
.it--card { gap: var(--s2); cursor: default; }
.it--card.is-sel { box-shadow: inset 0 0 0 1px var(--line-2), var(--shadow); background: none; }
.it__head { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.it__ttl { font-weight: 600; min-width: 0; }
.it__pg { margin-left: auto; font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
.it--card .it__top { grid-template-columns: minmax(0, 1fr); }
.it--card .it__t { font-size: var(--fs-sm); line-height: 1.5; color: var(--ink-2); }
.it--card .it__todo { color: var(--muted); }
.it--card.is-done .it__t, .it--card.is-done .it__ttl { color: var(--muted); }
.it--card .it__acts { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--s1); padding: var(--s1) 0 0; }
.it--card .it__acts .btn { width: 100%; justify-content: center; }
.it--card .it__acts .btn:first-child { grid-column: 1 / -1; }
.it.is-done .it__t, .it.is-done .it__k { color: var(--muted); }
.il__foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s3); }
.il__cnt { font-size: var(--fs-sm); color: var(--muted); }

@media (max-width: 768px) {
  .it { padding: var(--s4) var(--s3); }
  .it__acts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding-left: 0; }
  .it__acts .btn { height: 44px; }
  .it__acts .btn:first-child { grid-column: 1 / -1; }
  .il__foot .btn { height: 44px; }
  .it__c .chip { min-height: 36px; }
}
</style>
