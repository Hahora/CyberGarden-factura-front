import { reactive, watch } from 'vue'
import {
  AGG_RU, CLASS_RU, COLLECTIONS, RECORD_SOURCE, SCAN_RU, SEEDS, TYPE_RU, buildFacts, finishFact, fmt, fmtFull, normConditions, paramOf, parseConditions, parseRaw, recordFor, rowLabel, rowTitle,
  type CollectionId, type Fact, type PaperSeed, type Param, type Row,
} from './data'
import { figureFacts } from './figures'

export interface Paper extends PaperSeed {
  addedAt: number
  processing: number
  mine: boolean
  seed?: string
  file?: string
  dupOf?: string
  topicBy?: TopicBy
}

export interface Cite {
  n: number
  factId: string
  paperId: string
  title: string
  where: string
  quote: string
  issueId?: string
}
export type Card =
  | { kind: 'compare'; collection: CollectionId; ids: string[]; rows?: string[]; metric?: string }
  | { kind: 'checks'; collection: CollectionId; papers?: string[]; skip?: string[] }
  | { kind: 'coverage'; paperId: string }
  | { kind: 'structure'; paperId: string }
  | { kind: 'graph'; collection: CollectionId; root?: string; focus?: string; title: string }

export interface Answer {
  card?: Card
  intro: string
  items: { text: string; cite: number; head?: string }[]
  outro: string
  cites: Cite[]
  explore: string
}
export interface Turn {
  id: number
  q: string
  steps: string[]
  step: number
  done: boolean
  shown: number
  answer: Answer | null
}

export interface Chat {
  id: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
  kind: 'paper' | 'ask'
  pinned?: boolean
  paperId?: string
  collection: CollectionId
  turns: Turn[]
}

export interface Project {
  id: string
  name: string
  collection: CollectionId
  pinned: boolean
  createdAt: number
  open: boolean
  note: string
}

export interface Issue {
  id: string
  paperId: string
  level: 'doubt' | 'conflict' | 'warn'
  plugin: string
  title: string
  text: string
  anchors: string[]
  factIds: string[]
}

export interface Profile {
  name: string
  role: string
  team: string
  email: string
  pendingEmail?: string
  color: string
  focus: string
}

export interface Appearance {
  mode: 'system' | 'light' | 'dark'
  accent: string
  font: number
  motion: 'system' | 'on' | 'off'
  contrast: number
  density: 'compact' | 'comfortable'
}

export const ACCENTS: Record<string, { name: string; c: [string, string, string, string]; dark?: string }> = {
  sapphire: { name: 'Сапфир', c: ['#2f6bff', '#1f4fd6', '#dbe5ff', '#eef3ff'] },
  violet: { name: 'Аметист', c: ['#8b5cf6', '#6d28d9', '#ede9fe', '#f5f3ff'] },
  emerald: { name: 'Изумруд', c: ['#10b981', '#047857', '#d1fae5', '#ecfdf5'] },
  amber: { name: 'Янтарь', c: ['#f59e0b', '#b45309', '#fef3c7', '#fffbeb'] },
  rose: { name: 'Рубин', c: ['#f43f5e', '#be123c', '#ffe4e6', '#fff1f2'] },
  graphite: { name: 'Графит', c: ['#52525b', '#18181b', '#e4e4e7', '#f4f4f5'], dark: '#a1a1aa' },
}

export interface LogEntry {
  id: number
  at: number
  who: string
  action: 'accept' | 'reject' | 'restore' | 'edit' | 'add' | 'acceptAll'
  paperId: string
  factId?: string
  from?: string
  to?: string
  count?: number
}

export interface SavedView {
  id: string
  name: string
  collection: CollectionId
  query: string
}

export interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

const KEY = 'gs:v1:'
function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(KEY + k)
    return v == null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
function save(k: string, v: unknown) {
  try {
    localStorage.setItem(KEY + k, JSON.stringify(v))
  } catch {
  }
}

const DAY = 864e5
const now = Date.now()
const papers: Paper[] = SEEDS.map((s) => ({ ...s, addedAt: now - s.addedDays * DAY - 3600e3, processing: 100, mine: false, seed: s.id }))

const seedProjects: Project[] = [
  { id: 'pr-perov', name: 'Перовскиты', collection: 'solar', pinned: true, createdAt: now - 20 * DAY, open: true, note: 'Свинцовые и бессвинцовые перовскиты, стабильность' },
  { id: 'pr-rag', name: 'Обзор RAG', collection: 'rag', pinned: false, createdAt: now - 15 * DAY, open: false, note: 'Ретриверы, чанки и переранжирование' },
]
const inProject: Record<string, string> = { mapbi: 'pr-perov', stab: 'pr-perov', leadfree: 'pr-perov', hybrid: 'pr-rag', chunks: 'pr-rag', rerank: 'pr-rag' }

const seedChats: Chat[] = papers.map((p) => ({
  id: 'c-' + p.id,
  projectId: inProject[p.id] ?? null,
  title: p.title,
  createdAt: p.addedAt,
  updatedAt: p.addedAt,
  kind: 'paper',
  paperId: p.id,
  collection: p.collection,
  turns: [],
}))

export const state = reactive({
  projects: load<Project[]>('projects', seedProjects),
  chats: seedChats as Chat[],
  papers,
  facts: papers.flatMap((p) => [...buildFacts(p), ...figureFacts(p)]),
  collection: load<CollectionId>('collection', 'solar'),
  sidebar: load<boolean>('sidebar', true),
  plugins: {
    jv_consistency: true, voc_limit: true, range: true, eqe_consistency: true, champion_vs_mean: true, hysteresis_index: true,
    contradiction: true, missing_conditions: true, comparability: true, metric_scale: true, metric_at_k: true, metric_definition: true, units: true,
  } as Record<string, boolean>,
  hot: [] as string[],
  palette: false,
  keysModal: false,
  projectModal: null as string | null,
  dragging: false,
  mobile: false,
  drawer: false,
  paperInfo: false,
  profile: (() => {
    const p = load<Profile>('profile', { name: 'Исследователь', role: '', team: '', email: 'team@faktura.ai', color: 'graphite', focus: 'Перовскитные и тонкоплёночные солнечные элементы' })
    if (p.role === 'Материаловед' || p.role === 'Исследователь') p.role = ''
    if (p.team === 'Команда хакатона') p.team = ''
    return p
  })(),
  appearance: load<Appearance>('appearance', { mode: 'system', accent: 'sapphire', font: 14, motion: 'system', contrast: 50, density: 'comfortable' }),
  toasts: [] as Toast[],
  log: [] as LogEntry[],
  resolved: load<Record<string, Resolution>>('resolved', {}),
  views: load<SavedView[]>('views', []),
  queueOpen: true,
})
watch(() => state.views, (v) => save('views', v), { deep: true })
watch(() => state.resolved, (v) => save('resolved', v), { deep: true })

