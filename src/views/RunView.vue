<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch, type Component } from 'vue'
import { useRouter } from 'vue-router'
import FileComposer from '../components/FileComposer.vue'
import Icon from '../components/Icon.vue'
import UiProgress from '../components/UiProgress.vue'
import UiSpinner from '../components/UiSpinner.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiLoad from '../components/UiLoad.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import RunFeedSkeleton from '../components/RunFeedSkeleton.vue'
import SubmissionView from '../components/SubmissionView.vue'
import IssuesList from '../components/IssuesList.vue'
import SourceList from '../components/SourceList.vue'
import type { Source } from '../api/chat'
import { useScrollMemory } from '../viewState'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { dataLink } from '../dataTabs'
import { DOMAIN_RU, NODATA_TEXT, checkLabel, metricLabel, paperPath, publication, resultLink, resultsOf, reviewInherited, reviewOf, reviewScope, setReviewScope, unitRu, type RunFile } from '../case'
import { ragMetricCase, ragLoad, ragPublication, ragResultsOf, ragSummaryOf } from '../case/rag'
import {
  rerunAs, addToRun, askRun, deleteRun, loadRunChat, newChat, renameChat, deleteChat, stopAnswer, rateAnswer, chatLoading, isRunning, messagesOf, renameRun, rerun, retryAnswer, runOf, runPapers, runPapersInScope, runSummary, stopRun,
  setRunDomain, togglePinRun,
} from '../case/runs'
import { downloadRunData, downloadRunPassport, downloadRunSet } from '../case/runSet'
import { isApi } from '../config'
import { toast } from '../store'
import { askConfirm, askText } from '../prompt'
import { runsLoad } from '../api/state'
import { useBusy } from '../useBusy'
import { loadRun, summaryFailed, summaryLoading, retrySummary } from '../api/runs'

const CA = import.meta.glob<{ default: Component }>('../components/CaseAnswer.vue')
const caLoad = Object.values(CA)[0]
const CaseAnswer = caLoad ? defineAsyncComponent(caLoad) : null

const props = defineProps<{ id: string }>()
const router = useRouter()
const scroller = ref<HTMLElement | null>(null)
useScrollMemory(scroller, 'run:' + props.id)

const run = computed(() => runOf(props.id))
const detail = ref<'loading' | 'ready' | 'error'>('ready')
async function fetchDetail() {
  const r = run.value as (typeof run.value & { detail?: boolean }) | undefined
  if (!isApi || !r?.remote || r.detail) { detail.value = 'ready'; return }
  detail.value = 'loading'
  detail.value = (await loadRun(props.id)) ? 'ready' : 'error'
}
void fetchDetail()
watch(() => !!run.value, () => void fetchDetail())
const sumLoading = computed(() => isApi && !!run.value?.remote && summaryLoading(props.id))
const sumFailed = computed(() => isApi && !!run.value?.remote && summaryFailed(props.id))
const msgs = computed(() => messagesOf(props.id))
const lastRunMsg = computed(() => [...msgs.value].reverse().find((m) => m.kind === 'run')?.id)
const askedList = computed(() => msgs.value.flatMap((m) => (m.kind === 'question' ? [m.text] : [])))
const asked = computed(() => askedList.value.length > 0)
const running = computed(() => isRunning(props.id))
const sum = computed(() => runSummary(props.id))
const pids = computed(() => runPapersInScope(props.id))
const isRag = computed(() => run.value?.domain === 'rag')
const ragBusy = ref(false)
async function loadRag() {
  if (!isRag.value) return
  ragBusy.value = true
  const list = [...pids.value].sort((a, b) => ragSummaryOf(a).results - ragSummaryOf(b).results)
  try { await Promise.all(list.map(ragLoad)) } finally { ragBusy.value = false }
}
watch(() => [!!run.value, props.id] as const, ([ok, id]) => { if (ok && reviewScope.value !== id) setReviewScope(id) }, { immediate: true })
const chatApi = shallowRef<typeof import('../api/chat') | null>(null)
if (isApi) void import('../api/chat').then((m) => { chatApi.value = m })
watch(() => [!!run.value, props.id] as const, ([ok, id]) => { if (ok && isApi) void loadRunChat(id) }, { immediate: true })
const chatList = computed(() => chatApi.value?.threads[props.id] ?? [])
const chatCur = computed(() => chatApi.value?.currentThread[props.id] ?? '')
const chatTitle = computed(() => chatList.value.find((t) => t.id === chatCur.value)?.title ?? 'Новый чат')
const chats = ref(false)
const chatsWrap = ref<HTMLElement>()
const onDocChats = (e: MouseEvent) => { if (chats.value && !chatsWrap.value?.contains(e.target as Node)) chats.value = false }
onMounted(() => document.addEventListener('click', onDocChats))
onBeforeUnmount(() => document.removeEventListener('click', onDocChats))
function pickChat(tid: string) {
  chats.value = false
  if (tid !== chatCur.value) void loadRunChat(props.id, tid)
}
function startChat() {
  chats.value = false
  void newChat(props.id)
}
async function renameChatAsk(tid: string, title: string) {
  chats.value = false
  const t = await askText({ title: 'Название чата', value: title, ok: 'Сохранить', label: 'Название' })
  if (t && t.trim() && t.trim() !== title) void renameChat(props.id, tid, t.trim())
}
async function deleteChatAsk(tid: string, title: string) {
  chats.value = false
  if (await askConfirm('Удалить чат?', `«${title}» и все ответы в нём будут удалены.`)) void deleteChat(props.id, tid)
}
const rateOpen = ref('')
const REASONS = ['Неверная цифра', 'Не тот источник', 'Неполный ответ']
function rate(id: string, v: 'up' | 'down', cur?: 'up' | 'down' | null) {
  if (cur === v) { rateOpen.value = ''; void rateAnswer(props.id, id, null); return }
  if (v === 'up') { rateOpen.value = ''; void rateAnswer(props.id, id, 'up'); return }
  rateOpen.value = rateOpen.value === id ? '' : id
}
function rateDown(id: string, reason: string) {
  rateOpen.value = ''
  void rateAnswer(props.id, id, 'down', reason)
}
watch(() => [props.id, pids.value.join(','), reviewScope.value], () => void loadRag(), { immediate: true })

const filesOf = (ids: string[]) => {
  const all = run.value?.files ?? []
  return ids.map((id) => all.find((f) => f.id === id)).filter((f): f is RunFile => !!f)
}
const batchRunning = (fs: RunFile[]) => fs.some((f) => f.status === 'queued' || f.status === 'running')
function localProgress(fs: RunFile[]) {
  if (!fs.length) return 100
  const p = Math.floor(fs.reduce((s, f) => s + (f.status === 'queued' ? 0 : f.status === 'running' ? f.progress : 100), 0) / fs.length)
  return batchRunning(fs) ? Math.min(99, p) : p
}
const batchProgress = (fs: RunFile[]) => (run.value?.remote && run.value.apiProgress != null ? run.value.apiProgress : localProgress(fs))

const now = ref(Date.now())
let tick = 0
onMounted(() => { tick = window.setInterval(() => (now.value = Date.now()), 1000) })
onBeforeUnmount(() => window.clearInterval(tick))
function batchEta(fs: RunFile[]): number | undefined {
  const r = run.value
  if (!r) return undefined
  if (r.remote && r.apiEta != null) return r.apiEta
  const p = batchProgress(fs)
  const spent = (now.value - r.createdAt) / 1000
  if (p < 5 || p >= 100 || spent < 4) return undefined
  return (spent * (100 - p)) / p
}
function fmtEta(sec: number | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return ''
  if (sec < 60) return 'меньше минуты'
  const m = Math.round(sec / 60)
  if (m < 60) return `≈ ${m} мин`
  return `≈ ${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`
}
function line(fs: RunFile[]) {
  const n = fs.length
  const c = (st: RunFile['status']) => fs.filter((f) => f.status === st).length
  const parts = [`${n} ${plural(n, ['файл', 'файла', 'файлов'])}`]
  if (c('done') + c('ocr')) parts.push(`${c('done') + c('ocr')} по теме`)
  if (c('out')) parts.push(`${c('out')} не по теме`)
  if (c('nodata')) parts.push(`${c('nodata')} без результатов`)
  if (c('ocr')) parts.push(`${c('ocr')} распознано OCR`)
  if (c('error')) parts.push(`${c('error')} ${plural(c('error'), ['ошибка', 'ошибки', 'ошибок'])}`)
  return parts.join(' · ')
}

