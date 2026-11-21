import { TOKEN, anchorOf, rowLabel } from './data'
import {
  chatOfPaper, chatsOf, display, labelOf, paperOf, projectOf, sortedProjects, state,
  COLLECTIONS, type Issue, type Paper,
} from './store'
import { keyText, type KeyPart } from './keys'
import {
  allIssues, allResults, checkLabel, deviceName, fmtRaw, fmtValue, isIssueOpen, metricLabel, placeOf, publication, publications,
} from './case'
import { runPapers, runs } from './case/runs'

export type Scope = 'all' | 'project' | 'paper' | 'text' | 'fact' | 'issue' | 'chat' | 'command'
export type Kind = Exclude<Scope, 'all'> | 'more' | 'recent'

export const SCOPES: { id: Scope; label: string; prefix?: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'project', label: 'Проекты', prefix: '#' },
  { id: 'paper', label: 'Статьи' },
  { id: 'text', label: 'Текст', prefix: '"' },
  { id: 'fact', label: 'Факты', prefix: '=' },
  { id: 'issue', label: 'Замечания', prefix: '!' },
  { id: 'chat', label: 'Чаты' },
  { id: 'command', label: 'Команды', prefix: '/' },
]
export const LIMITS: Record<Exclude<Scope, 'all'>, number> = { project: 4, paper: 5, text: 4, fact: 6, issue: 3, chat: 4, command: 4 }
export const GROUP_TITLE: Record<Exclude<Scope, 'all'>, string> = {
  project: 'Проекты', paper: 'Статьи', text: 'Текст статей', fact: 'Факты', issue: 'Замечания', chat: 'Чаты', command: 'Команды',
}
export const ORDER: Exclude<Scope, 'all'>[] = ['project', 'paper', 'text', 'fact', 'issue', 'chat', 'command']

export interface Cmd {
  id: string
  title: string
  desc: string
  icon: string
  keys?: KeyPart[]
  keywords: string
  run: () => void
}

export interface Hit {
  id: string
  kind: Kind
  ref: string
  title: string
  meta: string
  value?: string
  icon: string
  dot?: 'doubt' | 'warn' | 'conflict'
  count?: number
  score: number
  paperId?: string
  factId?: string
}

export interface TextEntry {
  key: string
  paperId: string
  kind: 'para' | 'caption'
  no: number
  text: string
  n: string
  facts: { pos: number; id: string }[]
}

export interface Ctx {
  index: TextEntry[]
  issues: Issue[]
  commands: Cmd[]
}

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/(\d),(?=\d)/g, '$1.')