watch(() => state.projects, (v) => save('projects', v), { deep: true })
watch(() => state.collection, (v) => save('collection', v))
watch(() => state.sidebar, (v) => save('sidebar', v))
watch(() => state.appearance, (v) => save('appearance', v), { deep: true })
watch(() => state.profile, (v) => save('profile', v), { deep: true })

interface Work {
  papers: Paper[]
  chats: Chat[]
  facts: Record<string, { s: Fact['status']; e: number | null }>
  added: Fact[]
  log: LogEntry[]
}
function restoreWork() {
  const w = load<Work | null>('work', null)
  if (!w) return
  for (const p of w.papers ?? []) {
    if (state.papers.some((x) => x.id === p.id)) continue
    const paper: Paper = { ...p, processing: 100 }
    state.papers.unshift(paper)
    state.facts.push(...buildFacts(paper), ...figureFacts(paper))
  }
  for (const f of w.added ?? []) if (!state.facts.some((x) => x.id === f.id)) state.facts.push(finishFact(f, paramOf(paperOf(f.paperId)?.collection ?? 'solar', f.param)))
  for (const f of state.facts) {
    const o = w.facts?.[f.id]
    if (o) {
      f.status = o.s
      f.edited = o.e
      f.normalized_value = f.edited != null ? f.edited : f.base
    }
  }
  if (Array.isArray(w.chats) && w.chats.length) {
    let n = 0
    for (const c of w.chats) c.turns = (c.turns ?? []).filter((t) => t.done && t.answer).map((t) => ({ ...t, id: --n, shown: t.answer!.items.length }))
    state.chats.splice(0, state.chats.length, ...w.chats.filter((c) => c.kind !== 'paper' || state.papers.some((p) => p.id === c.paperId)))
  }
  if (Array.isArray(w.log)) state.log.push(...w.log)
}
restoreWork()

let saveTimer = 0
function saveWork() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const facts: Work['facts'] = {}
    for (const f of state.facts) if (f.status !== 'new' || f.edited != null) facts[f.id] = { s: f.status, e: f.edited }
    save('work', {
      papers: state.papers.filter((p) => p.mine),
      chats: state.chats,
      facts,
      added: state.facts.filter((f) => f.by === 'manual'),
      log: state.log.slice(0, 200),
    } satisfies Work)
  }, 400)
}
watch(() => [state.chats, state.facts, state.papers.length, state.log.length], saveWork, { deep: true })

export const nav = { go: (_path: string) => {} }

export const paperOf = (id?: string | null) => state.papers.find((p) => p.id === id)
export const chatOf = (id?: string | null) => state.chats.find((c) => c.id === id)
export const projectOf = (id?: string | null) => state.projects.find((p) => p.id === id)
export const factOf = (id?: string | null) => state.facts.find((f) => f.id === id)
export const factsOf = (paperId: string) => state.facts.filter((f) => f.paperId === paperId)
export const chatsOf = (projectId: string | null) =>
  state.chats.filter((c) => c.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt)
export const chatOfPaper = (paperId: string) => state.chats.find((c) => c.paperId === paperId)

export function collectionOf(chat?: Chat | null): CollectionId {
  if (!chat) return state.collection
  return projectOf(chat.projectId)?.collection ?? paperOf(chat.paperId)?.collection ?? chat.collection
}

export const valueOf = (f: Fact): number | null => (f.edited != null ? f.edited : f.base)

export function display(f: Fact): string {
  const p = paperOf(f.paperId)
  if (!p) return f.raw
  const param = paramOf(p.collection, f.param)
  if (param.text) return param.key === 'conditions' && state.plugins.units ? normConditions(f.raw) : f.raw
  if (f.edited != null) return fmtFull(f.edited, param)
  return state.plugins.units && f.base != null ? fmtFull(f.base, param) : f.raw
}

export const labelOf = (f: Fact) => {
  const p = paperOf(f.paperId)
  return p ? paramOf(p.collection, f.param).label : f.param
}

export type Resolution = 'fixed' | 'ok'
export const isResolved = (issueId: string) => !!state.resolved[issueId]
export const openIssues = (p: Paper) => issuesFor(p).filter((i) => !state.resolved[i.id])
const touchedBy = new Map<string, string[]>()
export function resolveIssues(ids: string[], how: Resolution, opts: { accept?: string; mergePrev?: number } = {}) {
  const open = ids.filter((id) => !state.resolved[id])
  if (!open.length) return
  const merged = opts.mergePrev ? history.splice(-opts.mergePrev) : []
  let acceptedFact: Fact | undefined
  const entry = group('разбор замечания', () => {
    const f = opts.accept ? factOf(opts.accept) : undefined
    if (how === 'fixed' && f && f.status === 'new') {
      accept(f.id)
      acceptedFact = f
    }
    for (const id of open) {
      const prev = state.resolved[id]
      state.resolved[id] = how
      remember('разбор замечания', () => {
        if (prev) state.resolved[id] = prev
        else delete state.resolved[id]
      })
    }
  }, merged)
  const touched = [...(acceptedFact ? [acceptedFact.id] : []), ...(opts.mergePrev && opts.accept ? [opts.accept] : [])]
  if (touched.length) for (const id of open) touchedBy.set(id, touched)
  const n = open.length
  const text =
    how === 'ok' ? 'Отмечено: не ошибка' : (n > 1 ? `Замечаний решено: ${n}` : 'Замечание решено') + (acceptedFact ? ` · ${labelOf(acceptedFact)} принят` : opts.mergePrev ? ' · значение исправлено' : '')
  toast(text, { label: 'Отменить', run: () => undoEntry(entry) })
}
export const resolveIssue = (issueId: string, how: Resolution) => resolveIssues([issueId], how)
export function reopenIssue(issueId: string, quiet = false) {
  if (!state.resolved[issueId]) return
  const facts = (touchedBy.get(issueId) ?? []).map((id) => factOf(id)).filter((f): f is Fact => !!f && f.status === 'accepted')
  touchedBy.delete(issueId)
  const entry = group('возврат замечания', () => {
    const prev = state.resolved[issueId]
    delete state.resolved[issueId]
    remember('возврат замечания', () => {
      if (prev) state.resolved[issueId] = prev
    })
    for (const f of facts) restore(f.id)
  })
  if (!quiet) toast(facts.length ? `Замечание снова открыто · ${labelOf(facts[0]!)} не принят` : 'Замечание снова открыто', { label: 'Отменить', run: () => undoEntry(entry) })
}

