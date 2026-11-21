<script setup lang="ts">
import { resetHints } from '../hints'
import { scrollWithin } from '../scroll'
import { computed, h, nextTick, onBeforeUnmount, onMounted, ref, watch, type FunctionalComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { state, toast } from '../store'
import { FEATURES } from '../features'
import { keyLabels, shortcut } from '../keys'
import {
  CLIMITS, CORDER, CSCOPES, CTITLE, fixLayout, paperName, plural, runOfPaper, searchCase, segments, wordsOf,
  type CHit, type CScope, type Cmd,
} from '../search'
import { searchRag } from '../searchRag'
import { ragConfigName, ragConfig, ragConfigNameOf, ragDataset, ragFmtValue, ragIssue, ragLoadAll, ragMetricName, ragTopMetrics, ragPlaceOf, ragPublication, ragResult, ragCheckLabel, ragSummaryOf } from '../case/rag'
import { NODATA_TEXT, checkLabel, paperPath, deviceName, fmtRaw, fmtValue, issue, metricLabel, placeOf, publication, result, resultsOf, type ResultRow } from '../case'
import { downloadRunSubmission, submissionToast } from '../case/export'
import { DATA_PATHS, dataRun } from '../dataTabs'
import { inbox, rerun, runOf, runPapers, runSummary } from '../case/runs'
import { fmtInt } from '../fmt'

type Row =
  | { t: 'head'; key: string; title: string }
  | { t: 'item'; item: CHit; idx: number }
  | { t: 'ops' }

const router = useRouter()
const route = useRoute()
const query = ref('')
const scope = ref<CScope>('all')
const active = ref(0)
const input = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)
const hoverNone = window.matchMedia('(hover: none)')

const Hl: FunctionalComponent<{ text: string; words: string[] }> = (props) =>
  segments(props.text, props.words).map((s) => (s.m ? h('mark', s.t) : s.t))
Hl.props = ['text', 'words']

const RECENT_KEY = 'gs:v1:recent-search'
function loadRecents(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}
const recents = ref<string[]>(loadRecents())
function saveRecents() {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recents.value)) } catch { }
}
function removeRecent(q: string) {
  recents.value = recents.value.filter((r) => r !== q)
  saveRecents()
}

const PREFIX: Record<string, CScope> = { '/': 'command', '!': 'issue', '=': 'value' }
const prefixOf = () => Object.entries(PREFIX).find(([, s]) => s === scope.value)?.[0] ?? ''
const scopes = computed(() => CSCOPES.filter((s) => s.id !== 'cond' || ragCtx.value))
const scopeLabel = computed(() => CSCOPES.find((s) => s.id === scope.value)?.label ?? '')
watch(query, (v) => {
  const sc = v ? PREFIX[v[0]!] : undefined
  if (!sc) return
  scope.value = sc
  query.value = v.slice(1).replace(/^\s+/, '')
})
function setScope(s: CScope) {
  scope.value = s
  input.value?.focus()
}
function cycleScope(dir: 1 | -1) {
  const l = scopes.value
  const i = l.findIndex((s) => s.id === scope.value)
  setScope(l[(i + dir + l.length) % l.length]!.id)
}

