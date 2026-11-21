import { reactive } from 'vue'
import { dictionary } from './dictionary'
import { entitiesOf, refSummary, whereUsed } from './graph'
import { COLLECTIONS, fmt, paramOf, rowLabel, sampleWords, type CollectionId, type Fact } from './data'
import { levelDot, chatOf, chatsOf, factsOf, openIssues, newAskChat, paperOf, projectOf, state, valueOf, type Answer, type Cite, type Paper, type Turn } from './store'
import { coverageOf } from './structure'

export interface DataRow {
  key: string
  paper: Paper
  rowId: string
  label: string
  values: Record<string, number | null>
  facts: Record<string, Fact>
  issue: boolean
}

export interface Filter {
  id: string
  label: string
  match: string
  kind: 'topic' | 'num' | 'year' | 'issues'
  test: (r: DataRow) => boolean
}

const RANK: Record<Fact['source']['kind'], number> = { table: 0, text: 1, manual: 1, figure: 2 }

export function collectionRows(c: CollectionId, scope?: string[]): DataRow[] {
  const out: DataRow[] = []
  for (const p of state.papers) {
    if (p.collection !== c || p.processing < 100) continue
    if (scope && !scope.includes(p.id)) continue
    const facts = factsOf(p.id).filter((f) => f.status !== 'rejected')
    const issues = openIssues(p)
    const issueFacts = new Set(issues.flatMap((i) => i.factIds))
    const wholePaper = issues.some((i) => !i.factIds.length && !i.anchors.length)
    for (const r of p.rows) {
      const values: Record<string, number | null> = {}
      const map: Record<string, Fact> = {}
      for (const f of facts) {
        if (f.row !== r.id && f.row !== '*') continue
        if (f.row === '*' && map[f.param]) continue
        const prev = map[f.param]
        if (prev && prev.row === f.row && RANK[f.source.kind] > RANK[prev.source.kind]) continue
        map[f.param] = f
        values[f.param] = valueOf(f)
      }
      out.push({
        key: `${p.id}:${r.id}`,
        paper: p,
        rowId: r.id,
        label: r.label,
        values,
        facts: map,
        issue: wholePaper || Object.values(map).some((f) => issueFacts.has(f.id)),
      })
    }
  }
  return out
}

const OPS: [RegExp, 'min' | 'max'][] = [
  [/^(выше|больше|более|от|не ниже|>=|>|свыше)$/i, 'min'],
  [/^(ниже|меньше|менее|до|не выше|<=|<)$/i, 'max'],
]

export function parseQuery(q: string, c: CollectionId): Filter[] {
  const col = COLLECTIONS[c]
  const out: Filter[] = []
  const lower = q.toLowerCase()

  for (const [re, name] of col.topics) {
    const m = q.match(re)
    if (m) out.push({ id: 'topic:' + name, label: name, match: m[0], kind: 'topic', test: (r) => re.test(r.paper.title + ' ' + r.paper.tags) })
  }

  for (const [key, alias] of Object.entries(col.aliases)) {
    const re = new RegExp(`(?:${alias.source})[^0-9]{0,24}?(выше|больше|более|свыше|не ниже|не выше|от|до|ниже|меньше|менее|>=|<=|>|<)\\s*(\\d+(?:[.,]\\d+)?)\\s*(%)?`, 'i')
    const m = q.match(re)
    if (!m) continue
    const word = m[1]!
    const dir = OPS.find(([o]) => o.test(word))?.[1] ?? 'min'
    const strict = /^(выше|больше|более|свыше|ниже|меньше|менее|>|<)$/i.test(word)
    const param = paramOf(c, key)
    let n = parseFloat(m[2]!.replace(',', '.'))
    if (param.unit === '' && n > 1) n /= 100
    const sign = dir === 'min' ? (strict ? '>' : '≥') : strict ? '<' : '≤'
    const typed = param.unit === '' && parseFloat(m[2]!.replace(',', '.')) > 1 ? fmt(n, param) : `${m[2]!.replace('.', ',')}${param.unit ? ' ' + param.unit : ''}`
    out.push({
      id: `num:${key}:${dir}`,
      label: `${param.label} ${sign} ${typed}`,
      match: m[0],
      kind: 'num',
      test: (r) => {
        const v = r.values[key]
        return v != null && (dir === 'min' ? (strict ? v > n : v >= n) : strict ? v < n : v <= n)
      },
    })
  }

  const y1 = q.match(/(после|с|от|не раньше)\s*(20\d\d)/i)
  if (y1) {
    const y = Number(y1[2])
    const strict = /после/i.test(y1[1]!)
    out.push({ id: 'year:min', label: strict ? `после ${y} года` : `с ${y} года`, match: y1[0], kind: 'year', test: (r) => (strict ? r.paper.year > y : r.paper.year >= y) })
  }
  const y2 = q.match(/(до|раньше)\s*(20\d\d)/i)
  if (y2) {
    const y = Number(y2[2])
    out.push({ id: 'year:max', label: `до ${y} года`, match: y2[0], kind: 'year', test: (r) => r.paper.year <= y })
  }

  const iss = lower.match(/противореч\S*|не сход\S*|расхожд\S*|сомнени\S*|ошибк\S*/)
  if (iss) out.push({ id: 'issues', label: 'есть замечания', match: iss[0], kind: 'issues', test: (r) => r.issue })

  return out
}