const open = ref<Record<string, boolean>>({})

const ST: Record<RunFile['status'], string> = {
  queued: 'в очереди', running: 'разбор', done: 'готово', out: 'не по теме', ocr: 'скан, распознано OCR', error: 'ошибка', nodata: 'нет результатов',
}
const ICON: Partial<Record<RunFile['status'], string>> = { done: 'check', nodata: 'info', out: 'info', error: 'warn', ocr: 'check' }
const canOpen = (f: RunFile) => f.status === 'done' || f.status === 'ocr' || f.status === 'out' || f.status === 'nodata'
const outFiles = computed(() => (running.value ? [] : (run.value?.files ?? []).filter((f) => f.status === 'out')))
const otherDomain = computed(() => (run.value?.domain === 'rag' ? 'solar' : 'rag'))
const otherName = computed(() => (otherDomain.value === 'rag' ? 'RAG' : 'солнечные элементы'))
const redoPick = ref(new Set<string>())
const suggested = computed(() => outFiles.value.filter((f) => f.suggestedDomain === otherDomain.value))
watch(() => outFiles.value.map((f) => f.id + (f.suggestedDomain ?? '')).join(','), () => {
  redoPick.value = new Set((suggested.value.length ? suggested.value : outFiles.value).map((f) => f.id))
}, { immediate: true })
function toggleRedo(id: string) {
  const s = new Set(redoPick.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  redoPick.value = s
}
const allRedo = computed(() => redoPick.value.size === outFiles.value.length)
const toggleAllRedo = () => { redoPick.value = allRedo.value ? new Set() : new Set(outFiles.value.map((f) => f.id)) }
const redoBusy = ref(false)
async function redo() {
  if (!run.value || !redoPick.value.size || redoBusy.value) return
  redoBusy.value = true
  try {
    const id = await rerunAs(run.value.id, [...redoPick.value], otherDomain.value)
    if (id) void router.push('/run/' + id)
  } finally { redoBusy.value = false }
}
const titleOf = (f: RunFile) => (isRag.value ? ragPublication(f.id) : publication(f.id))?.title || f.name
const statusText = (f: RunFile) => (f.status === 'nodata' ? ST.nodata : f.reason || ST[f.status])
const statusTip = (f: RunFile) => {
  if (f.status === 'ocr' && f.ocrConfidence != null) return `Скан, текст распознан. Надёжность распознавания: ${Math.round(f.ocrConfidence * 100)} %`
  return f.status === 'nodata' ? NODATA_TEXT : f.reason && f.reason.length > 30 ? f.reason : undefined
}

const fmtTime = (t: number) => {
  const d = new Date(t)
  const now = new Date()
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + hm
}
const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

const openIssues = computed(() => sum.value.open)
const fopen = reactive<Record<string, boolean>>({})
const reviewed = computed(() => pids.value.reduce((s, p) => s + (isRag.value
  ? ragResultsOf(p).filter((r) => { const rv = reviewOf(p, r.result_id, 'rag'); return (rv.status !== 'new' || rv.corrected != null) && !reviewInherited(p, r.result_id, 'rag') }).length
  : resultsOf(p).filter((r) => { const rv = reviewOf(p, r.result_id); return (rv.status !== 'new' || rv.corrected != null) && !reviewInherited(p, r.result_id) }).length), 0))
const MAIN = ['PCE', 'Voc', 'Jsc', 'FF']
const covAll = ref(false)
const coverage = computed(() => sum.value.coverage.filter((c) => c.n > 0))
const covFull = computed(() => coverage.value.filter((c) => c.n >= pids.value.length))
const covPart = computed(() => coverage.value.filter((c) => c.n < pids.value.length).sort((a, b) => (isRag.value ? 0 : Number(MAIN.includes(b.metric)) - Number(MAIN.includes(a.metric))) || b.n - a.n))
const bestTo = (pid: string, rid: string) => { const l = resultLink(pid, rid); return { ...l, query: { ...l.query, run: props.id } } }
const bestVal = (v: number, u: string) => `${String(+v.toPrecision(4)).replace('.', ',')}${u ? ' ' + unitRu(u) : ''}`
const mName = (m: string) => (isRag.value ? ragMetricCase(m) : metricLabel(m))
const COV_N = 4
const covShown = computed(() => (covAll.value ? covPart.value : covPart.value.slice(0, COV_N)))
const covMore = computed(() => Math.max(0, covPart.value.length - COV_N))
const fmtN = fmtInt
const pct = (x: number) => Math.round(x * 100)

const emptyTitle = computed(() => {
  const s = sum.value
  if (s.nodata && !s.out) return s.nodata === 1 ? NODATA_TEXT : 'Результаты для этих статей пока недоступны'
  if (s.out && !s.nodata) return s.out === 1 ? 'Статья не по теме' : 'Все статьи не по теме'
  return 'Результатов пока нет'
})
const emptyText = computed(() => (sum.value.out && !sum.value.nodata
  ? `Таблица строится только по статьям ${isRag.value ? 'о поиске и RAG' : 'о солнечных элементах'}. Причина — в списке файлов выше.`
  : 'PDF сохранены в разборе: их можно открыть из списка файлов.'))

const editing = ref(false)
const draft = ref('')
const titleEl = ref<HTMLInputElement | null>(null)
async function startEdit() {
  if (!run.value) return
  menu.value = false
  draft.value = run.value.title
  editing.value = true
  await nextTick()
  titleEl.value?.select()
}
function commit() {
  if (!editing.value) return
  editing.value = false
  renameRun(props.id, draft.value)
}

const menu = ref(false)
const menuWrap = ref<HTMLElement | null>(null)
const onDoc = (e: MouseEvent) => { if (menu.value && !menuWrap.value?.contains(e.target as Node)) menu.value = false }
onMounted(() => document.addEventListener('click', onDoc))
onBeforeUnmount(() => document.removeEventListener('click', onDoc))
function doRerun() {
  menu.value = false
  rerun(props.id)
}
async function doDomain() {
  menu.value = false
  const r = run.value
  if (!r) return
  const id = await setRunDomain(r.id, r.domain === 'rag' ? 'solar' : 'rag')
  if (id && id !== r.id) void router.push('/run/' + id)
}
async function doDelete() {
  menu.value = false
  if (isApi && !(await askConfirm('Удалить разбор?', `«${run.value?.title ?? ''}» и все правки в нём будут удалены. Вернуть разбор нельзя.`))) return
  deleteRun(props.id)
  void router.push('/app')
}

const { busy: setBusy, run: runSet } = useBusy()
const downloadSet = (e?: Event) => { menu.value = false; dl.value = false; return runSet(() => downloadRunSet(props.id), e) }
const dl = ref(false)
const dlWrap = ref<HTMLElement>()
const onDocDl = (e: MouseEvent) => { if (dl.value && !dlWrap.value?.contains(e.target as Node)) dl.value = false }
onMounted(() => document.addEventListener('click', onDocDl))
onBeforeUnmount(() => document.removeEventListener('click', onDocDl))
function dlData(fmt: 'json' | 'xlsx') {
  dl.value = false
  void runSet(async () => { if (!(await downloadRunData(props.id, fmt))) void router.push(dataLink('/export', props.id)) })
}
function dlPassport(fmt: 'md' | 'json') {
  dl.value = false
  void runSet(() => downloadRunPassport(props.id, fmt))
}

const canDownload = computed(() => (isApi || !running.value) && pids.value.length > 0)
const paperTo = (pid: string) => ({ path: paperPath(pid, run.value?.domain ?? 'solar'), query: { run: props.id } })

async function add(files: File[]) {
  const n = await addToRun(props.id, files)
  if (n) {
    await nextTick()
    scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
  }
}

const tail = ref<{ id: string; min: number } | null>(null)
async function ask(text: string) {
  askRun(props.id, text)
  await nextTick()
  const sc = scroller.value
  const inner = sc?.firstElementChild as HTMLElement | null
  const qs = sc?.querySelectorAll<HTMLElement>('.q')
  const q = qs?.[qs.length - 1]
  const last = msgs.value[msgs.value.length - 1]
  if (!sc || !inner || !q || !last) return
  const cs = getComputedStyle(inner)
  const padTop = parseFloat(cs.paddingTop) || 0
  const room = sc.clientHeight - padTop - (parseFloat(cs.paddingBottom) || 0) - q.offsetHeight - (parseFloat(cs.rowGap) || 0)
  tail.value = { id: last.id, min: Math.max(0, Math.round(room)) }
  await nextTick()
  sc.scrollTo({ top: Math.max(0, q.offsetTop - padTop), behavior: 'smooth' })
}
const ASK = import.meta.glob<{ suggestionsFor?: (pids: string[], domain?: 'solar' | 'rag') => string[] }>('../case/ask.ts', { eager: true })
const askMod = Object.values(ASK)[0]
const serverSugg = ref<string[]>([])
async function loadSugg(id: string, thread: string) {
  let l: string[] = []
  try { l = await (await import('../api/chat')).chatSuggestions(id, thread || undefined) } catch {
    try { l = await (await import('../api/extra')).askSuggestionsApi(id) } catch { l = [] }
  }
  if (props.id === id && chatCur.value === thread) serverSugg.value = Array.isArray(l) ? l.slice(0, 4) : []
}
watch(() => [props.id, running.value, chatCur.value, askedList.value.length] as const, ([id, busy, thread]) => {
  if (!isApi || busy) return
  void loadSugg(id, thread)
}, { immediate: true })
const suggestions = computed(() => (isApi ? serverSugg.value.filter((q) => !askedList.value.includes(q)) : pids.value.length ? (askMod?.suggestionsFor?.(pids.value, run.value?.domain ?? 'solar') ?? []).slice(0, 4) : []))
const sourcesOf = (a: unknown): Source[] => (a && typeof a === 'object' && Array.isArray((a as { sources?: unknown }).sources) ? (a as { sources: Source[] }).sources : [])
const timeOf = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const copied = ref('')
async function copyAnswer(id: string, a: unknown) {
  const cites = a && typeof a === 'object' && Array.isArray((a as { cites?: unknown }).cites) ? (a as { cites: { label?: string }[] }).cites.map((c, i) => `[${i + 1}] ${c.label ?? ''}`) : []
  await copyText(id, [answerText(a), ...(cites.length ? ['', ...cites] : [])].join('\n').trim())
}
function summaryText() {
  const s = sum.value
  const r = run.value
  const n = (v: number, f: [string, string, string]) => `${fmtN(v)} ${plural(v, f)}`
  const lines = [
    r?.title ?? '',
    `Область: ${r ? DOMAIN_RU[r.domain] : ''}`,
    `${n(s.inScope, ['статья', 'статьи', 'статей'])} по теме из ${n(s.papers, ['файла', 'файлов', 'файлов'])}${s.out ? `, не по теме: ${s.out}` : ''}`,
    n(s.values, ['значение', 'значения', 'значений']),
    ...(isRag.value ? [n(s.configurations, ['конфигурация', 'конфигурации', 'конфигураций']), n(s.datasets, ['датасет', 'датасета', 'датасетов'])] : []),
    `Замечания: открытых ${fmtN(openIssues.value)} из ${fmtN(s.issues)}`,
  ]
  if (s.best?.length) lines.push('', 'Лучшие значения:', ...s.best.map((b) => `${mName(b.metric)}: ${bestVal(b.value, b.unit)} (${b.pid})`))
  if (coverage.value.length) lines.push('', 'Найдено в статьях:', ...coverage.value.map((c) => `${mName(c.metric)}: ${c.n} из ${pids.value.length}`))
  return lines.join('\n').trim()
}
async function copyText(id: string, txt: string) {
  try {
    await navigator.clipboard.writeText(txt)
    copied.value = id
    window.setTimeout(() => { if (copied.value === id) copied.value = '' }, 1800)
  } catch { toast('Не удалось скопировать — браузер не дал доступ к буферу обмена') }
}
const answerText = (a: unknown) => {
  if (a && typeof a === 'object' && 'text' in a && typeof (a as { text: unknown }).text === 'string') return (a as { text: string }).text
  return typeof a === 'string' ? a : ''
}
</script>

<template>
  <div v-if="run" class="rv">
    <div ref="scroller" class="rv__scroll">
      <div class="rv__inner">
        <header v-if="detail === 'loading'" class="head" aria-busy="true">
          <div class="head__main"><UiSkeleton width="55%" height="1.4em" /><p class="head__meta"><UiSkeleton width="120px" /></p><p class="head__dom"><UiSkeleton width="220px" /></p></div>
          <UiSkeleton variant="block" width="132px" height="32px" class="head__sk-b" />
        </header>
        <header v-else class="head">
          <div class="head__main">
            <input
              v-if="editing" ref="titleEl" v-model="draft" class="head__input" aria-label="Название разбора"
              @keydown.enter.prevent="commit" @keydown.esc.prevent="editing = false" @blur="commit"
            />
            <h1 v-else class="head__title">
              <button type="button" class="head__name" data-tip="Переименовать" @click="startEdit">{{ run.title }}<Icon name="edit" :size="16" class="head__pen" /></button>
            </h1>
            <p class="head__meta">{{ fmtDate(run.createdAt) }}</p>
            <p class="head__dom">Область: {{ DOMAIN_RU[run.domain] }}</p>
          </div>
          <div v-if="canDownload" ref="dlWrap" class="head__menu">
            <button type="button" class="btn btn--soft btn--sm head__dl" :disabled="setBusy" aria-haspopup="menu" :aria-expanded="dl" :data-tip="dl ? undefined : 'Выбрать, что скачать'" @click.stop="dl = !dl">
              <UiSpinner v-if="setBusy" :size="14" tone="current" /><Icon v-else name="export" :size="16" /><span class="head__dlt">{{ setBusy ? 'Готовим файл…' : 'Скачать' }}</span><Icon name="chevron-down" :size="14" class="head__chev" :class="{ 'is-open': dl }" />
            </button>
            <Transition name="pop">
              <div v-if="dl" class="menu head__pop" role="menu">
                <button type="button" class="menu__item menu__item--2" role="menuitem" @click="downloadSet()"><Icon name="export" :size="16" /><span>Набор для сдачи<small>ZIP: 7 таблиц и паспорт</small></span></button>
                <button type="button" class="menu__item menu__item--2" role="menuitem" @click="dlData('json')"><Icon name="code" :size="16" /><span>Один файл JSON<small>Все таблицы вместе</small></span></button>
                <button type="button" class="menu__item menu__item--2" role="menuitem" @click="dlData('xlsx')"><Icon name="sheet" :size="16" /><span>Файл Excel<small>Только значения, одним листом</small></span></button>
                <div class="menu__sep" role="separator" />
                <button type="button" class="menu__item menu__item--2" role="menuitem" @click="dlPassport('md')"><Icon name="book" :size="16" /><span>Паспорт набора · Markdown<small>Поля, правила и критерии</small></span></button>
                <button type="button" class="menu__item menu__item--2" role="menuitem" @click="dlPassport('json')"><Icon name="book" :size="16" /><span>Паспорт набора · JSON<small>То же для программ</small></span></button>
                <div class="menu__sep" role="separator" />
                <RouterLink :to="dataLink('/export', run.id)" class="menu__item" role="menuitem" @click="dl = false"><Icon name="arrow-right" :size="16" />Все форматы и предпросмотр</RouterLink>
              </div>
            </Transition>
          </div>
          <div ref="menuWrap" class="head__menu">
            <button type="button" class="icon-btn" aria-label="Действия с разбором" :data-tip="menu ? undefined : 'Действия с разбором'" :aria-expanded="menu" aria-haspopup="menu" @click.stop="menu = !menu"><Icon name="dots" :size="18" /></button>
            <Transition name="pop">
              <div v-if="menu" class="menu head__pop" role="menu">
                <button type="button" class="menu__item" role="menuitem" @click="startEdit"><Icon name="edit" :size="16" />Переименовать</button>
                <button type="button" class="menu__item" role="menuitem" @click="menu = false; togglePinRun(run.id)"><Icon name="pin" :size="16" />{{ run.pinned ? 'Открепить' : 'Закрепить' }}</button>
                <RouterLink :to="dataLink('/export', run.id)" class="menu__item" role="menuitem" @click="menu = false"><Icon name="export" :size="16" />Другие форматы выгрузки</RouterLink>
                <button type="button" class="menu__item" role="menuitem" @click="doRerun"><Icon name="undo" :size="16" />Разобрать заново</button>
                <button type="button" class="menu__item" role="menuitem" @click="doDomain"><Icon name="columns" :size="16" />{{ isApi ? `Разобрать как ${run.domain === 'rag' ? 'солнечные' : 'RAG'}` : 'Сменить область' }}</button>
                <div class="menu__sep" />
                <button type="button" class="menu__item menu__item--danger" role="menuitem" @click="doDelete"><Icon name="trash" :size="16" />Удалить</button>
              </div>
            </Transition>
          </div>
        </header>

        <UiLoad :loading="detail === 'loading'" :error="detail === 'error'" class="rv__feed">
          <template #skeleton><RunFeedSkeleton /></template>
          <template #error><UiEmpty icon="info" title="Не удалось загрузить разбор" text="Проверьте соединение и повторите." action="Повторить" @action="fetchDetail" /></template>
        <template v-for="m in msgs" :key="m.id">
          <div v-if="m.kind === 'files'" class="msg rise" :class="{ 'is-open': fopen[m.id] }">
            <p class="msg__t">Загружено {{ fmtInt(m.fileIds.length) }} {{ plural(m.fileIds.length, ['файл', 'файла', 'файлов']) }}</p>
            <button type="button" class="link link--muted msg__tg" :aria-expanded="!!fopen[m.id]" @click="fopen[m.id] = !fopen[m.id]">{{ fopen[m.id] ? 'скрыть' : 'показать' }}</button>
            <ul class="msg__chips" role="list">
              <li v-for="fid in m.fileIds.slice(0, 8)" :key="fid" class="chip chip--sm msg__chip"><Icon name="doc" :size="13" />{{ fid }}</li>
              <li v-if="m.fileIds.length > 8" class="chip chip--sm msg__chip num">+{{ m.fileIds.length - 8 }}</li>
            </ul>
            <time class="msg__time">{{ fmtTime(m.at) }}</time>
          </div>

          <p v-else-if="m.kind === 'question'" class="q rise">{{ m.text }}</p>

          <div v-else-if="m.kind === 'run'" class="ans">
            <span class="ans__av" aria-hidden="true"><Icon name="logo" :size="18" /></span>
            <div class="ans__body">
              <section class="files" :class="{ 'is-run': batchRunning(filesOf(m.fileIds)) }">
                <template v-if="batchRunning(filesOf(m.fileIds))">
                  <div class="files__top">
                    <span class="files__lead">Разбираем {{ m.fileIds.length }} {{ plural(m.fileIds.length, ['статью', 'статьи', 'статей']) }}</span>
                    <span class="files__pct num">{{ batchProgress(filesOf(m.fileIds)) }} %</span>
                    <span v-if="fmtEta(batchEta(filesOf(m.fileIds)))" class="files__eta num" data-tip="Примерное время до конца разбора">осталось {{ fmtEta(batchEta(filesOf(m.fileIds))) }}</span>
                    <button type="button" class="btn btn--ghost btn--sm" @click="stopRun(run.id)">Остановить</button>
                  </div>
                  <UiProgress :value="batchProgress(filesOf(m.fileIds))" size="md" label="Общий прогресс" :slow="isApi" />
                </template>
                <button v-else type="button" class="files__line" :aria-expanded="!!open[m.id]" @click="open[m.id] = !open[m.id]">
                  <Icon name="check" :size="16" class="files__ok" />
                  <span>{{ line(filesOf(m.fileIds)) }}</span>
                  <Icon name="chevron-down" :size="14" class="files__chev" :class="{ 'is-open': open[m.id] }" />
                </button>

                <ul v-if="batchRunning(filesOf(m.fileIds)) || open[m.id]" class="files__list" role="list">
                  <li v-for="f in filesOf(m.fileIds)" :key="f.id">
                    <component
                      :is="canOpen(f) ? 'RouterLink' : 'div'" :to="canOpen(f) ? paperTo(f.id) : undefined"
                      class="fr" :class="['fr--' + f.status, { 'is-link': canOpen(f) }]"
                    >
                      <span class="fr__st">
                        <Icon v-if="ICON[f.status]" :name="ICON[f.status]!" :size="15" />
                        <UiSpinner v-else-if="f.status === 'running'" :size="12" tone="blue" :label="'Разбор ' + f.id" />
                        <span v-else class="fr__dot" />
                      </span>
                      <span class="fr__id num">{{ f.id }}</span>
                      <span class="fr__t" :data-tip="titleOf(f)">{{ titleOf(f) }}</span>
                      <span v-if="f.status === 'running' && f.stage" class="fr__s" :data-tip="f.eta != null ? 'Осталось ' + fmtEta(f.eta) : undefined">{{ f.stage }}</span>
                      <span v-if="f.status === 'running'" class="fr__pct num">{{ f.progress }} %</span>
                      <span v-if="f.status === 'running'" class="fr__prg"><UiProgress :value="f.progress" :label="'Разбор ' + f.id" :slow="isApi" /></span>
                      <span v-if="f.status !== 'running'" class="fr__s" :data-tip="statusTip(f)">{{ statusText(f) }}</span>
                    </component>
                  </li>
                </ul>
              </section>

              <template v-if="m.id === lastRunMsg && !running">
                <section v-if="outFiles.length" class="redo" aria-label="Статьи не по теме">
                  <p class="redo__t">
                    <Icon name="info" :size="16" class="redo__ico" />
                    <span>{{ outFiles.length }} {{ plural(outFiles.length, ['статья не подошла', 'статьи не подошли', 'статей не подошли']) }} к области «{{ DOMAIN_RU[run.domain] }}». Возможно, это {{ otherName }} — разберите их отдельно.</span>
                  </p>
                  <ul v-if="outFiles.length > 1" class="redo__list" role="list">
                    <li v-for="f in outFiles" :key="f.id">
                      <label class="redo__row">
                        <input type="checkbox" :checked="redoPick.has(f.id)" @change="toggleRedo(f.id)" />
                        <span class="redo__id num">{{ f.id }}</span>
                        <span class="redo__name" :data-tip="titleOf(f)">{{ titleOf(f) }}</span>
                        <span v-if="f.suggestedDomain === otherDomain" class="redo__hint-chip">похоже на {{ otherDomain === 'rag' ? 'RAG' : 'солнечные' }}</span>
                      </label>
                    </li>
                  </ul>
                  <div class="redo__act">
                    <button type="button" class="btn btn--dark btn--sm" :disabled="!redoPick.size || redoBusy" @click="redo">
                      <UiSpinner v-if="redoBusy" :size="12" tone="current" /><Icon v-else name="folder" :size="16" />
                      {{ redoBusy ? 'Готовим разбор…' : `Разобрать ${redoPick.size} как ${otherDomain === 'rag' ? 'RAG' : 'солнечные'}` }}
                    </button>
                    <button v-if="outFiles.length > 1" type="button" class="btn btn--ghost btn--sm" @click="toggleAllRedo">{{ allRedo ? 'Снять все' : 'Выбрать все' }}</button>
                    <span class="redo__hint">Создастся новый разбор, этот останется как есть</span>
                  </div>
                </section>
                <UiEmpty v-if="!pids.length" icon="info" :title="emptyTitle" :text="emptyText" compact />
                <template v-else>
                  <section class="sum" aria-label="Сводка">
                    <UiLoad :loading="sumLoading" :error="sumFailed">
                      <template #skeleton><RunFeedSkeleton part="sum" /></template>
                      <template #error><UiEmpty compact icon="info" title="Не удалось загрузить сводку" action="Повторить" @action="retrySummary(run.id)" /></template>
                    <ul class="strip card" role="list">
                      <li :data-tip="sum.out ? `по теме; ещё ${sum.out} не по теме` : `по теме, из ${sum.papers} ${plural(sum.papers, ['файла', 'файлов', 'файлов'])}`"><b class="num">{{ fmtN(sum.inScope) }}</b> {{ plural(sum.inScope, ['статья', 'статьи', 'статей']) }}</li>
                      <li :data-tip="isRag ? 'метрик с источником в статье' : 'в таблице ниже'"><b class="num">{{ fmtN(sum.values) }}</b> {{ plural(sum.values, ['значение', 'значения', 'значений']) }}</li>
                      <template v-if="isRag">
                        <li data-tip="варианты систем: модели, поиск, параметры"><b class="num">{{ fmtN(sum.configurations) }}</b> {{ plural(sum.configurations, ['конфигурация', 'конфигурации', 'конфигураций']) }}</li>
                        <li :data-tip="`${sum.experiments} ${plural(sum.experiments, ['эксперимент', 'эксперимента', 'экспериментов'])}`"><b class="num">{{ fmtN(sum.datasets) }}</b> {{ plural(sum.datasets, ['датасет', 'датасета', 'датасетов']) }}</li>
                      </template>
                      <li v-if="openIssues" :data-tip="`открытых, из ${fmtN(sum.issues)} найденных`"><i class="dot dot--warn" aria-hidden="true" /><b class="num">{{ fmtN(openIssues) }}</b> {{ plural(openIssues, ['замечание', 'замечания', 'замечаний']) }}</li>
                      <li v-else :data-tip="ragBusy ? 'проверяю…' : sum.issues ? 'все проверены' : 'проверки чисты'"><i class="dot dot--ok" aria-hidden="true" /><b class="num">{{ fmtN(sum.issues) }}</b> {{ plural(sum.issues, ['замечание', 'замечания', 'замечаний']) }}</li>
                      <li v-if="!isApi" data-tip="правки этого разбора"><b class="num">{{ fmtN(reviewed) }}</b> проверено вами</li>
                    </ul>
                    </UiLoad>
                  </section>

                  <section class="blk" aria-label="Набор для сдачи">
                    <div class="blk__h">
                      <h2>Набор для сдачи</h2>
                      <RouterLink :to="dataLink('/facts', run.id)" class="btn btn--ghost btn--sm blk__a">Вся таблица<Icon name="arrow-right" :size="15" /></RouterLink>
                    </div>
                    <UiLoad :loading="ragBusy || sumLoading">
                      <template #skeleton><RunFeedSkeleton part="set" /></template>
                      <SubmissionView :run-id="run.id" :domain="run.domain" :pids="runPapers(run.id)" :set-busy="setBusy" @download-set="downloadSet()" />
                    </UiLoad>
                  </section>

                  <section v-if="covPart.length || sumLoading" class="blk" aria-label="Найдено в статьях">
                    <UiLoad :loading="sumLoading"><template #skeleton><RunFeedSkeleton part="cov" /></template>
                    <div class="cov card">
                    <p class="cov__h">Найдено в статьях <span>{{ isRag ? 'в скольких статьях по теме есть метрика' : 'в скольких статьях по теме есть показатель' }}</span></p>
                    <p v-if="covFull.length" class="cov__all">Во всех {{ pids.length }}: {{ covFull.map((c) => mName(c.metric)).join(', ') }}</p>
                    <ul class="cov__l" role="list">
                      <li v-for="c in covShown" :key="c.metric" class="cov__r" :data-tip="`${mName(c.metric)}: найден в ${c.n} из ${pids.length} ${plural(pids.length, ['статьи', 'статей', 'статей'])} (${pct(c.share)} %)`">
                        <span class="cov__m" :data-tip="mName(c.metric)">{{ mName(c.metric) }}</span>
                        <span class="cov__bar" aria-hidden="true"><i :style="{ width: pct(c.share) + '%' }" /></span>
                        <span class="cov__v num">{{ c.n }} из {{ pids.length }}</span>
                      </li>
                    </ul>
                    <button v-if="covMore > 0" type="button" class="link link--muted cov__more" :aria-expanded="covAll" @click="covAll = !covAll">
                      {{ covAll ? 'Свернуть' : `Ещё ${covMore} ${plural(covMore, ['показатель', 'показателя', 'показателей'])}` }}
                    </button>
                  </div>
                    </UiLoad>
                  </section>

                  <section v-if="sum.best?.length" class="blk" aria-label="Лучшие значения">
                    <div class="cov card">
                      <p class="cov__h">Лучшие значения <span>по статьям разбора, с учётом ваших правок</span></p>
                      <ul class="best" role="list">
                        <li v-for="b in sum.best" :key="b.metric">
                          <RouterLink :to="bestTo(b.pid, b.rid)" class="best__r" :data-tip="`${mName(b.metric)} · ${b.pid} · ${b.rid}${b.corrected ? ' · исправлено вами' : ''}`">
                            <span class="cov__m">{{ mName(b.metric) }}</span>
                            <b class="num">{{ bestVal(b.value, b.unit) }}</b>
                            <span class="cov__v num">{{ b.pid }}</span>
                          </RouterLink>
                        </li>
                      </ul>
                    </div>
                  </section>

                  <section class="blk" aria-label="Замечания">
                    <div class="blk__h">
                      <h2>Замечания</h2>
                      <RouterLink :to="dataLink('/checks', run.id)" class="btn btn--ghost btn--sm blk__a">Все замечания<Icon name="arrow-right" :size="15" /></RouterLink>
                    </div>
                    <UiLoad :loading="ragBusy || sumLoading"><template #skeleton><RunFeedSkeleton part="issues" /></template>
                      <p v-if="sum.byCheck?.length" class="bychk">{{ sum.byCheck.map((c) => `${checkLabel(c.check)} — ${c.total}`).join(' · ') }}</p>
                      <IssuesList :pids="pids" :limit="6" :domain="run.domain" />
                    </UiLoad>
                  </section>

                  <div v-if="!asked && suggestions.length" class="sugg rise" style="animation-delay: var(--t-slow)">
                    <p class="sugg__h">Можно спросить</p>
                    <ul class="sugg__l" role="list">
                      <li v-for="q in suggestions" :key="q"><button type="button" class="chip" @click="ask(q)">{{ q }}</button></li>
                    </ul>
                  </div>
                  <div class="ans__meta">
                    <time class="num" :datetime="new Date(m.at).toISOString()">{{ timeOf(m.at) }}</time>
                    <button type="button" class="ans__copy" :aria-label="copied === m.id ? 'Скопировано' : 'Копировать сводку'" :data-tip="copied === m.id ? undefined : 'Копировать сводку разбора'" @click="copyText(m.id, summaryText())">
                      <Icon :name="copied === m.id ? 'check' : 'copy'" :size="15" />{{ copied === m.id ? 'Скопировано' : 'Копировать' }}
                    </button>
                  </div>
                </template>
              </template>
            </div>
          </div>

          <div v-else-if="m.kind === 'answer'" class="ans" :style="tail?.id === m.id ? { minHeight: tail.min + 'px' } : undefined">
            <span class="ans__av" aria-hidden="true"><Icon name="logo" :size="18" /></span>
            <div class="ans__body">
              <div v-if="m.pending && (m.steps?.length || m.live)" class="live" aria-live="polite">
                <ol v-if="m.steps?.length" class="live__steps" role="list">
                  <li v-for="(s, i) in m.steps" :key="i" :class="{ 'is-cur': i === m.steps.length - 1 && !m.live }">
                    <UiSpinner v-if="i === m.steps.length - 1 && !m.live" :size="12" tone="current" /><Icon v-else name="check" :size="13" />{{ s }}
                  </li>
                </ol>
                <p v-if="m.live" class="live__text">{{ m.live }}<span class="live__caret" aria-hidden="true" /></p>
              </div>
              <UiLoad v-else :loading="!!m.pending">
                <template #skeleton><UiSkeleton :lines="3" /></template>
                <div v-if="m.error" class="ans__err">
                  <p>{{ m.error }}</p>
                  <button type="button" class="btn btn--soft btn--sm" @click="retryAnswer(run.id, m.id)">Повторить</button>
                </div>
                <component :is="CaseAnswer" v-else-if="CaseAnswer" :answer="m.answer" :asked="askedList" @ask="ask" />
                <p v-else class="ans__p">{{ answerText(m.answer) }}</p>
                <section v-if="!m.error && sourcesOf(m.answer).length" class="srcb" aria-label="Работы из OpenAlex">
                  <p class="srcb__h">Работы из OpenAlex <span>не входят в данные разбора</span></p>
                  <SourceList :sources="sourcesOf(m.answer)" />
                  <RouterLink v-if="m.sid" :to="{ path: '/run/' + encodeURIComponent(run.id) + '/sources', query: { m: m.sid } }" class="link srcb__all">
                    Источники{{ sourcesOf(m.answer).length > 4 ? ` (все ${sourcesOf(m.answer).length})` : '' }}<Icon name="arrow-right" :size="15" />
                  </RouterLink>
                </section>
                <div v-if="!m.error && m.answer" class="ans__meta">
                  <time class="num" :datetime="new Date(m.doneAt ?? m.at).toISOString()">{{ timeOf(m.doneAt ?? m.at) }}</time>
                  <span v-if="m.stopped" class="ans__stopped">остановлен</span>
                  <button type="button" class="ans__copy" :aria-label="copied === m.id ? 'Скопировано' : 'Копировать ответ'" :data-tip="copied === m.id ? undefined : 'Копировать ответ'" @click="copyAnswer(m.id, m.answer)">
                    <Icon :name="copied === m.id ? 'check' : 'copy'" :size="15" />{{ copied === m.id ? 'Скопировано' : 'Копировать' }}
                  </button>
                  <template v-if="m.sid">
                    <button type="button" class="ans__copy ans__rate" :class="{ 'is-on': m.rating === 'up' }" aria-label="Полезный ответ" :aria-pressed="m.rating === 'up'" data-tip="Полезный ответ" @click="rate(m.id, 'up', m.rating)"><Icon name="thumb-up" :size="15" /></button>
                    <span class="ans__ratew">
                      <button type="button" class="ans__copy ans__rate" :class="{ 'is-on': m.rating === 'down' }" aria-label="Ответ не подошёл" :aria-pressed="m.rating === 'down'" aria-haspopup="menu" :aria-expanded="rateOpen === m.id" data-tip="Ответ не подошёл" @click.stop="rate(m.id, 'down', m.rating)"><Icon name="thumb-down" :size="15" /></button>
                      <Transition name="pop">
                        <div v-if="rateOpen === m.id" class="menu ans__why" role="menu" @click.stop>
                          <p class="ans__whyh">Что не так?</p>
                          <button v-for="r in REASONS" :key="r" type="button" class="menu__item" role="menuitem" @click="rateDown(m.id, r)">{{ r }}</button>
                        </div>
                      </Transition>
                    </span>
                  </template>
                </div>
              </UiLoad>
              <button v-if="m.pending && m.sid" type="button" class="btn btn--ghost btn--sm ans__stop" @click="stopAnswer(run.id, m.id)"><span class="ans__sq" aria-hidden="true" />Остановить</button>
            </div>
          </div>
        </template>
        </UiLoad>
      </div>
    </div>

    <div class="rv__dock">
      <div v-if="isApi" ref="chatsWrap" class="chats">
        <button type="button" class="chats__btn" aria-haspopup="menu" :aria-expanded="chats" :data-tip="chats ? undefined : 'Чаты этого разбора'" @click.stop="chats = !chats">
          <Icon name="history" :size="15" /><span class="chats__t">{{ chatTitle }}</span><UiSpinner v-if="chatLoading[run.id]" :size="11" tone="current" /><Icon v-else name="chevron-down" :size="13" class="head__chev" :class="{ 'is-open': chats }" />
        </button>
        <button type="button" class="chats__new" aria-label="Новый чат" data-tip="Новый чат" @click="startChat"><Icon name="edit" :size="15" /></button>
        <Transition name="pop">
          <div v-if="chats" class="menu chats__pop" role="menu">
            <button type="button" class="menu__item" role="menuitem" @click="startChat"><Icon name="edit" :size="16" />Новый чат</button>
            <RouterLink v-if="chatCur" :to="{ path: '/run/' + encodeURIComponent(run.id) + '/sources', query: { thread: chatCur } }" class="menu__item" role="menuitem" @click="chats = false"><Icon name="book" :size="16" />Источники этого чата</RouterLink>
            <div v-if="chatList.length" class="menu__sep" role="separator" />
            <div v-for="t in chatList" :key="t.id" class="chats__row" :class="{ 'is-on': t.id === chatCur }">
              <button type="button" class="menu__item menu__item--2 chats__pick" role="menuitem" @click="pickChat(t.id)">
                <Icon :name="t.id === chatCur ? 'check' : 'chat'" :size="16" />
                <span>{{ t.title }}<small>{{ t.running_message_id ? 'пишется ответ…' : `${t.questions} ${plural(t.questions, ['вопрос', 'вопроса', 'вопросов'])}` }}</small></span>
              </button>
              <button type="button" class="icon-btn chats__act" :aria-label="'Переименовать ' + t.title" data-tip="Переименовать" @click="renameChatAsk(t.id, t.title)"><Icon name="edit" :size="14" /></button>
              <button type="button" class="icon-btn chats__act" :aria-label="'Удалить ' + t.title" data-tip="Удалить" @click="deleteChatAsk(t.id, t.title)"><Icon name="trash" :size="14" /></button>
            </div>
          </div>
        </Transition>
      </div>
      <FileComposer ask placeholder="Спросите о результатах или добавьте PDF" send-label="Добавить" @send="add" @ask="ask" />
    </div>
  </div>

  <div v-else-if="runsLoad.state === 'loading'" class="rv" aria-busy="true">
    <div class="rv__scroll"><div class="rv__inner">
      <header class="head"><div class="head__main"><UiSkeleton width="55%" height="1.4em" /><p class="head__meta"><UiSkeleton width="120px" /></p><p class="head__dom"><UiSkeleton width="220px" /></p></div></header>
      <RunFeedSkeleton />
    </div></div>
  </div>

  <div v-else class="rv rv--none">
    <UiEmpty icon="folder" title="Разбор не найден" text="Возможно, его удалили. Начните новый разбор.">
      <template #action>
        <RouterLink to="/app" class="btn btn--soft btn--sm">На главную</RouterLink>
      </template>
    </UiEmpty>
  </div>
</template>

<style scoped>
.bychk { margin: 0 0 var(--s2); font-size: var(--fs-xs); color: var(--muted); line-height: 1.5; }
.rv { position: relative; height: 100%; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.rv--none { display: grid; place-content: center; padding: var(--s6); grid-template-rows: none; }
.rv__scroll { position: relative; overflow: auto; container-type: inline-size; }
.rv__inner { width: min(808px, 100%); margin: 0 auto; padding: var(--s6); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--block); }
.rv__feed { display: grid; gap: var(--block); grid-template-columns: minmax(0, 1fr); }
.head__sk-b { flex: none; }
.rv__dock { width: min(808px, 100%); margin: 0 auto; padding: var(--s2) var(--s6) var(--s5); }
.head { display: flex; align-items: flex-start; gap: var(--s3); }
.head__main { flex: 1; min-width: 0; }
.head__title { font-size: var(--fs-h1); font-weight: 600; line-height: 1.25; letter-spacing: var(--h1-ls); }
.head__name { display: inline; padding: 0 var(--s1); margin-left: calc(-1 * var(--s1)); border-radius: var(--r-sm); overflow-wrap: anywhere; cursor: text; transition: background-color var(--t-fast) ease; }
.head__name:hover { background: var(--bg-2); }
.head__pen { display: inline-block; margin-left: var(--s2); vertical-align: -1px; color: var(--muted); opacity: 0; transition: opacity var(--t-fast) ease; }
.head__name:hover .head__pen, .head__name:focus-visible .head__pen { opacity: 1; }
.head__input { width: 100%; font: inherit; font-size: var(--fs-h1); font-weight: 600; line-height: 1.25; color: var(--ink); background: var(--card); border-radius: var(--r-sm); box-shadow: 0 0 0 1.5px var(--blue); padding: 0 var(--s1); margin-left: calc(-1 * var(--s1)); }
.head__meta { margin-top: var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.head__dom { margin-top: 2px; font-size: var(--fs-xs); color: var(--muted); }
.head__dom.is-warn { color: var(--warn, var(--ink-2)); }
.head__menu { position: relative; flex: none; }
.head__dl { flex: none; margin-top: 2px; }
.head__chev { margin-left: -2px; opacity: .6; transition: transform var(--t-fast) var(--ease); }
.head__chev.is-open { transform: rotate(180deg); }
.menu__item--2 { height: auto; min-height: 52px; align-items: flex-start; padding: var(--s2) var(--s3); }
.menu__item--2 > .ico, .menu__item--2 > svg { margin-top: 2px; }
.menu__item--2 > span { display: grid; gap: 3px; text-align: left; line-height: 1.3; }
.menu__item--2 small { font-size: var(--fs-xs); color: var(--muted); }
.head__pop .menu__item:disabled { opacity: 0.45; cursor: default; }
.head__pop { position: absolute; right: 0; top: calc(100% + var(--s1)); min-width: 260px; }
.head__pop .menu__item { white-space: nowrap; }
.q {
  justify-self: end; max-width: 80%; padding: var(--s3) var(--s4); border-radius: var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg);
  background: var(--bg-2); line-height: 1.5; overflow-wrap: anywhere; white-space: pre-wrap; scroll-margin-top: var(--s6);
}
.typing { display: inline-flex; gap: var(--s2); align-items: center; min-height: 28px; font-size: var(--fs-sm); color: var(--muted); }
.ans__err { display: flex; align-items: center; gap: var(--s3); color: var(--muted); }
.msg {
  justify-self: end; max-width: 80%; display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s3); padding: var(--s2) var(--s4);
  border-radius: var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg); background: var(--bg-2);
}
.msg__t { font-weight: 500; }
.msg__chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s1); }
.msg__chip { background: var(--card); box-shadow: none; }
.msg__chip.num { color: var(--muted); }
.msg__time { margin-left: auto; font-size: var(--fs-xs); color: var(--faint); }
.msg__tg { display: none; font-size: var(--fs-sm); }