const close = () => { state.palette = false }
const to = (path: string) => () => void router.push(path)
const MODES = { light: 'светлая', dark: 'тёмная', system: 'как в системе' } as const
function newRun() {
  if (route.path === '/app') inbox.clear++
  else void router.push('/app')
}
const baseCommands = computed<Cmd[]>(() => [
  { id: 'new', title: 'Новый разбор', desc: 'Загрузить PDF, папку или ZIP и разобрать', icon: 'newchat', keys: shortcut('new'), keywords: 'загрузить pdf файл папка zip новый разбор статьи', run: newRun },
  { id: 'facts', title: 'Таблица', desc: 'Результаты разбора: поиск и фильтры', icon: 'table', keywords: 'таблица результаты значения фильтр', run: to('/facts') },
  { id: 'checks', title: 'Проверки', desc: 'Замечания: что проверить и как закрыть', icon: 'shield', keywords: 'проверки замечания ошибки противоречия', run: to('/checks') },
  ...(FEATURES.compare ? [{ id: 'compare', title: 'Сравнение', desc: 'Результаты разных статей рядом', icon: 'columns', keywords: 'сравнение рядом', run: to('/compare') }] : []),
  ...(FEATURES.graph ? [{ id: 'graph', title: 'Связи статей', desc: 'Цитирования, общие материалы и методы', icon: 'graph', keywords: 'граф связи цитирования ссылки', run: to('/graph') }] : []),
  { id: 'export', title: 'Экспорт', desc: 'Набор для сдачи (ZIP, 7 таблиц), JSON, Excel', icon: 'export', keywords: 'скачать csv выгрузка набор сдача excel json', run: to('/export') },
  { id: 'passport', title: 'Паспорт набора', desc: 'Поля, типы, единицы, правила и критерии', icon: 'book', keywords: 'паспорт описание файлов поля колонки выгрузка', run: to('/passport') },
  { id: 'history', title: 'Журнал правок', desc: 'Кто и когда принял, исправил или отклонил значение', icon: 'history', keywords: 'история изменения журнал', run: to('/history') },
  { id: 'settings', title: 'Настройки', desc: 'Профиль, внешний вид, клавиши', icon: 'gear', keys: shortcut('settings'), keywords: 'профиль внешний вид тема шрифт', run: to('/settings') },
  { id: 'keys', title: 'Горячие клавиши', desc: 'Список всех сочетаний клавиш', icon: 'keyboard', keys: shortcut('keys'), keywords: 'клавиши сочетания шорткаты', run: () => { state.keysModal = true } },
  { id: 'sidebar', title: 'Свернуть панель', desc: 'Скрыть или показать боковую панель', icon: 'sidebar', keys: shortcut('sidebar'), keywords: 'боковая панель сайдбар', run: () => { state.sidebar = !state.sidebar } },
  {
    id: 'theme', title: 'Переключить тему', desc: 'Светлая → тёмная → как в системе', icon: 'sun', keywords: 'тёмная светлая режим dark light',
    run: () => {
      const m = state.appearance.mode
      state.appearance.mode = m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'
      toast(`Тема: ${MODES[state.appearance.mode]}`)
    },
  },
  { id: 'hints', title: 'Показать подсказки снова', desc: 'Вернуть закрытые подсказки', icon: 'info', keywords: 'подсказки помощь', run: () => { resetHints(); toast('Подсказки снова будут показаны') } },
])
const QUICK = ['new', 'theme', 'settings', 'keys']
const DATA_IDS = ['facts', 'checks', ...(FEATURES.compare ? ['compare'] : []), 'graph', 'export', 'passport', 'history']

const ctxRunId = computed(() => (route.path.startsWith('/run/') ? String(route.params.id) : ''))
const commands = computed<Cmd[]>(() => {
  const id = ctxRunId.value
  if (!id || !runOf(id)) return baseCommands.value
  return [
    { id: 'ctx-export', title: 'Скачать набор для сдачи', desc: 'ZIP, 7 таблиц — сразу, без экрана «Экспорт»', icon: 'export', keywords: 'скачать csv zip набор сдача', run: () => downloadSet(id) },
    { id: 'ctx-facts', title: 'Таблица этого разбора', desc: 'Результаты на весь экран', icon: 'table', keywords: 'таблица результаты', run: to('/facts?run=' + id) },
    { id: 'ctx-rerun', title: 'Разобрать заново', desc: 'Все PDF разбора — снова в очередь', icon: 'undo', keywords: 'заново повторить прогон разобрать', run: () => rerun(id) },
    ...baseCommands.value,
  ]
})

const curRun = computed(() => {
  if (route.path.startsWith('/run/')) return runOf(String(route.params.id)) ? String(route.params.id) : ''
  const q = route.query.run
  if (typeof q === 'string' && runOf(q)) return q
  if (DATA_PATHS.some((x) => route.path.startsWith(x)) && dataRun.value && runOf(dataRun.value)) return dataRun.value
  return ''
})
const curTitle = computed(() => runOf(curRun.value)?.title ?? '')
const ragCtx = computed(() => !!curRun.value && runOf(curRun.value)?.domain === 'rag')
const mergeRes = (a: ReturnType<typeof searchCase>, b: ReturnType<typeof searchCase>) =>
  Object.fromEntries(CORDER.map((k) => [k, [...a[k], ...b[k]].sort((x, y) => y.score - x.score)])) as ReturnType<typeof searchCase>
const searchIn = (ws: string[]) => {
  const cmds = commands.value
  if (ragCtx.value && !everywhere.value) return searchRag(ws, cmds, opts.value)
  if (!everywhere.value) return searchCase(ws, cmds, opts.value)
  const solar = searchCase(ws, cmds, opts.value)
  const rag = searchRag(ws, [], opts.value)
  return mergeRes(solar, rag)
}
const everywhere = ref(false)
const here = computed(() => (curRun.value ? new Set(runPapers(curRun.value)) : undefined))
const opts = computed(() => ({ pids: everywhere.value ? undefined : here.value, here: here.value }))