export function topLevel(p: Paper): 'conflict' | 'doubt' | null {
  const list = openIssues(p)
  return list.length ? (list.some((i) => i.level === 'conflict') ? 'conflict' : 'doubt') : null
}
export const levelDot = (level: Issue['level'] | null | undefined) => (level === 'conflict' ? 'dot--conflict' : 'dot--doubt')

const nb = (t: string) => t.replace(/(\d) (%|В(?![а-яё])|мВ(?![а-яё])|мВт|мА|эВ|нм(?![а-яё])|мкм(?![а-яё])|мм(?![а-яё])|°C|Вт|мс(?![а-яё])|ч(?![а-яё])|Ом|п\.п\.)/g, '$1 $2')
const rus = (n: number, d = 1) => String(Math.round(n * 10 ** d) / 10 ** d).replace('.', ',')

export const rowOf = (p: Paper, id: string): Row | undefined => p.rows.find((r) => r.id === id)

export function pinOf(p: Paper, rowId: string): { value: number; spectrum: string | null; assumed: boolean } {
  const row = rowOf(p, rowId)
  const f = factsOf(p.id).find((x) => x.param === 'conditions' && x.status !== 'rejected' && (x.row === rowId || x.row === '*'))
  const cn = f ? parseConditions(f.raw) : { spectrum: null, power: null, temp: null }
  const power = row?.light_intensity ?? cn.power
  return { value: power ?? 100, spectrum: row?.spectrum ?? cn.spectrum, assumed: power == null }
}

const sameKind = (a: Row, b: Row) =>
  (!a.aggregation || !b.aggregation || a.aggregation === b.aggregation) && (!a.scan_direction || !b.scan_direction || a.scan_direction === b.scan_direction)

const apart = (a: number, b: number) => Math.abs(a - b) > Math.max(Math.abs(b) * 0.01, 1e-9)