.ans { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-content: start; gap: var(--s3); min-width: 0; }
.ans__av { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.ans__body { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--s5); padding-top: 2px; }
.srcb { display: grid; gap: var(--s3); padding: var(--s4) var(--s5); border-radius: var(--r); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.srcb__h { font-size: var(--fs-sm); font-weight: 600; }
.srcb__h span { margin-left: var(--s2); font-weight: 400; color: var(--muted); }
.srcb__all { justify-self: start; font-size: var(--fs-sm); }
.live { display: grid; gap: var(--s3); }
.live__steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s1); font-size: var(--fs-sm); color: var(--muted); }
.live__steps li { display: flex; align-items: center; gap: var(--s2); }
.live__steps li.is-cur { color: var(--ink-2); }
.live__text { color: var(--ink); line-height: 1.65; white-space: pre-line; overflow-wrap: anywhere; }
.live__caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -2px; background: currentColor; animation: caret 1s steps(2) infinite; }
@keyframes caret { 50% { opacity: 0; } }
.ans__stop { justify-self: start; margin-top: var(--s2); }
.ans__sq { width: 9px; height: 9px; border-radius: 2px; background: currentColor; }
.ans__stopped { padding: 0 var(--s2); border-radius: var(--r-pill); background: var(--bg-2); }
.ans__rate { padding: 0 var(--s1); }
.ans__rate.is-on { color: var(--ink); background: var(--bg-2); }
.ans__ratew { position: relative; display: inline-flex; }
.ans__why { left: 0; bottom: calc(100% + var(--s1)); min-width: 200px; }
.ans__whyh { padding: var(--s2) var(--s3) var(--s1); font-size: var(--fs-xs); color: var(--muted); }
.chats { position: relative; display: flex; align-items: center; gap: var(--s1); margin: 0 0 var(--s2) var(--s1); }
.chats__btn { display: inline-flex; align-items: center; gap: var(--s2); min-height: 30px; max-width: min(420px, 70vw); padding: 0 var(--s3); border-radius: var(--r-pill); font-size: var(--fs-sm); color: var(--muted); }
.chats__btn:hover, .chats__new:hover { background: var(--bg-2); color: var(--ink); }
.chats__t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chats__new { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; color: var(--muted); }
.chats__pop { left: 0; bottom: calc(100% + var(--s1)); width: min(380px, calc(100vw - 32px)); max-height: 360px; overflow: auto; }
.chats__row { display: flex; align-items: center; gap: 2px; border-radius: var(--r-sm); }
.chats__row.is-on { background: var(--bg-2); }
.chats__pick { flex: 1; min-width: 0; }
.chats__pick > span { min-width: 0; }
.chats__pick > span, .chats__pick small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chats__act { width: 28px; height: 28px; opacity: 0; }
.chats__row:hover .chats__act, .chats__act:focus-visible { opacity: 1; }
@media (hover: none) { .chats__act { opacity: 1; } }
@media (max-width: 768px) { .chats__btn, .chats__new { min-height: 40px; } .chats__new { width: 40px; height: 40px; } }
.ans__meta { display: flex; align-items: center; gap: var(--s3); margin-top: var(--s3); font-size: var(--fs-xs); color: var(--muted); }
.ans__copy { display: inline-flex; align-items: center; gap: var(--s1); min-height: 28px; padding: 0 var(--s2); margin-left: calc(-1 * var(--s1)); border-radius: var(--r-sm); color: var(--muted); }
.ans__copy:hover { background: var(--bg-2); color: var(--ink); }
@media (max-width: 768px) { .ans__copy { min-height: 40px; } }
.ans__p { color: var(--ink-2); line-height: 1.6; }
.files { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s2); min-width: 0; }
.files__top { display: flex; align-items: center; gap: var(--s3); }
.files__lead { flex: 1; font-weight: 500; }
.files__pct { color: var(--muted); font-size: var(--fs-sm); }
.files__line { display: inline-flex; align-items: center; gap: var(--s2); justify-self: start; min-height: 32px; padding: 0 var(--s2); margin-left: calc(-1 * var(--s2)); border-radius: var(--r-sm); color: var(--ink); text-align: left; transition: background-color var(--t-fast) ease; }
.files__line:hover { background: var(--bg-2); }
.files__ok { color: var(--green); flex: none; }
.files__chev { color: var(--muted); transition: rotate var(--t) var(--ease); rotate: -90deg; flex: none; }
.files__chev.is-open { rotate: 0deg; }
.files__list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; border-radius: var(--r); overflow: hidden; box-shadow: inset 0 0 0 1px var(--line); background: var(--line); }
.fr { display: flex; align-items: center; gap: var(--s3); min-height: 40px; padding: 0 var(--s3); background: var(--card); color: var(--ink); font-size: var(--fs-sm); }
.fr.is-link { cursor: pointer; transition: background-color var(--t-fast) ease; }
.fr.is-link:hover { background: var(--bg); }
.fr__st { width: 16px; flex: none; display: grid; place-items: center; color: var(--muted); }
.fr--done .fr__st, .fr--ocr .fr__st { color: var(--green); }
.fr--error .fr__st { color: var(--red); }
.fr__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--line-2); }
.fr__id { flex: none; width: 52px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
.fr__s { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: var(--fs-xs); }
.fr--error .fr__s { color: var(--red); }
.fr__prg { flex: none; width: 96px; display: grid; }
.redo { display: grid; gap: var(--s3); margin-top: var(--s4); padding: var(--s4); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.redo__t { display: flex; gap: var(--s2); align-items: flex-start; color: var(--ink); }
.redo__ico { flex: none; margin-top: 3px; color: var(--blue); }
.redo__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-height: 260px; overflow-y: auto; }
.redo__row { display: flex; align-items: center; gap: var(--s3); min-height: 36px; padding: 0 var(--s2); border-radius: var(--r-sm); cursor: pointer; }
@media (hover: hover) { .redo__row:hover { background: var(--bg-2); } }
.redo__row input { flex: none; width: 16px; height: 16px; accent-color: var(--blue); }
.redo__id { flex: none; min-width: 3.5em; font-size: var(--fs-xs); font-weight: 500; color: var(--ink-2); }
.redo__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-sm); color: var(--muted); }
.redo__hint-chip { flex: none; margin-left: auto; padding: 2px var(--s2); border-radius: var(--r-pill); background: var(--blue-wash); color: var(--blue); font-size: var(--fs-xs); white-space: nowrap; }
.redo__act { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3); }
.redo__hint { font-size: var(--fs-xs); color: var(--faint); }
.fr__pct { flex: none; min-width: 3.2em; text-align: right; font-size: var(--fs-xs); color: var(--muted); }
.files__eta { font-size: var(--fs-sm); color: var(--muted); white-space: nowrap; }
.sum { display: grid; gap: var(--s3); }
.strip { list-style: none; margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s1) var(--s4); padding: var(--s3) var(--s4); font-size: var(--fs-sm); color: var(--ink-2); }
.strip li { display: inline-flex; align-items: baseline; gap: var(--s1); min-width: 0; white-space: nowrap; }
.strip b { font-size: var(--fs-body); font-weight: 600; color: var(--ink); letter-spacing: 0; }
.strip .dot { align-self: center; margin-right: var(--s1); }
.cov { display: grid; gap: var(--s3); padding: var(--s4) var(--s5); }
.cov__h { font-size: var(--fs-sm); font-weight: 600; color: var(--ink); }
.cov__h span { margin-left: var(--s2); font-weight: 400; color: var(--muted); }
.cov__all { margin-top: calc(-1 * var(--s1)); font-size: var(--fs-sm); color: var(--ink-2); }
.cov__l { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s2) var(--s6); }
.cov__r { display: grid; grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto; align-items: center; gap: var(--s3); font-size: var(--fs-sm); }
.cov__m { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cov__bar { height: 4px; border-radius: var(--r-pill); background: var(--bg-2); overflow: hidden; }
.cov__bar i { display: block; height: 100%; border-radius: inherit; background: var(--ink-2); transition: width var(--t-slow) var(--ease); }
.cov__v { min-width: 5.5em; text-align: right; font-size: var(--fs-xs); color: var(--muted); }
.best { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s1) var(--s6); }
.best__r { display: grid; grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto; align-items: center; gap: var(--s3); min-height: 32px; padding: 0 var(--s2); margin: 0 calc(-1 * var(--s2)); border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--ink); text-decoration: none; }
.best__r:hover { background: var(--bg-2); }
.best__r b { font-weight: 600; }
@media (max-width: 768px) { .best { grid-template-columns: minmax(0, 1fr); } .best__r { min-height: 44px; } }
.cov__more { justify-self: start; font-size: var(--fs-sm); }
.blk { display: grid; gap: var(--s3); min-width: 0; }
.blk__h { display: flex; align-items: center; gap: var(--s3); }
.blk__h h2 { flex: 1; font-size: var(--fs-h2); font-weight: 600; }
.blk__a { margin-right: calc(-1 * var(--s3)); color: var(--ink-2); }
.sugg { display: grid; gap: var(--s2); }
.sugg__h { font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.sugg__l { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--s2); }
@media (min-width: 769px) {
  .head { padding-left: calc(28px + var(--s3)); }
}