const totalOf = (r: ReturnType<typeof searchCase>) => (scope.value === 'all' ? CORDER.reduce((n, k) => n + r[k].length, 0) : r[scope.value].length)
const found = computed(() => {
  const q = query.value.trim()
  let words = wordsOf(q, false)
  let res = searchIn(words)
  let fixed: string | null = null
  if (words.length) {
    const alt = fixLayout(q)
    if (alt && totalOf(res) < 2) {
      const w2 = wordsOf(alt, false)
      const r2 = searchIn(w2)
      if (totalOf(r2) > totalOf(res) && (totalOf(res) === 0 || totalOf(r2) >= 3)) {
        res = r2
        words = w2
        fixed = alt
      }
    }
  }
  return { res, words, fixed }
})
const words = computed(() => found.value.words)
const counts = computed(() => {
  const r = found.value.res
  const c = Object.fromEntries(CORDER.map((k) => [k, r[k].length])) as Record<string, number>
  c.all = CORDER.reduce((n, k) => n + r[k].length, 0)
  return c
})

const view = computed(() => {
  const { res, words: w } = found.value
  const rows: Row[] = []
  const items: CHit[] = []
  const push = (item: CHit) => {
    rows.push({ t: 'item', item, idx: items.length })
    items.push(item)
  }
  const head = (title: string) => rows.push({ t: 'head', key: title, title })
  const pushCmds = (l: CHit[]) => {
    const ctxL = l.filter((c) => c.ref.startsWith('ctx-'))
    const dataL = l.filter((c) => DATA_IDS.includes(c.ref))
    const actL = l.filter((c) => !c.ref.startsWith('ctx-') && !DATA_IDS.includes(c.ref))
    for (const [title, part] of [['Этот разбор', ctxL], ['Действия', actL], ['Данные', dataL]] as const) {
      if (!part.length) continue
      head(title)
      part.forEach(push)
    }
  }
  if (scope.value === 'all' && !w.length) {
    const ctxL = res.command.filter((c) => c.ref.startsWith('ctx-'))
    if (ctxL.length) { head('Этот разбор'); ctxL.forEach(push) }
    if (ragCtx.value && !everywhere.value) {
      const ps = runPapers(curRun.value)
      const ex = [...ragTopMetrics(ps, 3).map((m) => m.metric), ...ps.slice(0, 1)]
      if (ex.length) {
        head('Что можно найти')
        for (const e of ex) push({ id: 'ex:' + e, kind: 'recent', ref: e, title: e, meta: /^D\d{3}$/.test(e) ? 'статья' : 'метрика', icon: 'search', score: 0 })
      }
    }
    if (recents.value.length) {
      head('Недавние')
      for (const r of recents.value) push({ id: 'q:' + r, kind: 'recent', ref: r, title: r.replace(/^[/!=]\s*/, ''), meta: '', icon: 'search', score: 0 })
    }
    head('Действия')
    for (const id of QUICK) { const x = res.command.find((c) => c.ref === id); if (x) push(x) }
    head('Данные')
    for (const id of DATA_IDS) { const x = res.command.find((c) => c.ref === id); if (x) push(x) }
    rows.push({ t: 'ops' })
  } else if (scope.value === 'all') {
    for (const k of CORDER) {
      const l = res[k]
      if (!l.length) continue
      if (k === 'command') { pushCmds(l.slice(0, 8)); continue }
      head(CTITLE[k])
      l.slice(0, CLIMITS[k]).forEach(push)
      const more = l.length - CLIMITS[k]
      if (more > 0) push({ id: 'm:' + k, kind: 'more', ref: k, title: `Ещё ${more}`, meta: CTITLE[k], icon: 'arrow-right', score: 0 })
    }
  } else {
    const k = scope.value
    const l = res[k]
    if (k === 'command') pushCmds(l)
    else {
      if (l.length) head(CTITLE[k])
      l.slice(0, 80).forEach(push)
    }
  }
  return { rows, items }
})
const items = computed(() => view.value.items)
const sel = computed<CHit | undefined>(() => items.value[active.value])
watch([query, scope, everywhere], () => { active.value = 0 })
watch([active, items], () => {
  void nextTick(() => {
    const el = list.value
    if (!el) return
    if (active.value === 0) el.scrollTop = 0
    else scrollWithin(el, el.querySelector('.row.is-sel'), 'nearest', false)
  })
})

function downloadSet(id: string) {
  const r = runOf(id)
  if (!r) return
  const name = r.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'разбор'
  void downloadRunSubmission(id, runPapers(id), `Набор для сдачи — ${name}.zip`).then((s) => toast(submissionToast(s)))
}

function quoteOf(r: ResultRow): { body?: string; bodyLabel?: string } {
  const f = r.source_fragment?.trim()
  if (!f) return {}
  const m = /^(.*?(?:table|табл)[^,]*),\s*строка\s+(.+)$/i.exec(f)
  if (!m) return { body: f, bodyLabel: 'Фрагмент текста' }
  const cells = resultsOf(r.publication_id).filter((x) => x.source_fragment?.trim() === f && x.raw_value).map((x) => `${metricLabel(x.metric_name)} ${fmtRaw(x)}`)
  const label = m[2]!.trim()
  return {
    bodyLabel: `Место в статье: ${placeOf({ source_page: '', source_table: m[1]! })}, строка «${/^pristine$/i.test(label) ? 'без добавки (pristine)' : label}»`,
    body: [label, ...cells].join(' | '),
  }
}