export function issuesFor(p: Paper): Issue[] {
  if (p.processing < 100) return []
  const out: Issue[] = []
  const facts = factsOf(p.id)
  const live = facts.filter((f) => f.status !== 'rejected')
  const get = (row: string, key: string) => live.find((f) => f.row === row && f.param === key)
  const val = (row: string, key: string) => {
    const f = get(row, key)
    return f ? valueOf(f) : null
  }
  const P = (key: string) => paramOf(p.collection, key)
  const on = (k: string) => state.plugins[k] !== false

  if (p.collection === 'solar') {
    if (on('jv_consistency')) {
      for (const r of p.rows) {
        const [voc, jsc, ff, pce] = ['voc', 'jsc', 'ff', 'pce'].map((k) => val(r.id, k))
        if (voc == null || jsc == null || ff == null || pce == null || pce === 0) continue
        const pin = pinOf(p, r.id)
        const calc = ((voc * jsc * (ff / 100)) / pin.value) * 100
        const diff = (Math.abs(calc - pce) / pce) * 100
        if (diff > 3) {
          const ids = ['voc', 'jsc', 'ff', 'pce'].map((k) => get(r.id, k)!.id)
          out.push({
            id: `${p.id}:phys:${r.id}`,
            paperId: p.id,
            level: 'doubt',
            plugin: 'jv_consistency',
            title: `КПД ${rowTitle(p, r.id, 'gen')} не сходится с Voc × Jsc × FF / Pin`,
            text: nb(`Расчёт ${fmt(calc, P('pce'))}, в статье ${fmt(pce, P('pce'))}: расхождение ${rus(diff)} % при пороге 3 %. Pin = ${rus(pin.value, 0)} мВт/см²${pin.assumed ? ' (в статье не указан, принят стандартный)' : ''}. Проверьте мощность освещения, площадь и опечатки.`),
            anchors: ids,
            factIds: ids,
          })
        }
      }
    }

    if (on('voc_limit')) {
      for (const voc of live.filter((f) => f.param === 'voc' && f.row !== '*' && f.source.kind !== 'figure')) {
        const eg = get(voc.row, 'bandgap') ?? get('*', 'bandgap')
        const v = valueOf(voc)
        const e = eg ? valueOf(eg) : null
        if (!eg || v == null || e == null || e <= 0 || v < e) continue
        out.push({
          id: `${p.id}:voclim:${voc.id}`,
          paperId: p.id,
          level: 'conflict',
          plugin: 'voc_limit',
          title: `Voc ${rowTitle(p, voc.row, 'gen')} не меньше ширины зоны`,
          text: nb(`Voc = ${fmt(v, P('voc'))}, а Eg = ${fmt(e, P('bandgap'))}: напряжение холостого хода не может быть больше Eg/q. Проверьте оба значения.`),
          anchors: [voc.id, eg.id],
          factIds: [voc.id, eg.id],
        })
      }
    }

    if (on('eqe_consistency')) {
      for (const eqe of live.filter((f) => f.param === 'jsc_eqe' && f.row !== '*')) {
        const jv = get(eqe.row, 'jsc')
        const a = valueOf(eqe)
        const b = jv ? valueOf(jv) : null
        if (!jv || a == null || b == null || b === 0) continue
        const diff = (Math.abs(a - b) / b) * 100
        if (diff > 5) {
          out.push({
            id: `${p.id}:eqe:${eqe.row}`,
            paperId: p.id,
            level: 'doubt',
            plugin: 'eqe_consistency',
            title: `Jsc по EQE и по ВАХ расходятся (${rowTitle(p, eqe.row, 'nom')})`,
            text: nb(`По EQE ${fmt(a, P('jsc_eqe'))}, по ВАХ ${fmt(b, P('jsc'))}: расхождение ${rus(diff)} % при пороге 5 %. Возможна другая площадь, спектр или смещение при измерении EQE.`),
            anchors: [eqe.id, jv.id],
            factIds: [eqe.id, jv.id],
          })
        }
      }
    }

    if (on('champion_vs_mean')) {
      for (const m of p.rows.filter((r) => r.aggregation === 'mean' && r.batch)) {
        const c = rowOf(p, m.batch!)
        const cf = c ? get(c.id, 'pce') : undefined
        const mf = get(m.id, 'pce')
        const cv = cf ? valueOf(cf) : null
        const mv = mf ? valueOf(mf) : null
        if (!c || !cf || !mf || cv == null || mv == null) continue
        const spread = m.spread_value ?? c.spread_value
        const below = cv < mv
        const far = spread != null && cv - mv > 3 * spread
        if (!below && !far) continue
        out.push({
          id: `${p.id}:cvm:${m.id}`,
          paperId: p.id,
          level: 'doubt',
          plugin: 'champion_vs_mean',
          title: `Лучший прибор и среднее не согласуются (${rowTitle(p, c.id, 'nom')})`,
          text: nb(below
            ? `КПД лучшего прибора ${fmt(cv, P('pce'))} меньше среднего по партии ${fmt(mv, P('pce'))}: так не бывает. Возможно, значения перепутаны.`
            : `КПД лучшего прибора ${fmt(cv, P('pce'))} выше среднего ${fmt(mv, P('pce'))} больше чем на 3 разброса (±${rus(spread!)}${m.n_devices ? `, ${m.n_devices} приборов` : ''}). Проверьте, что это одна партия.`),
          anchors: [cf.id, mf.id],
          factIds: [cf.id, mf.id],
        })
      }
    }

    if (on('hysteresis_index')) {
      for (const f of p.rows.filter((r) => r.scan_direction === 'forward' && r.batch)) {
        const rev = rowOf(p, f.batch!)
        const rf = rev ? get(rev.id, 'pce') : undefined
        const ff = get(f.id, 'pce')
        const rv = rf ? valueOf(rf) : null
        const fv = ff ? valueOf(ff) : null
        if (!rev || !rf || !ff || rv == null || fv == null || rv === 0) continue
        const hi = ((rv - fv) / rv) * 100
        const reported = get(rev.id, 'hi')
        const rep = reported ? valueOf(reported) : null
        const ids = [rf.id, ff.id, ...(reported ? [reported.id] : [])]
        out.push({
          id: `${p.id}:hys:${f.id}`,
          paperId: p.id,
          level: 'warn',
          plugin: 'hysteresis_index',
          title: `Гистерезис ${rowTitle(p, rev.id, 'gen')}: обратная и прямая развёртки`,
          text: nb(`Обратный ход ${fmt(rv, P('pce'))}, прямой ${fmt(fv, P('pce'))}: HI = ${rus(hi)} %${rep != null ? `, в статье ${fmt(rep, P('hi'))}` : ''}. Это справка, не ошибка: развёртки хранятся отдельными строками.`),
          anchors: ids,
          factIds: ids,
        })
      }
    }

    if (on('range')) {
      const rec = recordFor(p)
      for (const f of live) {
        const v = valueOf(f)
        if (v == null) continue
        const where = f.row === '*' ? '' : ` (${rowTitle(p, f.row, 'nom')})`
        const add = (level: Issue['level'], title: string, text: string, extra: Fact[] = []) =>
          out.push({ id: `${p.id}:range:${f.id}`, paperId: p.id, level, plugin: 'range', title, text: nb(text), anchors: [f.id, ...extra.map((x) => x.id)], factIds: [f.id, ...extra.map((x) => x.id)] })
        if (f.param === 'ff' && (v > 100 || v <= 0)) add('conflict', `FF вне диапазона${where}`, `FF = ${fmt(v, P('ff'))}: фактор заполнения лежит в пределах 0…100 %.`)
        else if (f.param === 'pce' && rec && v > rec.value) add('conflict', `КПД выше рекорда для класса${where}`, `${fmt(v, P('pce'))} выше подтверждённого рекорда для «${rec.name}» — ${fmt(rec.value, P('pce'))} (${RECORD_SOURCE}). Скорее всего, ошибка извлечения или нестандартное измерение.`)
        else if (f.param === 'jsc' && v > 45) add('conflict', `Jsc вне диапазона${where}`, `Jsc = ${fmt(v, P('jsc'))}: выше предела Шокли — Квайссера для любых полупроводников.`)
        else if (f.param === 'rs') {
          const rsh = get(f.row, 'rsh')
          const w = rsh ? valueOf(rsh) : null
          if (rsh && w != null && w < v) add('doubt', `Rsh меньше Rs${where}`, `Rs = ${fmt(v, P('rs'))}, Rsh = ${fmt(w, P('rsh'))}: шунтирующее сопротивление должно быть намного больше последовательного. Проверьте значения.`, [rsh])
        }
      }
    }

    if (on('contradiction')) {
      for (const d of live.filter((f) => f.duplicate_of && f.source.kind !== 'figure')) {
        const main = factOf(d.duplicate_of)
        const a = valueOf(d)
        const b = main ? valueOf(main) : null
        if (!main || main.status === 'rejected' || a == null || b == null || !apart(a, b)) continue
        const param = P(d.param)
        out.push({
          id: `${p.id}:dup:${d.id}`,
          paperId: p.id,
          level: 'conflict',
          plugin: 'contradiction',
          title: `${param.label}: повтор расходится с основным значением (${rowTitle(p, d.row, 'nom')})`,
          text: nb(`В ${main.source.ref.toLowerCase()} ${fmt(b, param)}, в тексте ${fmt(a, param)}. Одно из значений — опечатка.`),
          anchors: [d.id, main.id],
          factIds: [d.id, main.id],
        })
      }
    }
  }

  if (on('contradiction')) {
    for (const c of p.claims) {
      const anchor = `${p.id}:claim:${c.id}`
      const mine = get(c.row, c.param)
      if (!mine) continue
      const param = P(c.param)
      if (c.kind === 'best') {
        const cr = rowOf(p, c.row)
        const pool = p.rows.filter((r) => !cr || sameKind(cr, r))
        let top = pool[0] ?? p.rows[0]!
        for (const r of pool) if ((val(r.id, c.param) ?? -Infinity) > (val(top.id, c.param) ?? -Infinity)) top = r
        if (top.id !== c.row) {
          const other = get(top.id, c.param)!
          out.push({
            id: `${p.id}:claim:${c.id}`,
            paperId: p.id,
            level: 'conflict',
            plugin: 'contradiction',
            title: 'Текст противоречит таблице',
            text: nb(`В тексте лучший — ${rowTitle(p, c.row, 'nom')}, но по таблице ${param.label} выше у ${rowTitle(p, top.id, 'gen')}: ${fmt(val(top.id, c.param), param)} против ${fmt(valueOf(mine), param)}.`),
            anchors: [anchor, other.id, mine.id],
            factIds: [mine.id, other.id],
          })
        }
      } else if (c.kind === 'equals' && c.value != null) {
        const v = valueOf(mine)
        if (v != null && Math.abs(v - c.value) > 10 ** -param.digits / 2) {
          out.push({
            id: `${p.id}:claim:${c.id}`,
            paperId: p.id,
            level: 'conflict',
            plugin: 'contradiction',
            title: 'Аннотация расходится с таблицей',
            text: nb(`В тексте ${param.label} = ${fmt(c.value, param)}, в таблице — ${fmt(v, param)}.`),
            anchors: [anchor, mine.id],
            factIds: [mine.id],
          })
        }
      }
    }
  }

  if (on('comparability') && p.collection === 'solar') {
    for (const c of p.claims.filter((x) => x.kind === 'best')) {
      const withVal = p.rows.filter((r) => val(r.id, c.param) != null)
      const kinds = [...new Set(withVal.map((r) => r.aggregation).filter(Boolean))]
      if (kinds.length < 2) continue
      const ids = withVal.map((r) => get(r.id, c.param)!.id)
      out.push({
        id: `${p.id}:cmp:${c.id}`,
        paperId: p.id,
        level: 'warn',
        plugin: 'comparability',
        title: 'В одной таблице лучший прибор и среднее',
        text: `Строки таблицы относятся к разной агрегации (${kinds.map((k) => AGG_RU[k!]).join(', ')}). «Лучший образец» определён только среди строк одного типа; сравнивайте champion с champion, среднее со средним.`,
        anchors: [`${p.id}:claim:${c.id}`, ...ids],
        factIds: ids,
      })
    }
  }

  if (on('missing_conditions') && p.collection === 'solar') {
    const cond = live.find((f) => f.param === 'conditions')
    if (!cond) {
      out.push({
        id: `${p.id}:cond`,
        paperId: p.id,
        level: 'warn',
        plugin: 'missing_conditions',
        title: 'Условия измерения не указаны',
        text: 'В разобранном фрагменте нет спектра, мощности освещения и температуры. Сравнивать КПД с другими статьями рискованно.',
        anchors: [],
        factIds: [],
      })
    } else {
      const cn = parseConditions(cond.raw)
      const miss = [!cn.spectrum && 'спектр', cn.power == null && 'мощность освещения'].filter(Boolean)
      if (miss.length) {
        out.push({
          id: `${p.id}:cond`,
          paperId: p.id,
          level: 'warn',
          plugin: 'missing_conditions',
          title: 'Условия измерения указаны не полностью',
          text: nb(`Не указано: ${miss.join(', ')}. Записано только «${cond.raw}». Для проверки КПД принято стандартное значение 100 мВт/см².`),
          anchors: [cond.id],
          factIds: [cond.id],
        })
      }
    }
  }

  if (p.collection === 'rag') {
    if (on('metric_scale')) {
      for (const f of live) {
        const pr = P(f.param)
        const v = valueOf(f)
        if (pr.text || pr.unit !== '' || !pr.metric_direction || v == null) continue
        if (v >= 0 && v <= 1) continue
        out.push({
          id: `${p.id}:scale:${f.id}`,
          paperId: p.id,
          level: 'conflict',
          plugin: 'metric_scale',
          title: `${pr.label} вне шкалы (строка ${rowLabel(p, f.row)})`,
          text: nb(`В статье «${f.raw}»: доли лежат в пределах 0…1, проценты — 0…100 %. ${f.raw_unit === 'fraction' && v > 1 && v <= 100 ? 'Похоже на проценты без знака %.' : 'Значение невозможно для такой метрики.'}`),
          anchors: [f.id],
          factIds: [f.id],
        })
      }
    }

    if (on('metric_at_k')) {
      const fam = COLLECTIONS.rag.params.filter((x) => x.metric_family === 'recall').sort((a, b) => (a.metric_k ?? 0) - (b.metric_k ?? 0))
      for (const r of p.rows) {
        const have = fam.map((x) => ({ x, f: get(r.id, x.key), v: val(r.id, x.key) })).filter((h): h is { x: Param; f: Fact; v: number } => !!h.f && h.v != null)
        for (let i = 1; i < have.length; i++) {
          const a = have[i - 1]!
          const b = have[i]!
          if (a.v - b.v <= 1e-9) continue
          const ids = [a.f.id, b.f.id]
          out.push({
            id: a.x.metric_k === 5 && b.x.metric_k === 10 ? `${p.id}:metric:${r.id}` : `${p.id}:metric:${r.id}:${a.x.metric_k}-${b.x.metric_k}`,
            paperId: p.id,
            level: 'conflict',
            plugin: 'metric_at_k',
            title: `${a.x.label} больше ${b.x.label} (строка ${r.label})`,
            text: nb(`${fmt(a.v, a.x)} > ${fmt(b.v, b.x)} — так не бывает: в топ-${b.x.metric_k} входят все документы из топ-${a.x.metric_k}. Вероятна опечатка в таблице.`),
            anchors: ids,
            factIds: ids,
          })
        }
      }
    }

    if (on('metric_definition') && live.some((f) => !!P(f.param).metric_direction) && !p.eval_protocol && !p.rows.some((r) => r.metric_variant)) {
      out.push({
        id: `${p.id}:def`,
        paperId: p.id,
        level: 'warn',
        plugin: 'metric_definition',
        title: 'Не указано, как считали метрики',
        text: 'В статье нет определения метрики (вариант Recall@k, число запросов) и протокола оценки. Такие значения нельзя сравнивать с другими статьями.',
        anchors: [],
        factIds: [],
      })
    }
  }
  return out
}