export function applyFilters(rows: DataRow[], filters: Filter[]): DataRow[] {
  const topics = filters.filter((f) => f.kind === 'topic')
  const rest = filters.filter((f) => f.kind !== 'topic')
  return rows.filter((r) => (!topics.length || topics.some((f) => f.test(r))) && rest.every((f) => f.test(r)))
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10
  const b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}

export function quoteOf(f: Fact, p: Paper): string {
  if (f.source.kind === 'table') return `${p.caption} — ${rowLabel(p, f.row)}: ${f.raw}`
  const para = p.paragraphs.find((x) => x.includes(`[[${f.row}.${f.param}|`)) ?? ''
  return para.replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1')
}

const WANTS = {
  compare: /сравн|\bvs\b|(?<![а-яё])против(?![а-яё])|отлича|разниц/i,
  checks: /провер|достоверн|выброс|рекорд|не сход|противореч|расхожд/i,
  graph: /цитир|ссыла|ссылк|литератур|связ|кто использ|где использ|где встреча|источник/i,
  coverage: /полнот|чего не хват|чего нет|пропущ|не наш|не извлек|пробел/i,
  structure: /сло[ийея]|структур|из чего|устро|стек|конвейер|пайплайн|схем/i,
}
function intentOf(q: string): string {
  for (const k of ['compare', 'checks', 'graph', 'coverage', 'structure'] as const) if (WANTS[k].test(q)) return k
  return /лучш|максим|наибол/i.test(q) ? 'best' : ''
}

const QUALITY: Record<CollectionId, string[]> = { solar: ['pce', 'voc', 'jsc', 'ff', 'jsc_eqe', 't80'], rag: ['r5', 'r10', 'r20', 'mrr', 'ndcg10'] }
export const isQuality = (c: CollectionId, key: string) => QUALITY[c].includes(key)
export function metricIn(q: string, c: CollectionId): string {
  const col = COLLECTIONS[c]
  let best = { key: col.best, at: Infinity }
  for (const [key, re] of Object.entries(col.aliases)) {
    if (!isQuality(c, key)) continue
    const at = q.search(re)
    if (at >= 0 && at < best.at) best = { key, at }
  }
  return best.key
}

export function projectPapers(projectId: string | null): string[] | undefined {
  if (!projectId) return undefined
  return chatsOf(projectId).flatMap((c) => (c.kind === 'paper' && c.paperId ? [c.paperId] : []))
}

export function projectSuggestions(projectId: string): string[] {
  const proj = projectOf(projectId)
  const scope = projectPapers(projectId) ?? []
  if (!proj) return []
  const c = proj.collection
  const papers = scope.map((id) => paperOf(id)).filter((p): p is Paper => !!p && p.processing >= 100)
  const out: string[] = []
  const topics = COLLECTIONS[c].topics.filter(([re]) => papers.some((p) => re.test(p.title + ' ' + p.tags))).map(([, name]) => name)
  if (topics.length >= 2) out.push(`Сравни ${topics[0]} и ${topics[1]}`)
  else if (papers.length >= 1) out.push(c === 'rag' ? 'Сравни конфигурации' : 'Сравни образцы')
  const mat = dictionary.materials.find((m) => m.collection === c && whereUsed(m.id).some((u) => scope.includes(u.paper.id)))
  if (mat) out.push(`Где используется ${mat.canon}?`)
  if (papers.some((p) => openIssues(p).length)) out.push('Где данные не сходятся?')
  else out.push(c === 'rag' ? 'Какие конфигурации лучшие по Recall@5?' : 'Какие приборы лучшие по КПД?')
  return out
}

export function compareCols(q: string, c: CollectionId, scope: string[] | undefined, metric: string) {
  const col = COLLECTIONS[c]
  const rows = collectionRows(c, scope).filter((r) => r.values[metric] != null).sort((a, b) => b.values[metric]! - a.values[metric]!)
  const picked: DataRow[] = []
  const missing: string[] = []
  const paperUsed = (r: DataRow) => picked.some((x) => x.paper.id === r.paper.id)
  const asked = col.topics.filter(([re]) => re.test(q)).sort((a, b) => rows.filter((r) => a[0].test(r.label + ' ' + r.paper.title + ' ' + r.paper.tags)).length - rows.filter((r) => b[0].test(r.label + ' ' + r.paper.title + ' ' + r.paper.tags)).length)
  for (const [re, name] of asked) {
    const hit = rows.find((r) => re.test(r.label) && !picked.includes(r)) ?? rows.find((r) => re.test(r.paper.title + ' ' + r.paper.tags) && !paperUsed(r))
    if (hit) picked.push(hit)
    else missing.push(name)
  }
  const words = ` ${q.toLowerCase().replace(/[«»"(),.?!:;]/g, ' ')} `
  for (const r of rows) {
    if (picked.length < 3 && !picked.includes(r) && r.label.length > 2 && !/^\d+$/.test(r.label) && words.includes(` ${r.label.toLowerCase()} `)) picked.push(r)
  }
  for (const r of rows) if (picked.length < 2 && !paperUsed(r)) picked.push(r)
  for (const r of rows) if (picked.length < 2 && !picked.includes(r)) picked.push(r)
  return { cols: picked.slice(0, 3), missing }
}