function ragPv(x: CHit): PV | null {
  const pid = x.pid ?? ''
  const ttl = ragPublication(pid)?.title ?? pid
  if (x.kind === 'paper') {
    const p = ragPublication(pid)
    if (!p) return null
    const sm = ragSummaryOf(pid)
    return {
      kind: 'Статья ' + pid, title: p.title,
      lines: [[p.authors, p.year].filter(Boolean).join(' · '), `${fmtInt(sm.results)} значений · ${fmtInt(sm.configurations)} конфигураций · ${fmtInt(sm.datasets)} датасетов`, p.DOI ? 'DOI ' + p.DOI : ''].filter(Boolean),
      warn: p.in_scope === 'false' ? 'Не по теме: ' + (p.exclusion_reason || 'причина не указана') : undefined,
    }
  }
  if (x.kind === 'value') {
    const r = x.query?.r ? ragResult(pid, x.query.r) : undefined
    if (!r) return { kind: 'Метрика', title: x.title, lines: [ttl, x.meta.replace(/ · не из этого разбора$/, ''), 'Откроется список значений этой метрики'] }
    return { kind: 'Значение', title: `${ragMetricName(r)} · ${pid}`, big: ragFmtValue(r), lines: [ragConfigNameOf(pid, r.config_id), ragPlaceOf(r), ttl].filter(Boolean) }
  }
  if (x.kind === 'cond') {
    if (x.query?.ds) {
      const d = ragDataset(pid, x.query.ds)
      return { kind: 'Датасет', title: d?.dataset_name || x.title, lines: [ttl, [d?.dataset_version, d?.language, d?.data_split].filter(Boolean).join(' · '), 'Откроется список значений на этом датасете'].filter(Boolean) }
    }
    const c = x.query?.cfg ? ragConfig(pid, x.query.cfg) : undefined
    return { kind: 'Конфигурация', title: c ? ragConfigName(c) : x.title, lines: [ttl, [c?.generator_model, c?.retriever_model, c?.embedding_model].filter(Boolean).join(' · '), 'Откроется список значений этой конфигурации'].filter(Boolean) }
  }
  if (x.kind === 'issue') {
    const i = ragIssue(pid, x.ref)
    if (!i) return null
    return { kind: 'Замечание', title: ragCheckLabel(i.check_name), lines: [`${pid}${i.source_page ? ' · стр. ' + i.source_page : ''}`, ttl], bodyLabel: 'Описание из разметки (англ.)', body: i.description }
  }
  if (x.kind === 'command') {
    const c = commands.value.find((y) => y.id === x.ref)
    return c ? { kind: 'Команда', title: c.title, lines: [], desc: c.desc, keys: c.keys ? keyLabels(c.keys) : undefined } : null
  }
  return null
}

interface PV { kind: string; title: string; lines: string[]; big?: string; bigNote?: string; body?: string; bodyLabel?: string; keys?: string[]; desc?: string; warn?: string }
const pv = computed<PV | null>(() => {
  const x = sel.value
  if (!x) return null
  if (x.domain === 'rag') return ragPv(x)
  switch (x.kind) {
    case 'paper': {
      const p = publication(x.ref)
      if (!p) return { kind: 'Статья', title: x.title, lines: [NODATA_TEXT] }
      return {
        kind: 'Статья ' + p.publication_id, title: p.title, lines: [[p.authors, p.year].filter(Boolean).join(' · '), p.DOI ? 'DOI ' + p.DOI : ''].filter(Boolean),
        warn: p.in_scope === 'false' ? 'Не по теме: ' + (p.exclusion_reason || 'причина не указана') : undefined,
      }
    }
    case 'run': {
      const r = runOf(x.ref)
      if (!r) return null
      const s = runSummary(r.id)
      return {
        kind: 'Разбор', title: r.title,
        lines: [`${s.papers} ${plural(s.papers, ["файл", "файла", "файлов"])} · ${s.inScope} по теме`, `${fmtInt(s.values)} ${plural(s.values, ['значение', 'значения', 'значений'])} · ${s.issues} ${plural(s.issues, ['замечание', 'замечания', 'замечаний'])}`],
      }
    }
    case 'value': {
      const r = result(x.pid ?? '', x.ref)
      if (!r) return null
      const raw = fmtRaw(r)
      return {
        kind: 'Значение', title: `${metricLabel(r.metric_name)} · ${r.publication_id}`, big: fmtValue(r), bigNote: raw !== '—' ? 'в статье: ' + raw : undefined,
        lines: [r.device_id ? 'Прибор: ' + deviceName(r.publication_id, r.device_id) : '', placeOf(r), paperName(r.publication_id)].filter(Boolean), ...quoteOf(r),
      }
    }
    case 'issue': {
      const i = issue(x.pid ?? '', x.ref)
      if (!i) return null
      return { kind: 'Замечание', title: checkLabel(i.check_name), lines: [`${i.publication_id}${i.source_page ? ' · стр. ' + i.source_page : ''}`, paperName(i.publication_id)], body: i.description }
    }
    case 'command': {
      const c = commands.value.find((y) => y.id === x.ref)
      if (!c) return null
      return { kind: 'Команда', title: c.title, lines: [], desc: c.desc, keys: c.keys ? keyLabels(c.keys) : undefined }
    }
    default:
      return null
  }
})