export interface Subject {
  paperId: string
  row: string
}

const lc = (s?: string) => (s ?? '').trim().toLowerCase()

export function solarProfile(s: Subject) {
  const p = paperOf(s.paperId)
  const row = p ? rowOf(p, s.row) : undefined
  const pin = p ? pinOf(p, s.row) : { value: 100, spectrum: null, assumed: true }
  return {
    materialClass: p?.material_class ?? null,
    deviceType: row?.device_type ?? 'cell',
    spectrum: pin.spectrum,
    power: pin.assumed ? null : pin.value,
    area: row?.active_area ?? null,
    aggregation: row?.aggregation ?? null,
    scan: row?.scan_direction ?? null,
  }
}

export function comparabilityReasons(a: Subject, b: Subject): string[] {
  const pa = paperOf(a.paperId)
  const pb = paperOf(b.paperId)
  if (!pa || !pb) return []
  if (pa.collection !== pb.collection) return ['разные коллекции: приборы и поиск сравнивать нельзя']
  const out: string[] = []
  if (pa.collection === 'rag') {
    const ra = rowOf(pa, a.row)
    const rb = rowOf(pb, b.row)
    const pairs: [string, string | undefined, string | undefined, string][] = [
      ['задача', pa.task, pb.task, 'разные задачи'],
      ['набор данных', pa.dataset, pb.dataset, 'разные наборы данных'],
      ['определение метрики', ra?.metric_variant, rb?.metric_variant, 'разное определение метрики'],
      ['протокол оценки', pa.eval_protocol, pb.eval_protocol, 'разный протокол оценки'],
    ]
    for (const [what, x, y, diff] of pairs) {
      if (!x || !y) out.push(`${what} указан${what === 'задача' ? 'а' : ''} не у обоих`)
      else if (lc(x) !== lc(y)) out.push(`${diff}: «${x}» и «${y}»`)
    }
    return out
  }
  const x = solarProfile(a)
  const y = solarProfile(b)
  if (!x.materialClass || !y.materialClass) out.push('класс материала указан не у обоих')
  else if (x.materialClass !== y.materialClass) out.push(`разные классы материала: ${CLASS_RU[x.materialClass]} и ${CLASS_RU[y.materialClass]}`)
  if (x.deviceType !== y.deviceType) out.push(`разные типы приборов: ${TYPE_RU[x.deviceType]} и ${TYPE_RU[y.deviceType]}`)
  const std = (c: typeof x) => c.spectrum === 'AM1.5G' && c.power === 100
  const label = (c: typeof x) => `${c.spectrum ?? 'спектр не указан'}, ${c.power != null ? rus(c.power, 0) + ' мВт/см²' : 'мощность не указана'}`
  if (!std(x) || !std(y)) out.push(`условия не стандартные (AM1.5G, 100 мВт/см²): ${[...new Set([x, y].filter((c) => !std(c)).map(label))].join('; ')}`)
  if (x.area != null && y.area != null) {
    const k = Math.max(x.area, y.area) / Math.min(x.area, y.area)
    if (k > 5) out.push(`площадь различается в ${rus(k, 0)} раз: ${rus(x.area, 3)} и ${rus(y.area, 3)} см²`)
  } else if (x.area != null || y.area != null) out.push('площадь указана не у обоих приборов')
  if (x.aggregation && y.aggregation) {
    if (x.aggregation !== y.aggregation) out.push(`разная агрегация: ${AGG_RU[x.aggregation]} и ${AGG_RU[y.aggregation]}`)
  } else if (x.aggregation || y.aggregation) out.push('агрегация указана не у обоих результатов')
  if (x.scan && y.scan) {
    if (x.scan !== y.scan) out.push(`разное направление развёртки: ${SCAN_RU[x.scan]} и ${SCAN_RU[y.scan]}`)
  } else if (x.scan || y.scan) out.push('направление развёртки указано не у обоих результатов')
  return out
}