export function topicOf(p: Paper): string {
  const hits = COLLECTIONS[p.collection].topics.filter(([re]) => re.test(p.title + ' ' + p.tags))
  return hits.length ? hits[hits.length - 1]![1] : p.title
}
export function rowName(p: Paper, rowId: string): string {
  const l = rowLabel(p, rowId)
  if (p.collection === 'rag') return /^\d+$/.test(l) ? `чанк ${l}` : `конфигурация «${l}»`
  if (/^\S{1,6}$/.test(l) || /^\d/.test(l)) return `образец ${l}`
  const low = l.charAt(0).toLowerCase() + l.slice(1)
  return /^без\s/i.test(l) ? `образец ${low}` : low
}
export function colNames(cols: { p: Paper; rowId: string }[]): string[] {
  const base = cols.map(({ p, rowId }) => {
    const l = rowLabel(p, rowId)
    return p.collection === 'rag' ? (/^\d+$/.test(l) ? `чанк ${l}` : l) : topicOf(p)
  })
  return base.map((b, i) => {
    if (base.filter((x) => x === b).length < 2) return b
    const { p, rowId } = cols[i]!
    const sameCount = cols.filter((x) => x.p.id === p.id).length
    return sameCount > 1 ? `${b}, ${rowName(p, rowId)}` : `${b}, ${p.authors.split(/[,\s]/)[0] || 'статья'} ${p.year}`
  })
}
export const sampleWord = (c: CollectionId) => sampleWords(c).one
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const gen = (s: string) => s.replace(/ые$/, 'ых').replace(/ит$/, 'ита')
export interface AnswerItem { text: string; cite: number; head?: string }

export const sevDot = levelDot
const sevRank = (level: 'doubt' | 'conflict' | 'warn') => (level === 'conflict' ? 0 : 1)

export function answer(q: string, c: CollectionId, scope?: string[]): Answer {
  const a = answerText(q, c, scope)
  if (WANTS.compare.test(q)) {
    const metric = metricIn(q, c)
    const { cols, missing } = compareCols(q, c, scope, metric)
    if (cols.length < 2) {
      return { intro: scope ? 'В проекте мало данных для сравнения: нужны хотя бы две статьи или два метода.' : 'Для сравнения не хватает данных: нужны хотя бы две статьи или два метода.', items: [], outro: '', cites: [], explore: '' }
    }
    a.card = { kind: 'compare', collection: c, ids: cols.map((r) => r.paper.id), rows: cols.map((r) => r.rowId), metric }
    const verdict = compareVerdict(c, cols, metric)
    const note = missing.length ? ` ${scope ? 'В проекте' : 'В коллекции'} нет данных про ${missing.join(' и ')} — сравниваю лучшее из имеющегося.` : ''
    if (verdict) a.intro = verdict + note
  }
  else if (WANTS.checks.test(q)) a.card = { kind: 'checks', collection: c, papers: scope, skip: a.cites.map((x) => x.factId) }
  else if (WANTS.graph.test(q)) {
    const ent = entityIn(q, c)
    if (ent) {
      const used = whereUsed(ent.id).filter((u) => !scope || scope.includes(u.paper.id))
      const cites: Cite[] = []
      const col = COLLECTIONS[c]
      const items: AnswerItem[] = used.map((u) => {
        const f = factsOf(u.paper.id)
          .filter((x) => x.param === col.best && x.source.kind !== 'figure' && x.status !== 'rejected' && valueOf(x) != null)
          .sort((x, y) => valueOf(y)! - valueOf(x)!)[0]
        return { text: `${u.paper.title} (${u.paper.year})${u.best ? ` — ${u.best}` : ''}`, cite: f ? addCite(cites, f) : 0 }
      })
      return {
        intro: used.length
          ? `${ent.canon} (${ent.name.toLowerCase()}) встречается в ${used.length} ${plural(used.length, 'статье', 'статьях', 'статьях')} ${scope ? 'проекта' : 'коллекции'}.`
          : `${ent.canon} в разобранных статьях ${scope ? 'проекта' : 'коллекции'} не встречается.`,
        items,
        outro: used.length ? 'На графе видно, кто из них на кого ссылается.' : '',
        cites,
        explore: '',
        card: used.length ? { kind: 'graph', collection: c, focus: ent.id, title: `${used.length} ${plural(used.length, 'статья', 'статьи', 'статей')} с ${ent.canon}` } : undefined,
      }
    }
    const metric = metricIn(q, c)
    const top = collectionRows(c, scope).filter((r) => r.values[metric] != null).sort((x, y) => y.values[metric]! - x.values[metric]!)[0]?.paper.id
    a.card = { kind: 'graph', collection: c, root: top, title: scope ? 'Связи статей проекта' : 'Связи статей коллекции' }
  }
  return a
}