function remember() {
  const q = (found.value.fixed ?? query.value).trim()
  if (q.length < 2) return
  const raw = prefixOf() + q
  recents.value = [raw, ...recents.value.filter((r) => r !== raw)].slice(0, 5)
  saveRecents()
}
function activate(x: CHit | undefined) {
  if (!x) return
  if (x.kind === 'more') return setScope(x.ref as CScope)
  if (x.kind === 'recent') {
    scope.value = 'all'
    query.value = x.ref
    input.value?.focus()
    return
  }
  remember()
  close()
  const run = (pid?: string) => (pid ? runOfPaper(pid, curRun.value) : '')
  const q = (pid: string | undefined, extra: Record<string, string>) => (run(pid) ? { ...extra, run: run(pid) } : extra)
  if (x.domain === 'rag' && x.pid && (x.kind === 'paper' || x.kind === 'value' || x.kind === 'cond' || x.kind === 'issue')) {
    const extra = x.kind === 'issue' ? { i: x.ref } : (x.query ?? {})
    void router.push({ path: paperPath(x.pid, 'rag'), query: q(x.pid, extra) })
    return
  }
  switch (x.kind) {
    case 'paper': void router.push({ path: '/paper/' + x.ref, query: q(x.ref, {}) }); break
    case 'run': void router.push('/run/' + x.ref); break
    case 'value': void router.push({ path: '/paper/' + x.pid, query: q(x.pid, { r: x.ref }) }); break
    case 'issue': void router.push({ path: '/paper/' + x.pid, query: q(x.pid, { i: x.ref }) }); break
    case 'command': commands.value.find((c) => c.id === x.ref)?.run(); break
  }
}

function onKey(e: KeyboardEvent) {
  if (!state.palette || e.isComposing) return
  const n = items.value.length
  const take = () => { e.preventDefault(); e.stopPropagation() }
  const wrap = (d: number) => { if (n) active.value = (active.value + d + n) % n }
  const jump = (d: number) => { if (n) active.value = Math.min(n - 1, Math.max(0, active.value + d)) }
  const ctrlOnly = e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
  const el = input.value
  if (e.key === 'Escape') { take(); close() }
  else if (e.key === 'ArrowDown' || (ctrlOnly && e.code === 'KeyJ')) { take(); wrap(1) }
  else if (e.key === 'ArrowUp' || (ctrlOnly && e.code === 'KeyK')) { take(); wrap(-1) }
  else if (e.key === 'PageDown') { take(); jump(5) }
  else if (e.key === 'PageUp') { take(); jump(-5) }
  else if (e.key === 'Home' && (!el || el.selectionStart === 0)) { take(); if (n) active.value = 0 }
  else if (e.key === 'End' && (!el || el.selectionEnd === el.value.length)) { take(); if (n) active.value = n - 1 }
  else if (e.key === 'Tab') { take(); cycleScope(e.shiftKey ? -1 : 1) }
  else if (e.key === 'Enter') { take(); activate(items.value[active.value]) }
  else if (e.key === 'Backspace' && !query.value && scope.value !== 'all') { take(); setScope('all') }
}
watch(
  () => state.palette,
  (open) => {
    if (!open) return
    query.value = ''
    scope.value = 'all'
    everywhere.value = false
    active.value = 0
    recents.value = loadRecents()
    if (ragCtx.value) void ragLoadAll(runPapers(curRun.value))
    void nextTick(() => input.value?.focus())
  },
  { flush: 'post' },
)
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

const TWO = ['paper', 'value', 'cond', 'issue']
const noResults = computed(() => !items.value.length && !!words.value.length)
const queryShown = computed(() => query.value.trim())
</script>