export function comparability(list: Subject[]): { ok: boolean; reasons: string[] } {
  const reasons = new Set<string>()
  for (let i = 1; i < list.length; i++) for (const r of comparabilityReasons(list[0]!, list[i]!)) reasons.add(r)
  return { ok: reasons.size === 0, reasons: [...reasons] }
}

export function qualityOf(p: Paper) {
  const facts = factsOf(p.id)
  const numeric = facts.filter((f) => !paramOf(p.collection, f.param).text)
  return {
    total: facts.length,
    sourced: facts.length ? Math.round((facts.filter((f) => f.source.anchor).length / facts.length) * 100) : 0,
    normalized: numeric.length ? Math.round((numeric.filter((f) => f.base != null).length / numeric.length) * 100) : 0,
    accepted: facts.filter((f) => f.status === 'accepted').length,
    issues: openIssues(p).length,
    notExtractable: facts.filter((f) => f.extraction_status === 'present_not_extractable').length,
    cited: facts.filter((f) => f.result_origin === 'cited').length,
    duplicates: facts.filter((f) => !!f.duplicate_of).length,
  }
}

let toastId = 0
export function toast(text: string, action?: Toast['action']) {
  const id = ++toastId
  for (let i = state.toasts.length - 1; i >= 0; i--) if (state.toasts[i]!.text === text) state.toasts.splice(i, 1)
  state.toasts.push({ id, text, action })
  setTimeout(() => dismiss(id), action ? (state.mobile ? 4000 : 7000) : 3000)
  return id
}
export const dismiss = (id: number) => {
  const i = state.toasts.findIndex((t) => t.id === id)
  if (i >= 0) state.toasts.splice(i, 1)
}

interface Entry { label: string; undo: () => void; fact?: string }
const history = reactive<Entry[]>([])
export const canUndo = () => history.length > 0
let batch: Entry[] | null = null
export const undone = reactive({ fact: '', n: 0 })
function remember(label: string, undoFn: () => void, fact?: string) {
  const e: Entry = { label, undo: undoFn, fact }
  if (batch) batch.push(e)
  else {
    history.push(e)
    if (history.length > 50) history.shift()
  }
  return e
}
export function group(label: string, run: () => void, extra: Entry[] = []): Entry {
  const outer = batch
  const mine: Entry[] = [...extra]
  batch = mine
  try {
    run()
  } finally {
    batch = outer
  }
  return remember(label, () => [...mine].reverse().forEach((e) => e.undo()), mine.find((e) => e.fact)?.fact)
}
function runUndo(h: Entry) {
  h.undo()
  if (h.fact) {
    undone.fact = h.fact
    undone.n++
  }
  toast(`Отменено: ${h.label}`)
}
export function undo() {
  const h = history.pop()
  if (!h) return toast('Отменять нечего')
  runUndo(h)
}
export function undoEntry(e: Entry) {
  const i = history.lastIndexOf(e)
  if (i < 0) return toast('Уже отменено')
  history.splice(i, 1)
  runUndo(e)
}