function addCite(cites: Cite[], f: Fact, issueId?: string): number {
  const p = state.papers.find((x) => x.id === f.paperId)!
  const n = cites.length + 1
  cites.push({ n, factId: f.id, paperId: p.id, title: p.title, where: `стр. ${f.source.page} · ${f.source.ref}${f.source.kind === 'table' ? ', ' + f.source.where : ''}`, quote: quoteOf(f, p), ...(issueId ? { issueId } : {}) })
  return n
}
function mainFactOf(p: Paper): Fact | undefined {
  const k = COLLECTIONS[p.collection].best
  return factsOf(p.id).filter((f) => f.param === k && f.source.kind !== 'figure' && f.status !== 'rejected' && valueOf(f) != null).sort((a, b) => valueOf(b)! - valueOf(a)!)[0]
}

function compareVerdict(c: CollectionId, cols: DataRow[], metric: string): string {
  const prm = paramOf(c, metric)
  const names = colNames(cols.map((r) => ({ p: r.paper, rowId: r.rowId })))
  const tops = cols
    .map((r, i) => ({ name: names[i]!, v: r.values[metric]! }))
    .sort((a, b) => b.v - a.v)
  if (tops.length < 2) return ''
  const [a, b] = tops as [(typeof tops)[number], (typeof tops)[number]]
  if (a.v === b.v) return `${cap(a.name)} и ${b.name} поровну: ${prm.label} ${fmt(a.v, prm)}.`
  const diff = a.v - b.v
  const d = diff.toFixed(prm.digits).replace('.', ',')
  if (prm.unit === '%' && diff < 1) return `${cap(a.name)} чуть лучше: ${prm.label} ${fmt(a.v, prm)} против ${fmt(b.v, prm)} у ${b.name} (+${d} п.п.).`
  if (prm.unit === '' && diff < 0.02) return `${cap(a.name)} чуть лучше: ${prm.label} ${fmt(a.v, prm)} против ${fmt(b.v, prm)} у ${gen(b.name)} (+${d}).`
  return `${cap(a.name)} лучше: ${prm.label} ${fmt(a.v, prm)} против ${fmt(b.v, prm)} у ${gen(b.name)}.`
}

function entityIn(q: string, c: CollectionId) {
  const lower = q.toLowerCase()
  return dictionary.materials.find((m) => m.collection === c && [m.canon, ...m.synonyms.map((x) => x.text)].some((t) => t.length > 2 && lower.includes(t.toLowerCase()))) ?? null
}