<template>
  <Transition name="fade">
    <div v-if="state.palette" class="overlay" @click.self="close">
      <div class="pal modal" role="dialog" aria-modal="true" aria-label="Поиск и команды">
        <div class="pal__search">
          <Icon name="search" :size="20" class="pal__lead" />
          <span v-if="scope !== 'all'" class="pal__chip">{{ scopeLabel }}</span>
          <input
            ref="input"
            v-model="query"
            class="pal__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-autocomplete="list"
            :aria-activedescendant="sel ? 'pal-opt-' + active : undefined"
            :placeholder="scope === 'all' ? (ragCtx && !everywhere ? 'Метрики, датасеты, конфигурации, статьи…' : 'Статьи, разборы, значения, команды…') : 'Искать в разделе «' + scopeLabel + '»…'"
            autocomplete="off"
            spellcheck="false"
            aria-label="Поиск"
          />
          <kbd class="pal__esc">Esc</kbd>
          <button type="button" class="pal__cancel" @click="close">Отмена</button>
        </div>

        <div class="pal__bar">
          <div class="seg pal__tabs" role="tablist" aria-label="Разделы поиска">
            <button
              v-for="s in scopes"
              :key="s.id"
              type="button"
              role="tab"
              :aria-selected="scope === s.id"
              tabindex="-1"
              @mousedown.prevent
              @click="setScope(s.id)"
            >
              {{ s.label }}<span v-if="counts[s.id]" class="seg__n">{{ fmtInt(counts[s.id]) }}</span>
            </button>
          </div>
          <div v-if="curRun" class="seg pal__where" role="radiogroup" aria-label="Где искать">
            <button type="button" role="radio" :aria-checked="!everywhere" :data-tip="curTitle" tabindex="-1" @mousedown.prevent @click="everywhere = false">В разборе</button>
            <button type="button" role="radio" :aria-checked="everywhere" tabindex="-1" @mousedown.prevent @click="everywhere = true">Везде</button>
          </div>
        </div>

        <div class="pal__body" :class="{ 'pal__body--none': noResults }">
          <div ref="list" id="pal-list" class="pal__list" role="listbox" aria-label="Результаты">
            <p v-if="found.fixed" class="pal__fix">
              Показаны результаты для
              <button type="button" @mousedown.prevent @click="query = found.fixed ?? ''">«{{ found.fixed }}»</button>
            </p>

            <template v-for="r in view.rows" :key="r.t === 'item' ? r.item.id : r.t === 'ops' ? 'ops' : r.key">
              <p v-if="r.t === 'head'" class="pal__group" role="presentation">{{ r.title }}</p>
              <div v-else-if="r.t === 'ops'" class="pal__ops" role="presentation">
                <span class="pal__ops-t">Операторы</span>
                <span><kbd>/</kbd> команды</span>
                <span><kbd>!</kbd> замечания</span>
                <span><kbd>=</kbd> значения и числа</span>
              </div>
              <div
                v-else
                :id="'pal-opt-' + r.idx"
                class="row"
                :class="{ 'is-sel': r.idx === active, 'row--more': r.item.kind === 'more', 'row--2': TWO.includes(r.item.kind) }"
                role="option"
                :aria-selected="r.idx === active"
                @mousemove="!hoverNone.matches && active !== r.idx && (active = r.idx)"
                @mousedown.prevent
                @click="activate(r.item)"
              >
                <Icon :name="r.item.icon" :size="16" class="row__ico" />
                <span class="row__title"><Hl :text="r.item.title" :words="r.item.kind === 'recent' || r.item.kind === 'more' ? [] : words" /></span>
                <span v-if="r.item.value" class="row__val"><Hl :text="r.item.value" :words="words" /></span>
                <span v-if="r.item.meta && !(state.mobile && r.item.kind === 'command')" class="row__meta" :class="{ 'row__meta--keys': r.item.kind === 'command' }">{{ r.item.meta }}</span>
                <span v-if="r.item.dot && r.item.kind !== 'issue'" class="row__dot"><i class="dot dot--warn" /></span>
                <button
                  v-if="r.item.kind === 'recent' && !r.item.id.startsWith('ex:')"
                  type="button"
                  class="row__x"
                  aria-label="Убрать из недавних"
                  @mousedown.prevent
                  @click.stop="removeRecent(r.item.ref)"
                >
                  <Icon name="x" :size="12" />
                </button>
                <kbd class="row__enter" :class="{ 'is-on': r.idx === active }">↵</kbd>
              </div>
            </template>

            <div v-if="noResults" class="pal__none">
              <p class="pal__none-t">Ничего не нашлось по «{{ queryShown }}»</p>
              <ul>
                <li v-if="scope !== 'all'">
                  Уберите фильтр:
                  <button type="button" class="pal__link" @mousedown.prevent @click="setScope('all')">искать во всех разделах</button>
                </li>
                <li v-if="curRun && !everywhere">
                  Поищите во всех разборах:
                  <button type="button" class="pal__link" @mousedown.prevent @click="everywhere = true">везде</button>
                </li>
                <li v-if="ragCtx && !everywhere">Попробуйте метрику, датасет, конфигурацию или код статьи, например «Answer F1», «HotpotQA», «BM25», «D003»</li>
                <li v-else>Попробуйте код статьи, показатель или число, например «D001», «Voc», «18,6»</li>
              </ul>
            </div>
          </div>

          <aside class="pal__pv" aria-label="Предпросмотр">
            <div v-if="pv && sel" :key="sel.id" class="pv">
              <p class="pv__kind">{{ pv.kind }}</p>
              <h3 class="pv__title"><Hl :text="pv.title" :words="words" /></h3>
              <p v-if="pv.big" class="pv__big">{{ pv.big }}</p>
              <p v-if="pv.bigNote" class="pv__note">{{ pv.bigNote }}</p>
              <p v-for="(l, i) in pv.lines" :key="i" class="pv__line">{{ l }}</p>
              <p v-if="pv.warn" class="pv__level"><i class="dot dot--warn" /> {{ pv.warn }}</p>
              <p v-if="pv.desc" class="pv__desc">{{ pv.desc }}</p>
              <p v-if="pv.keys" class="pv__keys"><kbd v-for="(k, i) in pv.keys" :key="i">{{ k }}</kbd></p>
              <template v-if="pv.body">
                <p v-if="pv.bodyLabel" class="pv__label">{{ pv.bodyLabel }}</p>
                <p class="pv__body" :class="{ 'pv__body--quote': sel.kind === 'value' }"><Hl :text="pv.body" :words="words" /></p>
              </template>
            </div>
            <div v-else key="none" class="pv pv--empty">Выберите результат, чтобы увидеть детали</div>
          </aside>
        </div>

        <footer class="pal__foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>
          <span v-if="sel"><kbd>↵</kbd> открыть</span>
          <span><kbd>Tab</kbd> раздел</span>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pal.modal {
  width: min(760px, calc(100vw - 32px)); height: min(640px, 70vh); max-height: 70vh;
  display: flex; flex-direction: column; padding: 0; overflow: hidden;
}
.pal__search { display: flex; align-items: center; gap: var(--s3); padding: var(--s4) var(--s5); flex: none; }
.pal__lead { color: var(--muted); flex: none; }
.pal__chip {
  flex: none; height: var(--chip-h-sm); padding: 0 var(--s3); display: inline-flex; align-items: center;
  border-radius: var(--r-sm); font-size: var(--fs-sm); font-weight: 500; background: var(--blue-soft); color: var(--lk);
}
.pal__input {
  flex: 1; min-width: 0; border: 0; outline: 0; background: none; padding: 0;
  font-size: var(--fs-h2); color: var(--ink);
}
.pal__input::placeholder { color: var(--faint); }
.pal__esc { flex: none; }
.pal__bar {
  display: flex; align-items: center; gap: var(--s2); padding: 0 var(--s4) var(--s3); flex: none;
  border-bottom: 1px solid var(--line); min-width: 0;
}
.pal__tabs { flex: 0 1 auto; min-width: 0; }
.pal__where { margin-left: auto; }
.pal__body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
.pal__body--none { grid-template-columns: minmax(0, 1fr); }
.pal__body--none .pal__pv { display: none; }
.pal__list { overflow-y: auto; min-height: 0; padding: var(--s1) var(--s2) var(--s3); overscroll-behavior: contain; }
.pal__pv { border-left: 1px solid var(--line); min-height: 0; overflow-y: auto; padding: var(--s4) var(--s5); }