let logSeq = 0
export function logAction(e: Omit<LogEntry, 'id' | 'at' | 'who'>) {
  state.log.unshift({ id: ++logSeq, at: Date.now(), who: state.profile.name, ...e })
  if (state.log.length > 300) state.log.pop()
}
const ACTION_OF: Record<string, LogEntry['action']> = { 'принятие': 'accept', 'отклонение': 'reject', 'сброс': 'restore', 'исправление': 'edit' }
function setFact(f: Fact, patch: Partial<Pick<Fact, 'status' | 'edited'>>, label: string) {
  const prev = { status: f.status, edited: f.edited, normalized_value: f.normalized_value }
  const before = display(f)
  Object.assign(f, patch)
  f.normalized_value = valueOf(f)
  logAction({ action: ACTION_OF[label] ?? 'edit', paperId: f.paperId, factId: f.id, from: before, to: display(f) })
  remember(label, () => Object.assign(f, prev), f.id)
}
export function accept(id: string) {
  const f = factOf(id)
  if (f) setFact(f, { status: 'accepted' }, 'принятие')
}
export function reject(id: string) {
  const f = factOf(id)
  if (f) setFact(f, { status: 'rejected' }, 'отклонение')
}
export function restore(id: string) {
  const f = factOf(id)
  if (f) setFact(f, { status: 'new', edited: null }, 'сброс')
}
export function edit(id: string, raw: string): boolean {
  const f = factOf(id)
  const p = f && paperOf(f.paperId)
  if (!f || !p) return false
  const param = paramOf(p.collection, f.param)
  let v = parseRaw(raw, param)
  if (v == null && param.unit) v = parseRaw(`${raw} ${param.unit}`, param)
  if (v == null) return false
  setFact(f, { edited: v, status: 'accepted' }, 'исправление')
  return true
}
export function acceptMany(ids: string[], what = 'надёжных') {
  const list = ids.map((id) => factOf(id)).filter((f): f is Fact => !!f && f.status === 'new')
  if (!list.length) return
  const entry = group('принятие ' + what, () => {
    const prev = list.map((f) => f.status)
    list.forEach((f) => (f.status = 'accepted'))
    remember('принятие', () => list.forEach((f, i) => (f.status = prev[i]!)), list[0]!.id)
  })
  logAction({ action: 'acceptAll', paperId: list[0]!.paperId, count: list.length })
  toast(`Принято ${what}: ${list.length}`, { label: 'Отменить', run: () => undoEntry(entry) })
}
export function acceptAll(paperId: string) {
  acceptMany(factsOf(paperId).filter((f) => f.status === 'new').map((f) => f.id), 'фактов')
}

export function addFact(paperId: string, row: string, param: string, raw: string, opts: { quote?: string; kind?: 'manual' | 'figure'; ref?: string; where?: string } = {}): Fact | null {
  const p = paperOf(paperId)
  if (!p) return null
  const pr = paramOf(p.collection, param)
  let base = parseRaw(raw, pr)
  if (base == null && !pr.text && pr.unit) base = parseRaw(`${raw} ${pr.unit}`, pr)
  if (base == null && !pr.text) return null
  const kind = opts.kind ?? 'manual'
  const id = `${paperId}:${kind === 'figure' ? 'f' : 'm'}:${row}:${param}:${Date.now().toString(36)}`
  const f: Fact = finishFact({
    id, paperId, row, param, raw, base, edited: null, status: kind === 'manual' ? 'accepted' : 'new',
    confidence: kind === 'manual' ? 1 : 0.7,
    source: { page: p.page, kind, ref: opts.ref ?? (kind === 'figure' ? 'рис.' : 'выделение'), where: opts.where ?? rowLabel(p, row), anchor: id },
    quote: opts.quote, by: kind === 'manual' ? 'manual' : 'auto',
  }, pr)
  state.facts.push(f)
  logAction({ action: 'add', paperId, factId: id, to: display(f) })
  remember('добавление', () => {
    const i = state.facts.indexOf(f)
    if (i >= 0) state.facts.splice(i, 1)
  })
  return f
}

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

export function newAskChat(projectId: string | null = null, collection?: CollectionId): Chat {
  const chat: Chat = {
    id: uid('c-'),
    projectId,
    title: 'Новый вопрос',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    kind: 'ask',
    collection: collection ?? projectOf(projectId)?.collection ?? state.collection,
    turns: [],
  }
  state.chats.unshift(chat)
  return chat
}

export function renameChat(id: string, title: string) {
  const c = chatOf(id)
  if (c && title.trim()) c.title = title.trim()
}
export function initials(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return (w.length > 1 ? w[0]![0]! + w[1]![0]! : w[0]!.slice(0, 2)).toUpperCase()
}

export function profileStats() {
  const done = state.papers.filter((p) => p.processing >= 100)
  return {
    papers: done.length,
    mine: state.papers.filter((p) => p.mine).length,
    facts: state.facts.length,
    accepted: state.facts.filter((f) => f.status === 'accepted').length,
    edited: state.facts.filter((f) => f.edited != null).length,
    rejected: state.facts.filter((f) => f.status === 'rejected').length,
    issues: done.reduce((n, p) => n + issuesFor(p).length, 0),
    projects: state.projects.length,
    questions: state.chats.reduce((n, c) => n + c.turns.length, 0),
  }
}

export function pinChat(id: string) {
  const c = chatOf(id)
  if (!c) return
  c.pinned = !c.pinned
  toast(c.pinned ? 'Чат закреплён' : 'Чат откреплён', { label: 'Отменить', run: () => (c.pinned = !c.pinned) })
}
export const pinnedChats = () => state.chats.filter((c) => c.pinned).sort((a, b) => b.updatedAt - a.updatedAt)

export function moveChat(id: string, projectId: string | null) {
  const c = chatOf(id)
  if (!c) return
  const prev = c.projectId
  c.projectId = projectId
  const name = projectId ? projectOf(projectId)?.name : 'Недавние'
  toast(`Перемещено в «${name}»`, { label: 'Отменить', run: () => (c.projectId = prev) })
}
export function deleteChat(id: string) {
  const i = state.chats.findIndex((c) => c.id === id)
  if (i < 0) return
  const [chat] = state.chats.splice(i, 1)
  const pi = chat!.paperId ? state.papers.findIndex((p) => p.id === chat!.paperId) : -1
  if (pi < 0) {
    toast(`Чат «${chat!.title}» удалён`, { label: 'Вернуть', run: () => state.chats.splice(i, 0, chat!) })
    return
  }
  const [paper] = state.papers.splice(pi, 1)
  const facts = state.facts.filter((f) => f.paperId === paper!.id)
  state.facts = state.facts.filter((f) => f.paperId !== paper!.id)
  toast(`Статья «${paper!.title}» удалена`, {
    label: 'Вернуть',
    run: () => {
      state.papers.splice(pi, 0, paper!)
      state.facts.push(...facts)
      state.chats.splice(i, 0, chat!)
    },
  })
}