function answerText(q: string, c: CollectionId, scope?: string[]): Answer {
  const metric = metricIn(q, c)
  const best = paramOf(c, metric)
  const filters = parseQuery(q, c)
  const cites: Cite[] = []
  const cite = (f: Fact) => addCite(cites, f)
  const where = scope ? 'в статьях проекта' : 'в коллекции'

  if (filters.some((f) => f.kind === 'issues')) {
    const issues = state.papers.filter((p) => p.collection === c && (!scope || scope.includes(p.id))).flatMap(openIssues).sort((a, b) => sevRank(a.level) - sevRank(b.level))
    const shown = issues.slice(0, 6)
    const grouped = [...new Set(shown.map((i) => i.paperId))].flatMap((id) => shown.filter((i) => i.paperId === id))
    const items: AnswerItem[] = grouped.map((i, k) => {
      const p = state.papers.find((x) => x.id === i.paperId)!
      const f = state.facts.find((x) => x.id === i.factIds[0]) ?? mainFactOf(p)
      return { head: k === 0 || grouped[k - 1]!.paperId !== i.paperId ? `${p.title} (${p.year})` : undefined, text: `${i.title}. ${i.text}`, cite: f ? addCite(cites, f, i.id) : 0 }
    })
    const errs = issues.filter((i) => i.level === 'conflict').length
    const rest = issues.length - errs
    const parts = [errs ? `${errs} ${plural(errs, 'ошибка', 'ошибки', 'ошибок')}` : '', rest ? `${rest} ${plural(rest, 'предупреждение', 'предупреждения', 'предупреждений')}` : ''].filter(Boolean)
    return {
      intro: issues.length ? `Внутри статей ${parts.join(' и ')}: данные не сходятся.` : `Внутри статей ${scope ? 'проекта ' : ''}замечаний нет.`,
      items,
      outro: '',
      cites,
      explore: 'противоречия',
    }
  }

  const rows = applyFilters(collectionRows(c, scope), filters)
    .filter((r) => r.values[metric] != null)
    .sort((a, b) => (b.values[metric] ?? 0) - (a.values[metric] ?? 0))

  if (!rows.length) {
    return { intro: `Под эти условия ${where} ничего нет. Попробуйте ослабить фильтр или загрузить ещё статьи.`, items: [], outro: '', cites, explore: q }
  }

  const noun = c === 'rag' ? ['конфигурация', 'конфигурации', 'конфигураций'] : ['прибор', 'прибора', 'приборов']
  const head = filters.length ? `По запросу (${filters.map((f) => f.label).join(', ')}) нашлось` : scope ? 'В проекте' : 'В коллекции'
  const top = rows[0]!
  const lead = c === 'rag'
    ? `Лучшее — ${best.label} ${fmt(top.values[metric], best)}: ${rowName(top.paper, top.rowId)}.`
    : `Лучшее — ${best.label} ${fmt(top.values[metric], best)}: ${topicOf(top.paper)}, ${rowName(top.paper, top.rowId)}.`
  const shownN = Math.min(5, rows.length)
  const intro = `${lead} ${head} ${rows.length} ${plural(rows.length, noun[0]!, noun[1]!, noun[2]!)}, ниже — ${rows.length > shownN ? `лучшие ${shownN}` : rows.length > 1 ? 'все' : 'она'}.`
  const extra = (c === 'solar' ? ['pce', 'voc', 'jsc', 'ff'] : ['r5', 'r10', 'mrr', 'chunk']).filter((k) => k !== metric).slice(0, 3)
  const picked = rows.slice(0, 5)
  const order = [...new Set(picked.map((r) => r.paper.id))]
  const grouped = order.flatMap((id) => picked.filter((r) => r.paper.id === id))
  const items: AnswerItem[] = grouped.map((r, i) => {
    const details = extra
      .map((k) => (r.values[k] != null ? `${paramOf(c, k).label} ${fmt(r.values[k], paramOf(c, k))}` : ''))
      .filter(Boolean)
      .join(', ')
    return {
      head: i === 0 || grouped[i - 1]!.paper.id !== r.paper.id ? `${r.paper.title} (${r.paper.year})` : undefined,
      text: `${rowName(r.paper, r.rowId)}: ${best.label} ${fmt(r.values[metric], best)}${details ? ` (${details})` : ''}${r.issue ? ' — есть замечание' : ''}`,
      cite: cite(r.facts[metric]!),
    }
  })

  const topics = filters.filter((f) => f.kind === 'topic')
  let outro = ''
  if (topics.length < 2 && rows.length > 2) {
    const vs = rows.map((r) => r.values[metric]!)
    outro = `Среднее по выборке — ${fmt(vs.reduce((a, b) => a + b, 0) / vs.length, best)}, разброс от ${fmt(Math.min(...vs), best)} до ${fmt(Math.max(...vs), best)}.`
  }
  return { intro, items, outro, cites, explore: q }
}

let turnId = 0
const timers = new Map<number, number[]>()
export interface TurnMeta {
  stopped?: boolean
  rating?: 'up' | 'down'
  reason?: string
  alt?: { q: string; answer: Answer | null }
  ver?: 1 | 2
}
export const turnMeta = reactive<Record<number, TurnMeta>>({})
export const metaOf = (id: number): TurnMeta => turnMeta[id] ?? {}

function clearTimers(id: number) {
  for (const h of timers.get(id) ?? []) clearInterval(h)
  timers.delete(id)
}
export function busyOf(chat: { turns: Turn[] } | undefined): boolean {
  const t = chat?.turns[chat.turns.length - 1]
  return !!t && timers.has(t.id) && (!t.done || t.shown < (t.answer?.items.length ?? 0))
}
export function stop(chatId: string) {
  const t = chatOf(chatId)?.turns.at(-1)
  if (!t || !timers.has(t.id)) return
  clearTimers(t.id)
  const a = t.answer ?? { intro: '', items: [], outro: '', cites: [], explore: '' }
  a.items = a.items.slice(0, t.shown)
  a.outro = ''
  delete a.card
  a.explore = ''
  t.answer = a
  t.done = true
  turnMeta[t.id] = { ...turnMeta[t.id], stopped: true }
}
export function reask(chatId: string, q: string) {
  const chat = chatOf(chatId)
  const last = chat?.turns.at(-1)
  if (!chat || !last || !q.trim()) return
  clearTimers(last.id)
  const edited = last.q.trim() !== q.trim()
  const prev = edited && last.done && last.answer && !metaOf(last.id).stopped ? { q: last.q, answer: last.answer } : null
  delete turnMeta[last.id]
  chat.turns.pop()
  if (edited && chat.turns.length === 0 && chat.title === last.q.trim().slice(0, 48)) chat.title = q.trim().slice(0, 48)
  if (chat.kind === 'paper') askPaper(chatId, q)
  else ask(chatId, q)
  const now = chat.turns.at(-1)
  if (now && prev) turnMeta[now.id] = { alt: prev, ver: 2 }
}
export function swapVersion(chatId: string, turnId: number) {
  const chat = chatOf(chatId)
  const t = chat?.turns.find((x) => x.id === turnId)
  const m = turnMeta[turnId]
  if (!chat || !t || !m?.alt || !t.answer) return
  const cur = { q: t.q, answer: t.answer }
  const auto = chat.turns.length === 1 && chat.title === t.q.slice(0, 48)
  t.q = m.alt.q
  t.answer = m.alt.answer
  t.shown = t.answer?.items.length ?? 0
  if (auto) chat.title = t.q.slice(0, 48)
  turnMeta[turnId] = { ...m, alt: cur, ver: m.ver === 2 ? 1 : 2 }
}
export function rate(id: number, v: 'up' | 'down') {
  const m = turnMeta[id] ?? {}
  turnMeta[id] = m.rating === v ? {} : { rating: v }
}
export function setReason(id: number, reason: string) {
  turnMeta[id] = { ...turnMeta[id], reason }
}