.pal__group { padding: var(--s3) var(--s3) var(--s1); font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.02em; color: var(--muted); }
.pal__fix { padding: var(--s2) var(--s3) 0; font-size: var(--fs-sm); color: var(--muted); }
.pal__fix button { color: var(--lk); font-weight: 500; }
.pal__fix button:hover { text-decoration: underline; }

.pal__ops {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s4); padding: var(--s4) var(--s3) var(--s2);
  font-size: var(--fs-xs); color: var(--muted);
}
.pal__ops span { display: inline-flex; align-items: center; gap: var(--s2); }
.pal__ops-t { color: var(--faint); }
.row {
  display: flex; align-items: center; gap: var(--s3); min-height: var(--row-h); padding: 0 var(--s3);
  border-radius: var(--r-sm); color: var(--ink); cursor: pointer; font-size: var(--fs-body);
  transition: background-color var(--t-fast) ease;
}
.row.is-sel { background: var(--bg-2); }
.row__ico { flex: none; color: var(--muted); }
.row.is-sel .row__ico { color: var(--ink); }
.row__title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__val { flex: none; font-weight: 500; font-variant-numeric: tabular-nums; }
.row__meta {
  flex: 0 1 auto; max-width: 42%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--fs-xs); color: var(--muted);
}
.row__meta--keys { letter-spacing: 0.01em; }
.row--2 { flex-wrap: wrap; row-gap: 2px; padding-block: var(--s2); }
.row--2 .row__title { flex: 1 1 0; }
.row--2 .row__meta { order: 1; flex: 0 0 calc(100% - 28px); max-width: none; margin-left: 28px; font-size: var(--fs-xs); }
.row__dot { flex: none; display: inline-flex; align-items: center; }
.row__x {
  flex: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--r-xs); color: var(--faint);
}
.row__x:hover { background: var(--bg-3); color: var(--ink); }
.row__enter { flex: none; visibility: hidden; }
.row__enter.is-on { visibility: visible; }
.row--more { color: var(--muted); }