export function createProject(name: string, collection: CollectionId, note = ''): Project {
  const p: Project = { id: uid('pr-'), name: name.trim() || 'Новый проект', collection, pinned: false, createdAt: Date.now(), open: true, note }
  state.projects.push(p)
  return p
}
export function renameProject(id: string, name: string) {
  const p = projectOf(id)
  if (p && name.trim()) p.name = name.trim()
}
export function togglePin(id: string) {
  const p = projectOf(id)
  if (!p) return
  p.pinned = !p.pinned
  toast(p.pinned ? `Проект «${p.name}» закреплён` : `Проект «${p.name}» откреплён`, { label: 'Отменить', run: () => (p.pinned = !p.pinned) })
}
export function deleteProject(id: string) {
  const i = state.projects.findIndex((p) => p.id === id)
  if (i < 0) return
  const [proj] = state.projects.splice(i, 1)
  const moved = state.chats.filter((c) => c.projectId === id)
  moved.forEach((c) => (c.projectId = null))
  toast(`Проект «${proj!.name}» удалён, чаты перенесены в «Недавние»`, {
    label: 'Вернуть',
    run: () => {
      state.projects.splice(i, 0, proj!)
      moved.forEach((c) => (c.projectId = id))
    },
  })
}
export const sortedProjects = () => [...state.projects].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt)

export const STAGES = ['Текст', 'Таблицы', 'Рисунки', 'Формулы', 'Нормализация', 'Проверка']

export type TopicBy = 'project' | 'text' | 'guess' | 'manual'
const TOPIC_WORDS: Record<CollectionId, RegExp> = {
  rag: /\b(rag|retriev\w*|bm25|chunk\w*|rerank\w*|embedding\w*|dense|sparse|llm|qa)\b|поиск|ретрив|чанк|эмбед/i,
  solar: /\b(solar|perovskite?s?|cigs|cdte|czts\w*|kesterite|sb2se3|pv|photovolt\w*|cells?)\b|перовск|солнечн|кестерит|селенид сурьмы|кпд|фотоэлектр/i,
}
export function detectTopic(name: string, projectId: string | null): { id: CollectionId; by: TopicBy } {
  const proj = projectOf(projectId)
  if (proj) return { id: proj.collection, by: 'project' }
  const text = name.replace(/[_-]+/g, ' ')
  for (const id of Object.keys(TOPIC_WORDS) as CollectionId[]) if (TOPIC_WORDS[id].test(text)) return { id, by: 'text' }
  return { id: state.collection, by: 'guess' }
}

function seedFor(name: string, collection: CollectionId) {
  const pool = SEEDS.filter((s) => s.collection === collection)
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return pool[h % pool.length]!
}
const timers = new Map<string, ReturnType<typeof setInterval>>()
function runProcessing(id: string, chatId: string) {
  clearInterval(timers.get(id))
  const timer = setInterval(() => {
    const p = paperOf(id)
    if (!p) return clearInterval(timer)
    p.processing = Math.min(100, p.processing + 2.5 + Math.random() * 4)
    if (p.processing >= 100) {
      clearInterval(timer)
      timers.delete(id)
      const q = qualityOf(p)
      toast(`«${p.title}» разобрана: ${q.total} фактов, замечаний — ${q.issues}`, { label: 'Открыть', run: () => nav.go('/c/' + chatId) })
    }
  }, 120)
  timers.set(id, timer)
}

export function uploadFiles(names: string[], projectId: string | null = null): string | null {
  let lastChat: string | null = null
  for (const name of names) {
    const topic = detectTopic(name, projectId)
    const seed = seedFor(name, topic.id)
    const id = uid('u')
    const title = name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Новая статья'
    const paper: Paper = { ...seed, id, title, authors: 'Загружено вами', addedAt: Date.now(), processing: 0, mine: true, file: name, topicBy: topic.by, seed: seed.id }
    const twin = state.papers.find((p) => p.mine && (p.seed ?? p.id) === seed.id && (p.file === name || p.title === title))
    if (twin) paper.dupOf = twin.id
    state.papers.unshift(paper)
    state.facts.push(...buildFacts(paper), ...figureFacts(paper))
    const chat: Chat = {
      id: 'c-' + id, projectId, title, createdAt: Date.now(), updatedAt: Date.now(),
      kind: 'paper', paperId: id, collection: topic.id, turns: [],
    }
    state.chats.unshift(chat)
    lastChat = chat.id
    runProcessing(id, chat.id)
  }
  return lastChat
}

export function setPaperTopic(paperId: string, collection: CollectionId) {
  const i = state.papers.findIndex((p) => p.id === paperId)
  const old = state.papers[i]
  if (!old || old.collection === collection) return
  const seed = seedFor(old.file ?? old.title, collection)
  const paper: Paper = { ...seed, id: old.id, title: old.title, authors: old.authors, addedAt: old.addedAt, processing: 0, mine: old.mine, file: old.file, topicBy: 'manual', seed: seed.id }
  state.facts = state.facts.filter((f) => f.paperId !== paperId)
  state.papers.splice(i, 1, paper)
  state.facts.push(...buildFacts(paper), ...figureFacts(paper))
  const chat = state.chats.find((c) => c.paperId === paperId)
  if (chat) {
    chat.collection = collection
    runProcessing(paperId, chat.id)
  }
}

export const picker = { open: (_projectId: string | null = null) => {} }

export function exportJSON(paperIds: string[], filename: string) {
  const data = paperIds.map((id) => {
    const p = paperOf(id)!
    return {
      paper: { id: p.id, title: p.title, authors: p.authors, year: p.year, journal: p.journal, collection: p.collection },
      facts: factsOf(id)
        .filter((f) => f.status !== 'rejected')
        .map((f) => {
          const param = paramOf(p.collection, f.param)
          return {
            sample: rowLabel(p, f.row),
            parameter: param.label,
            as_printed: f.raw,
            value: valueOf(f),
            unit: param.unit || null,
            status: f.status,
            edited: f.edited != null,
            confidence: Number(f.confidence.toFixed(2)),
            source: { page: f.source.page, ref: f.source.ref, where: f.source.where },
          }
        }),
      issues: issuesFor(p).map((i) => ({ level: i.level, title: i.title, text: i.text })),
    }
  })
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  toast(`Скачан ${filename}`)
}

export { COLLECTIONS }