export function copyTextOf(a: Answer): string {
  const nl = String.fromCharCode(10)
  const lines = [a.intro, ...(a.items as AnswerItem[]).map((i) => `${i.head ? i.head + nl : ''}— ${i.text}${i.cite ? ` [${i.cite}]` : ''}`), a.outro].filter(Boolean)
  if (a.cites.length) lines.push('', ...a.cites.map((c) => `[${c.n}] ${c.title}, ${c.where}`))
  return lines.join(nl)
}

export function followups(chat: { kind: string; turns: Turn[]; paperId?: string; projectId?: string | null; collection?: CollectionId }, turn: Turn): string[] {
  const a = turn.answer
  if (!a || metaOf(turn.id).stopped) return []
  const kind = a.card?.kind
  const paper = chat.kind === 'paper'
  const cid: CollectionId = (paper ? paperOf(chat.paperId)?.collection : undefined) ?? projectOf(chat.projectId ?? null)?.collection ?? chat.collection ?? state.collection
  const rag = cid === 'rag'
  const bestQ = rag ? 'Какая конфигурация лучшая?' : 'Какой образец лучший?'
  let list: string[]
  if (paper) {
    const layers = rag ? 'Как устроена система?' : 'Из каких слоёв прибор?'
    if (kind === 'coverage') list = [layers, 'Где данные не сходятся?', bestQ, 'Кто цитирует статью?']
    else if (kind === 'structure') list = ['Чего не хватает?', bestQ, 'Где данные не сходятся?', 'Кто цитирует статью?']
    else if (kind === 'graph') list = [bestQ, 'Чего не хватает?', layers, 'Где данные не сходятся?']
    else if (/замечан|ошиб|предупрежд|сходится|проверки пройдены/.test(a.intro)) list = [bestQ, 'Чего не хватает?', layers, 'Кто цитирует статью?']
    else list = ['Чего не хватает?', layers, 'Где данные не сходятся?', 'Кто цитирует статью?']
  } else {
    const rank = rag ? 'Какие конфигурации лучшие по Recall@5?' : 'Какие приборы лучшие по КПД?'
    if (kind === 'compare') list = ['Связи этих статей', 'Где данные не сходятся?', rank]
    else if (kind === 'graph') list = ['Сравни эти статьи', 'Где данные не сходятся?', rank]
    else if (kind === 'checks') list = ['Связи в коллекции', 'Сравни эти статьи', rank]
    else list = ['Сравни эти статьи', 'Где данные не сходятся?', 'Связи в коллекции']
  }
  const asked = new Set(chat.turns.map((t) => t.q.toLowerCase()))
  const intents = new Set(chat.turns.map((t) => intentOf(t.q)).filter(Boolean))
  return list.filter((q) => !asked.has(q.toLowerCase()) && !intents.has(intentOf(q))).slice(0, 3)
}

function run(chat: { turns: Turn[]; updatedAt: number }, q: string, steps: string[], stepMs: number, typeMs: number, make: () => Answer) {
  const turn: Turn = { id: ++turnId, q: q.trim(), steps, step: 0, done: false, shown: 0, answer: null }
  chat.turns.push(turn)
  chat.updatedAt = Date.now()
  const t = chat.turns[chat.turns.length - 1]!
  const hs: number[] = []
  timers.set(t.id, hs)
  const tick = window.setInterval(() => {
    if (t.step < t.steps.length - 1) {
      t.step++
      return
    }
    clearInterval(tick)
    t.answer = make()
    t.done = true
    const total = t.answer.items.length
    const type = window.setInterval(() => {
      if (t.shown >= total) {
        clearInterval(type)
        timers.delete(t.id)
        return
      }
      t.shown++
    }, typeMs)
    hs.push(type)
    if (!total) {
      clearInterval(type)
      timers.delete(t.id)
    }
  }, stepMs)
  hs.push(tick)
}