@media (max-width: 768px) {
  .rv__inner { padding: var(--s4) var(--s3); gap: var(--s6); }
  .rv__dock { padding: var(--s2) var(--s2) calc(var(--s2) + var(--safe-b)); }
  .head { align-items: center; }
  .head__title { display: none; }
  .head__meta { margin-top: 0; }
  .msg, .q { max-width: 92%; }
  .msg { flex-wrap: wrap; row-gap: 0; padding: var(--s1) var(--s3); }
  .msg__tg { display: inline-flex; align-items: center; min-height: 44px; }
  .msg:not(.is-open) .msg__chips { display: none; }
  .msg.is-open .msg__chips { flex-basis: 100%; padding-bottom: var(--s2); }
  .ans { grid-template-columns: minmax(0, 1fr); }
  .ans__av { display: none; }
  .fr { min-height: 48px; }
  .fr__t { display: none; }
  .fr__id { width: auto; flex: 1; }
  .fr__s { max-width: 60%; }
  .strip { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s1) var(--s3); padding: var(--s3); }
  .strip li { white-space: normal; }
  .cov { padding: var(--s4); }
  .cov__h span { display: block; margin: var(--s1) 0 0; }
  .cov__l { grid-template-columns: minmax(0, 1fr); }
  .cov__more { min-height: 44px; }
  .blk__a { margin-right: calc(-1 * var(--s2)); height: 44px; }
  .head__menu .icon-btn { width: 44px; height: 44px; }
  .head__dl { height: 44px; margin-top: 0; }
  .files__line { min-height: 44px; }
  .sugg__l { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--s3)); padding: 0 var(--s3); }
  .sugg__l li { flex: none; }
}
</style>