.pal :deep(mark) { background: var(--blue-soft); color: inherit; padding: 0; border-radius: var(--r-xs); box-shadow: 0 0 0 1px var(--blue-soft); }
.pal__none { padding: var(--s6) var(--s3) var(--s3); display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); }
.pal__none-t { font-size: var(--fs-body); font-weight: 500; }
.pal__none ul { display: grid; gap: var(--s2); padding-left: var(--s4); list-style: disc; font-size: var(--fs-sm); color: var(--muted); }
.pal__link { color: var(--lk); }
.pal__link:hover { text-decoration: underline; }
.pv { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; animation: rise var(--t-enter) var(--ease) both; }
.pv--empty { font-size: var(--fs-sm); color: var(--faint); padding-top: var(--s1); }
.pv__kind { font-size: var(--fs-xs); color: var(--muted); }
.pv__level { display: inline-flex; align-items: center; gap: var(--s2); font-size: var(--fs-xs); font-weight: 500; color: var(--amber); }
.pv__title { font-size: var(--fs-h2); font-weight: 500; line-height: 1.35; overflow-wrap: anywhere; }
.pv__big { font-size: var(--fs-num); font-weight: 300; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; margin-top: var(--s1); }
.pv__note { font-size: var(--fs-sm); color: var(--muted); }
.pv__line { font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
.pv__desc { font-size: var(--fs-body); color: var(--ink-2); line-height: 1.5; }
.pv__keys { display: flex; gap: var(--s1); margin-top: var(--s1); }
.pv__label { margin-top: var(--s3); font-size: var(--fs-xs); font-weight: 500; color: var(--muted); }
.pv__body { font-size: var(--fs-sm); line-height: 1.55; color: var(--ink-2); overflow-wrap: anywhere; }
.pv__body--quote { padding-left: var(--s3); border-left: 2px solid var(--line-2); color: var(--muted); }
.pal__foot {
  flex: none; display: flex; flex-wrap: wrap; gap: var(--s1) var(--s4); padding: var(--s2) var(--s5);
  border-top: 1px solid var(--line); font-size: var(--fs-xs); color: var(--muted);
}
.pal__foot span { display: inline-flex; align-items: center; gap: var(--s1); }
.pal__foot kbd { height: 20px; min-width: 20px; }

@media (max-width: 720px) {
  .pal__body { grid-template-columns: minmax(0, 1fr); }
  .pal__pv { display: none; }
  .pal__foot span:nth-child(n + 3):not(:last-child) { display: none; }
}
.pal__cancel { display: none; }
@media (max-width: 768px) {
  .pal.modal {
    position: fixed; inset: 0; width: 100%; height: 100dvh; max-height: 100dvh; min-height: 0;
    padding: var(--safe-t) 0 0; border-radius: 0; box-shadow: none; background: var(--card);
  }
  .pal__search { gap: var(--s2); padding: var(--s2) var(--s2) var(--s2) var(--s4); }
  .pal__input { height: 48px; font-size: max(16px, var(--fs-body)); }
  .pal__esc { display: none; }
  .pal__cancel {
    display: inline-flex; align-items: center; flex: none; height: 44px; padding: 0 var(--s2) 0 var(--s1);
    font-size: var(--fs-body); font-weight: 500; color: var(--lk);
  }
  .pal__bar { flex-wrap: wrap; padding: 0 var(--s4) var(--s3); }
  .pal__tabs { flex: 1 1 100%; -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent); mask-image: linear-gradient(90deg, #000 88%, transparent); }
  .pal__where { margin-left: 0; display: flex; width: 100%; }
  .pal__where > button { flex: 1 1 0; justify-content: center; }

  .pal__body { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
  .pal__list { padding: var(--s1) var(--s2) calc(var(--s4) + var(--safe-b)); }
  .pal__pv, .pal__foot { display: none; }
  .row { flex-wrap: wrap; column-gap: var(--s3); row-gap: 2px; min-height: 52px; padding: var(--s2) var(--s3); }
  .row__title { flex: 1 1 0; }
  .row__meta { order: 1; flex: 0 0 calc(100% - 28px); max-width: none; margin-left: 28px; font-size: var(--fs-sm); }
  .row__x { width: 44px; height: 44px; margin: -10px calc(-1 * var(--s2)) -10px 0; }
  .row__enter { display: none; }
  .pal__none { padding: var(--s6) var(--s2) var(--s3); }
}
</style>