export function askNew(projectId: string | null, collection: CollectionId | undefined, q: string): string {
  const text = q.trim()
  const col = collection ?? (projectId ? state.projects.find((p) => p.id === projectId)?.collection : undefined) ?? state.collection
  const last = [...state.chats].filter((c) => c.kind === 'ask').sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (last && last.projectId === projectId && last.collection === col && last.turns.length === 1 && last.turns[0]!.q.trim() === text) return last.id
  const chat = newAskChat(projectId, collection)
  ask(chat.id, text)
  return chat.id
}

export function ask(chatId: string, q: string) {
  const chat = chatOf(chatId)
  if (!chat || !q.trim()) return
  const c = chat.projectId ? (state.projects.find((p) => p.id === chat.projectId)?.collection ?? chat.collection) : chat.collection
  const scopeNow = () => projectPapers(chat.projectId)
  const n = state.papers.filter((p) => p.collection === c && p.processing >= 100 && (!scopeNow() || scopeNow()!.includes(p.id))).length
  if (chat.title === 'Новый вопрос') chat.title = q.trim().slice(0, 48)
  run(chat, q, ['Разбираю вопрос', `Ищу в ${n} ${plural(n, 'статье', 'статьях', 'статьях')}${chat.projectId ? ' проекта' : ''}`, 'Сверяю с источниками'], 420, 140, () => answer(q, c, scopeNow()))
}

export function answerPaper(q: string, p: Paper): Answer {
  const lower = q.toLowerCase()
  if (WANTS.coverage.test(lower)) return withCard(coverageText(p), { kind: 'coverage', paperId: p.id })
  if (WANTS.graph.test(lower)) {
    const rs = refSummary(p.id)
    const ents = entitiesOf(p).slice(0, 3).map((m) => m.canon)
    const refs = rs.refs ? `Статья ссылается на ${rs.refs} ${plural(rs.refs, 'работу', 'работы', 'работ')}` : 'Статья не ссылается на другие работы'
    const cited = rs.citedBy ? `в коллекции её ${rs.citedBy === 1 ? 'цитирует' : 'цитируют'} ${rs.citedBy} ${plural(rs.citedBy, 'статья', 'статьи', 'статей')}` : 'в коллекции её пока никто не цитирует'
    return withCard({ intro: `${refs}, ${cited}${ents.length ? `; общие ${p.collection === 'rag' ? 'методы' : 'материалы'}: ${ents.join(', ')}` : ''}.`, items: [], outro: '', cites: [], explore: '' },
      { kind: 'graph', collection: p.collection, root: p.id, title: ents.length ? `Связи статьи: ${ents.join(', ')}` : 'Связи статьи' })
  }
  if (WANTS.structure.test(lower) && !/лучш/.test(lower)) {
    return withCard({ intro: p.collection === 'rag' ? 'Как устроена система из статьи — от данных до метрик. Нажмите на узел, чтобы увидеть источник.' : 'Из каких слоёв состоит прибор и в каких условиях его мерили. Нажмите на слой, чтобы увидеть источник.', items: [], outro: '', cites: [], explore: '' },
      { kind: 'structure', paperId: p.id })
  }
  return answerPaperText(q, p)
}
const withCard = (a: Answer, card: Answer['card']): Answer => ({ ...a, card })

function coverageText(p: Paper): Answer {
  const cov = coverageOf(p)
  const missing = cov.cells.filter((c) => !c.main).map((c) => `${paramOf(p.collection, c.param).label} (${rowLabel(p, c.row)})`)
  const n = cov.filled
  const of = `${cov.total} ${cov.total % 10 === 1 && cov.total % 100 !== 11 ? 'параметра' : 'параметров'}`
  return {
    intro: `Найдено ${n} из ${of} по схеме коллекции.${missing.length ? ' Не хватает:' : ' Всё на месте.'}`,
    items: missing.slice(0, 6).map((text) => ({ text, cite: 0 })),
    outro: missing.length ? 'Нажмите на пустую клетку — открою PDF: выделите нужное место, и я добавлю факт.' : '',
    cites: [],
    explore: '',
  }
}