export const wordsOf = (q: string, exact: boolean): string[] => {
  const n = norm(q.replace(/"/g, ' ')).trim()
  if (!n) return []
  return exact ? [n.replace(/\s+/g, ' ')] : n.split(/\s+/)
}

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ё'
const toRu = new Map([...EN].map((c, i) => [c, RU[i]!]))
const toEn = new Map([...RU].map((c, i) => [c, EN[i]!]))

export function fixLayout(q: string): string | null {
  const s = q.toLowerCase()
  const lat = /[a-z]/.test(s)
  const cyr = /[а-яё]/.test(s)
  if (lat === cyr) return null
  const map = lat ? toRu : toEn
  const out = [...s].map((c) => map.get(c) ?? c).join('')
  return out === s ? null : out
}

export const plural = (n: number, f: [string, string, string]) => {
  const m = n % 100
  if (m >= 11 && m <= 14) return f[2]
  const d = n % 10
  return d === 1 ? f[0] : d >= 2 && d <= 4 ? f[1] : f[2]
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

function wordScore(n: string, w: string): number {
  let i = n.indexOf(w)
  if (i < 0) return 0
  if (n.length === w.length) return 5
  if (i === 0) return 3
  while (i >= 0) {
    if (!isWordChar(n[i - 1])) return 2
    i = n.indexOf(w, i + 1)
  }
  return 1
}

function scoreN(fields: [string, number][], words: string[]): number {
  let total = 0
  for (const w of words) {
    let best = 0
    for (const [n, wt] of fields) best = Math.max(best, wordScore(n, w) * wt)
    if (!best) return 0
    total += best
  }
  if (words.length > 1) {
    const phrase = words.join(' ')
    for (const [n, wt] of fields) if (n.includes(phrase)) { total += 6 * wt; break }
  }
  return total
}

export interface Seg { t: string; m: boolean }

export function segments(text: string, words: string[]): Seg[] {
  const n = norm(text)
  if (!words.length || n.length !== text.length) return [{ t: text, m: false }]
  const rs: [number, number][] = []
  for (const w of words) {
    if (!w) continue
    let i = n.indexOf(w)
    while (i >= 0) {
      rs.push([i, i + w.length])
      i = n.indexOf(w, i + w.length)
    }
  }
  if (!rs.length) return [{ t: text, m: false }]
  rs.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of rs) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  const out: Seg[] = []
  let p = 0
  for (const [a, b] of merged) {
    if (a > p) out.push({ t: text.slice(p, a), m: false })
    out.push({ t: text.slice(a, b), m: true })
    p = b
  }
  if (p < text.length) out.push({ t: text.slice(p), m: false })
  return out
}

export function snippet(text: string, words: string[], radius: number, before = radius): { text: string; at: number } {
  const n = norm(text)
  let at = -1
  let len = 0
  for (const w of words) {
    const i = n.indexOf(w)
    if (i >= 0 && (at < 0 || i < at)) { at = i; len = w.length }
  }
  if (at < 0) return { text: text.length > radius * 2 ? text.slice(0, radius * 2).trimEnd() + '…' : text, at: 0 }
  let a = Math.max(0, at - before)
  let b = Math.min(text.length, at + len + radius)
  if (a > 0) { const s = text.indexOf(' ', a); if (s >= 0 && s < at) a = s + 1 }
  if (b < text.length) { const s = text.lastIndexOf(' ', b); if (s > at + len) b = s }
  return { text: (a > 0 ? '…' : '') + text.slice(a, b).trim() + (b < text.length ? '…' : ''), at }
}

export function buildIndex(papers: Paper[]): TextEntry[] {
  const out: TextEntry[] = []
  for (const p of papers) {
    if (p.processing < 100) continue
    p.paragraphs.forEach((para, i) => {
      let text = ''
      let last = 0
      const facts: TextEntry['facts'] = []
      for (const m of para.matchAll(TOKEN)) {
        text += para.slice(last, m.index)
        const key = m[1]!
        if (!key.startsWith('@')) {
          const [row, param] = key.split('.') as [string, string]
          facts.push({ pos: text.length, id: anchorOf(p.id, 't', row, param) })
        }
        text += m[2]!
        last = m.index + m[0].length
      }
      text += para.slice(last)
      out.push({ key: `${p.id}:p:${i}`, paperId: p.id, kind: 'para', no: i + 1, text, n: norm(text), facts })
    })
    if (p.caption) out.push({ key: `${p.id}:c`, paperId: p.id, kind: 'caption', no: p.tableNo, text: p.caption, n: norm(p.caption), facts: [] })
  }
  return out
}

const NUM = /^\d+(?:\.\d+)?$/
const byScore = (a: Hit, b: Hit) => b.score - a.score

export const levelOf: Record<Issue['level'], string> = { doubt: 'Сомнение', conflict: 'Противоречие', warn: 'Предупреждение' }

export function searchAll(words: string[], ctx: Ctx): Record<Exclude<Scope, 'all'>, Hit[]> {
  const any = words.length > 0
  const out: Record<Exclude<Scope, 'all'>, Hit[]> = { project: [], paper: [], text: [], fact: [], issue: [], chat: [], command: [] }
  const issuesBy = new Map<string, number>()
  const worst = new Map<string, Issue['level']>()
  for (const i of ctx.issues) {
    issuesBy.set(i.paperId, (issuesBy.get(i.paperId) ?? 0) + 1)
    if (i.level === 'conflict' || !worst.has(i.paperId)) worst.set(i.paperId, i.level)
  }
  const projectName = (paperId: string) => projectOf(chatOfPaper(paperId)?.projectId)?.name

  for (const p of sortedProjects()) {
    const col = COLLECTIONS[p.collection].name
    const s = scoreN([[norm(p.name), 5], [norm(p.note), 2], [norm(col), 1]], words)
    if (any && !s) continue
    const n = chatsOf(p.id).length
    out.project.push({ id: 'p:' + p.id, kind: 'project', ref: p.id, title: p.name, meta: `${col} · ${n} ${plural(n, ['чат', 'чата', 'чатов'])}`, icon: 'folder', score: s })
  }

  for (const p of state.papers) {
    const pn = projectName(p.id)
    const s = scoreN([[norm(p.title), 5], [norm(p.authors), 2], [norm(p.journal), 2], [norm(p.tags), 2], [String(p.year), 2], [norm(pn ?? ''), 1]], words)
    if (any && !s) continue
    const q = issuesBy.get(p.id) ?? 0
    const facts = state.facts.filter((f) => f.paperId === p.id).length
    out.paper.push({
      id: 'a:' + p.id, kind: 'paper', ref: p.id, title: p.title, icon: 'doc', score: s, paperId: p.id,
      meta: p.processing < 100
        ? `разбор ${Math.floor(p.processing)}%`
        : `${pn ?? 'Без проекта'} · ${p.year} · ${facts} ${plural(facts, ['факт', 'факта', 'фактов'])}`,
      count: q || undefined,
      dot: q ? worst.get(p.id) : undefined,
    })
  }

  if (any) {
    for (const e of ctx.index) {
      const s = scoreN([[e.n, 1]], words)
      if (!s) continue
      const sn = snippet(e.text, words, 60, 14)
      let factId: string | undefined
      let d = Infinity
      for (const f of e.facts) if (Math.abs(f.pos - sn.at) < d) { d = Math.abs(f.pos - sn.at); factId = f.id }
      out.text.push({
        id: 't:' + e.key, kind: 'text', ref: e.key, title: sn.text, icon: 'book', paperId: e.paperId, factId,
        meta: paperOf(e.paperId)?.title ?? '', score: s + (e.kind === 'caption' ? 0.5 : 0),
      })
    }
  }

  const textWords = words.filter((w) => !NUM.test(w))
  const numWords = words.filter((w) => NUM.test(w))
  for (const f of state.facts) {
    if (f.status === 'rejected') continue
    const p = paperOf(f.paperId)
    if (!p || p.processing < 100) continue
    const label = labelOf(f)
    const sample = rowLabel(p, f.row)
    const disp = display(f)
    let s = 0
    if (textWords.length) {
      const main: [string, number][] = [[norm(label), 4], [norm(sample), 3], [norm(disp), 3], [norm(f.raw), 3]]
      if (!textWords.some((w) => main.some(([n]) => wordScore(n, w) > 0))) continue
      s = scoreN([...main, [norm(p.title), 0.5]], textWords)
      if (!s) continue
    }
    if (numWords.length) {
      const toks = [...norm(`${disp} ${f.raw}`).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
      let ns = 0
      let ok = true
      for (const w of numWords) {
        const best = toks.reduce((b, t) => (t === w ? 6 : t.startsWith(w) ? Math.max(b, 4) : b), 0)
        if (!best) { ok = false; break }
        ns += best
      }
      if (!ok) continue
      s += ns
    }
    out.fact.push({
      id: 'f:' + f.id, kind: 'fact', ref: f.id, title: `${label} · ${sample}`, value: disp, icon: 'layers',
      meta: p.title, score: s, paperId: p.id, factId: f.id,
    })
  }

  for (const i of ctx.issues) {
    const p = paperOf(i.paperId)
    const s = scoreN([[norm(i.title), 4], [norm(i.text), 2], [norm(p?.title ?? ''), 0.5]], words)
    if (any && !s) continue
    out.issue.push({ id: 'i:' + i.id, kind: 'issue', ref: i.id, title: i.title, meta: p?.title ?? '', icon: 'warn', dot: i.level, score: s, paperId: i.paperId, factId: i.factIds[0] })
  }

  for (const c of [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (c.kind !== 'ask') continue
    const s = scoreN([[norm(c.title), 4], [norm(c.turns.map((t) => t.q).join(' \n ')), 2]], words)
    if (any && !s) continue
    out.chat.push({ id: 'c:' + c.id, kind: 'chat', ref: c.id, title: c.title, meta: projectOf(c.projectId)?.name ?? 'Без проекта', icon: 'chat', score: s })
  }

  for (const c of ctx.commands) {
    const s = scoreN([[norm(c.title), 4], [norm(c.keywords), 2], [norm(c.desc), 1]], words)
    if (any && !s) continue
    out.command.push({ id: 'k:' + c.id, kind: 'command', ref: c.id, title: c.title, meta: c.keys ? keyText(c.keys) : '', icon: c.icon, score: s })
  }

  if (any) for (const k of ORDER) out[k].sort(byScore)
  out.text = out.text.slice(0, 60)
  return out
}

export type CScope = 'all' | 'paper' | 'run' | 'value' | 'cond' | 'issue' | 'command'
export type CKind = Exclude<CScope, 'all'> | 'more' | 'recent'
export const CSCOPES: { id: CScope; label: string; prefix?: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'paper', label: 'Статьи' },
  { id: 'run', label: 'Разборы' },
  { id: 'value', label: 'Значения', prefix: '=' },
  { id: 'cond', label: 'Условия' },
  { id: 'issue', label: 'Замечания', prefix: '!' },
  { id: 'command', label: 'Команды', prefix: '/' },
]
export const CORDER: Exclude<CScope, 'all'>[] = ['paper', 'run', 'value', 'cond', 'issue', 'command']
export const CLIMITS: Record<Exclude<CScope, 'all'>, number> = { paper: 5, run: 3, value: 6, cond: 5, issue: 3, command: 4 }
export const CTITLE: Record<Exclude<CScope, 'all'>, string> = { paper: 'Статьи', run: 'Разборы', value: 'Значения', cond: 'Конфигурации и датасеты', issue: 'Замечания', command: 'Команды' }

export interface CHit {
  id: string
  kind: CKind
  ref: string
  title: string
  meta: string
  value?: string
  icon: string
  dot?: boolean
  score: number
  pid?: string
  domain?: 'rag'
  query?: Record<string, string>
}

export function runOfPaper(pid: string, prefer?: string): string {
  if (prefer && runPapers(prefer).includes(pid)) return prefer
  return runs.find((r) => runPapers(r.id).includes(pid))?.id ?? ''
}

export interface CaseSearchOpts {
  pids?: Set<string>
  here?: Set<string>
}

export function searchCase(words: string[], commands: Cmd[], o: CaseSearchOpts = {}): Record<Exclude<CScope, 'all'>, CHit[]> {
  const any = words.length > 0
  const out: Record<Exclude<CScope, 'all'>, CHit[]> = { paper: [], run: [], value: [], cond: [], issue: [], command: [] }
  const inSet = (pid: string) => !o.pids || o.pids.has(pid)
  const from = (pid: string) => {
    if (!o.here || o.here.has(pid)) return ''
    const r = runs.find((x) => x.id === runOfPaper(pid))
    return r ? ` · из «${r.title}»` : ''
  }

  const seen = new Set<string>()
  const issuesBy = new Map<string, number>()
  for (const i of allIssues()) if (isIssueOpen(i.publication_id, i.issue_id)) issuesBy.set(i.publication_id, (issuesBy.get(i.publication_id) ?? 0) + 1)
  for (const p of publications()) {
    seen.add(p.publication_id)
    if (!inSet(p.publication_id)) continue
    const s = scoreN([[norm(p.publication_id), 6], [norm(p.title), 5], [norm(p.authors), 2], [p.year, 2], [norm(p.DOI), 1]], words)
    if (any && !s) continue
    const n = issuesBy.get(p.publication_id) ?? 0
    out.paper.push({
      id: 'a:' + p.publication_id, kind: 'paper', ref: p.publication_id, pid: p.publication_id, title: `${p.publication_id} · ${p.title}`, icon: 'doc', score: s,
      meta: [p.year, p.in_scope === 'false' ? 'не по теме' : n ? `${n} ${plural(n, ['замечание', 'замечания', 'замечаний'])}` : ''].filter(Boolean).join(' · ') + from(p.publication_id), dot: n > 0,
    })
  }
  for (const r of runs) for (const f of r.files) {
    if (seen.has(f.id) || f.reason === 'не PDF' || !inSet(f.id)) continue
    seen.add(f.id)
    const s = scoreN([[norm(f.id), 6], [norm(f.name), 3]], words)
    if (any && !s) continue
    out.paper.push({ id: 'a:' + f.id, kind: 'paper', ref: f.id, pid: f.id, title: f.name, icon: 'doc', score: s, meta: r.title })
  }

  for (const r of [...runs].sort((a, b) => b.createdAt - a.createdAt)) {
    const s = scoreN([[norm(r.title), 5]], words)
    if (any && !s) continue
    const n = r.files.length
    out.run.push({ id: 'r:' + r.id, kind: 'run', ref: r.id, title: r.title, meta: `${n} ${plural(n, ['файл', 'файла', 'файлов'])}`, icon: 'folder', score: s })
  }

  if (any) {
    const NUMW = /^\d+(?:\.\d+)?$/
    const textW = words.filter((w) => !NUMW.test(w))
    const numW = words.filter((w) => NUMW.test(w))
    for (const r of allResults()) {
      if (!inSet(r.publication_id)) continue
      let s = 0
      if (textW.length) {
        const dev = r.device_id ? deviceName(r.publication_id, r.device_id) : ''
        s = scoreN([[norm(metricLabel(r.metric_name)), 4], [norm(r.metric_name), 4], [norm(r.publication_id), 3], [norm(dev), 2]], textW)
        if (!s) continue
      }
      if (numW.length) {
        const toks = [...norm(`${r.normalized_value} ${r.raw_value} ${r.metric_value}`).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
        let ns = 0
        let ok = true
        for (const w of numW) {
          const best = toks.reduce((b, t) => (t === w ? 6 : t.startsWith(w) ? Math.max(b, 4) : b), 0)
          if (!best) { ok = false; break }
          ns += best
        }
        if (!ok) continue
        s += ns
      }
      out.value.push({
        id: 'v:' + r.publication_id + ':' + r.result_id, kind: 'value', ref: r.result_id, pid: r.publication_id,
        title: `${metricLabel(r.metric_name)} · ${r.publication_id}`, value: fmtValue(r),
        meta: [r.device_id ? deviceName(r.publication_id, r.device_id) : '', placeOf(r) || fmtRaw(r)].filter(Boolean).join(' · ') + from(r.publication_id), icon: 'table', score: s,
      })
    }
  }

  for (const i of allIssues()) {
    if (!inSet(i.publication_id)) continue
    const s = scoreN([[norm(checkLabel(i.check_name)), 4], [norm(i.description), 2], [norm(i.publication_id), 3]], words)
    if (any && !s) continue
    out.issue.push({
      id: 'i:' + i.publication_id + ':' + i.issue_id, kind: 'issue', ref: i.issue_id, pid: i.publication_id, title: checkLabel(i.check_name),
      meta: `${i.publication_id}${i.source_page ? ' · стр. ' + i.source_page : ''}${isIssueOpen(i.publication_id, i.issue_id) ? '' : ' · закрыто'}${from(i.publication_id)}`, icon: 'warn', dot: isIssueOpen(i.publication_id, i.issue_id), score: s,
    })
  }

  for (const c of commands) {
    const s = scoreN([[norm(c.title), 4], [norm(c.keywords), 2], [norm(c.desc), 1]], words)
    if (any && !s) continue
    out.command.push({ id: 'k:' + c.id, kind: 'command', ref: c.id, title: c.title, meta: c.keys ? keyText(c.keys) : '', icon: c.icon, score: s })
  }

  if (any) for (const k of CORDER) out[k].sort((a, b) => b.score - a.score)
  out.value = out.value.slice(0, 80)
  return out
}
export const paperName = (pid: string) => publication(pid)?.title ?? pid