function answerPaperText(q: string, p: Paper): Answer {
  const c = COLLECTIONS[p.collection]
  const best = paramOf(p.collection, c.best)
  const facts = factsOf(p.id).filter((f) => f.status !== 'rejected')
  const cites: Cite[] = []
  const cite = (f: Fact) => {
    const n = cites.length + 1
    cites.push({ n, factId: f.id, paperId: p.id, title: p.title, where: `стр. ${f.source.page} · ${f.source.ref}${f.source.kind === 'table' ? ', ' + f.source.where : ''}`, quote: quoteOf(f, p) })
    return n
  }
  const val = (f: Fact) => fmt(valueOf(f), paramOf(p.collection, f.param))
  const lower = q.toLowerCase()

  if (/противореч|не сход|сомнен|ошиб|провер|расхожд/.test(lower)) {
    const issues = openIssues(p)
    return {
      intro: issues.length ? `В статье ${issues.length} ${plural(issues.length, 'замечание', 'замечания', 'замечаний')}:` : 'Проверки пройдены: цифры в тексте и таблицах сходятся.',
      items: [...issues].sort((a, b) => sevRank(a.level) - sevRank(b.level)).map((i) => {
        const f = facts.find((x) => x.id === i.factIds[0]) ?? mainFactOf(p)
        return { text: `${i.title}. ${i.text}`, cite: f ? addCite(cites, f, i.id) : 0 }
      }),
      outro: issues.length ? 'Нажмите на сноску — покажу это место в статье.' : '',
      cites,
      explore: '',
    }
  }

  if (/услови|спектр|освещ|температур/.test(lower)) {
    const f = facts.find((x) => x.param === 'conditions')
    return f
      ? { intro: 'Условия измерения:', items: [{ text: f.raw, cite: cite(f) }], outro: '', cites, explore: '' }
      : { intro: 'В разобранном фрагменте условия измерения не указаны — это стоит уточнить у авторов.', items: [], outro: '', cites, explore: '' }
  }

  const asked = Object.entries(c.aliases).filter(([, re]) => re.test(q)).map(([k]) => k)
  if (/толщин/.test(lower)) asked.push('thickness')
  const words = ` ${lower.replace(/[«»"(),.?!:;]/g, ' ')} `
  const rowsAsked = p.rows.filter((r) => words.includes(` ${r.label.toLowerCase()} `))

  if (/лучш|максим|наибол|самый|выше всего/.test(lower) || (!asked.length && !rowsAsked.length && /какой|кто/.test(lower))) {
    const ranked = facts.filter((f) => f.param === c.best && f.source.kind !== 'figure' && valueOf(f) != null).sort((a, b) => valueOf(b)! - valueOf(a)!)
    const top = ranked[0]
    if (!top) return { intro: 'В статье нет значений для сравнения.', items: [], outro: '', cites, explore: '' }
    return {
      intro: `${p.collection === 'rag' ? 'Лучшая' : 'Лучший'} по ${best.label} — ${sampleWord(p.collection)} ${rowLabel(p, top.row)}:`,
      items: ranked.map((f) => ({ text: `${rowLabel(p, f.row)}: ${best.label} ${val(f)}`, cite: cite(f) })),
      outro: openIssues(p).some((i) => i.plugin === 'contradiction') ? (p.collection === 'rag' ? 'Обратите внимание: текст статьи называет лучшей другую конфигурацию — это отмечено в замечаниях.' : 'Обратите внимание: текст статьи называет лучшим другой образец — это отмечено в замечаниях.') : '',
      cites,
      explore: '',
    }
  }

  if (asked.length || rowsAsked.length) {
    const keys = asked.length ? asked : c.table
    const rows = rowsAsked.length ? rowsAsked.map((r) => r.id) : [...p.rows.map((r) => r.id), '*']
    const found = facts.filter((f) => keys.includes(f.param) && rows.includes(f.row))
    if (!found.length) return { intro: 'В статье этих данных нет.', items: [], outro: '', cites, explore: '' }
    return {
      intro: rowsAsked.length ? `${cap(sampleWord(p.collection))} ${rowsAsked.map((r) => r.label).join(', ')}:` : 'Вот что есть в статье:',
      items: found.map((f) => ({ text: `${labelFor(p, f)}${f.row !== '*' && !rowsAsked.length ? ` (${rowLabel(p, f.row)})` : ''}: ${val(f)}${f.raw !== val(f) && !paramOf(p.collection, f.param).text ? ` — в статье «${f.raw}»` : ''}`, cite: cite(f) })),
      outro: '',
      cites,
      explore: '',
    }
  }

  const main = facts.filter((f) => f.param === c.best)
  const issues = openIssues(p)
  return {
    intro: `Коротко о статье «${p.title}» (${p.authors}, ${p.year}):`,
    items: main.map((f) => ({ text: `${sampleWord(p.collection)} ${rowLabel(p, f.row)} — ${best.label} ${val(f)}`, cite: cite(f) })),
    outro: `Всего ${facts.length} ${plural(facts.length, 'факт', 'факта', 'фактов')}${issues.length ? `, замечаний — ${issues.length}. Спросите «где не сходится?», чтобы разобрать их` : ', замечаний нет'}.`,
    cites,
    explore: '',
  }
}
const labelFor = (p: Paper, f: Fact) => paramOf(p.collection, f.param).label

export function askPaper(chatId: string, q: string) {
  const chat = chatOf(chatId)
  const p = state.papers.find((x) => x.id === chat?.paperId)
  if (!chat || !p || !q.trim()) return
  run(chat, q, ['Читаю статью', 'Сверяю с таблицами и текстом'], 380, 120, () => answerPaper(q, p))
}
