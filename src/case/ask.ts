import {
  CLASS_RU, METRICS, NODATA_TEXT, bestAmong, bestOf, bestRowOf, checkLabel, deviceName, isBetter, lowerIsBetter, device, devicesOf, fmtValue, hasData, inScope, issuesOf, layersOf, material, materialsOf,
  measurement, metricLabel, num, placeOf, publication, resultsOf, reviewOf, unitRu, valueOf,
} from './index'
import type { IssueRow, ResultRow } from './types'
import { answerRag, suggestionsForRag } from './askRag'
import { isTableQuestion, tableAnswer, tableSuggestion } from './askTables'
import { ragHasData, ragLoadAll } from './rag'
import { fmtInt } from '../fmt'

export interface CaseCite { pid: string; rid?: string; iid?: string; table?: string; row?: string; page?: string; label: string; domain?: 'rag'; url?: string }
export interface RagTableRow { cells: string[]; pid?: string; rid?: string; best?: boolean }
export type CaseCard =
  | { kind: 'results'; title: string; rows: { pid: string; rid: string }[] }
  | { kind: 'compare'; title: string; pids: string[]; metrics: string[] }
  | { kind: 'issues'; title: string; items: { pid: string; iid: string }[]; domain?: 'rag' }
  | { kind: 'ragTable'; title: string; cols: string[]; rows: RagTableRow[]; note?: string }
  | { kind: 'ragPaper'; pid: string }
  | { kind: 'paper'; pid: string }
  | { kind: 'tableRows'; title: string; table: string; cols: string[]; rows: { pid: string; id: string; cells: string[] }[]; domain: 'solar' | 'rag' }
  | { kind: 'schema'; title: string; table: string; fields: { name: string; ru: string; required: boolean; desc: string; ref?: string }[] }
  | { kind: 'fix'; title: string; domain?: 'solar' | 'rag'; items: { pid: string; rid: string; metric: string; current: number; suggested: number; unit?: string; reason?: string }[] }
export interface CaseAnswer { text: string; cards: CaseCard[]; cites: CaseCite[]; suggestions: string[] }

export function ruText(s: string): string {
  const fix = (t: string) => t
    .replace(/Верная нормализация\s*[—-]\s*/g, 'Правильно записать как ')
    .replace(/\bsupplementary\s+/gi, 'доп. ')
    .replace(/\btable\s*(?=S?\d)/gi, 'табл. ')
    .replace(/\b(?:figure|fig\.?)\s*(?=S?\d)/gi, 'рис. ')
    .replace(/(?<!AM)(\d)\.(\d)/g, '$1,$2')
    .replace(/(\d)\s*W\/m2\b/g, '$1 Вт/м²')
    .replace(/(\d)\s*m[AА]\/(?:cm|см)2/g, '$1 мА/см²')
    .replace(/(\d)\s*mV\b/g, '$1 мВ')
    .replace(/(\d)\s*V\b/g, '$1 В')
    .replace(/(\d)\s*nm\b/g, '$1 нм')
    .replace(/(\d)\s*h\b/g, '$1 ч')
    .replace(/\bPCE\b/g, 'КПД')
  return s.split(/(«[^»]*»)/).map((p) => (p.startsWith('«') ? p : fix(p))).join('')
}

export { bestOf, lowerIsBetter }

export function classOfResult(r: ResultRow): string {
  const m = r.material_id && material(r.publication_id, r.material_id)
  if (m && m.material_class) return m.material_class
  const d = r.device_id && device(r.publication_id, r.device_id)
  const dm = d && d.absorber_material_id && material(r.publication_id, d.absorber_material_id)
  if (dm && dm.material_class) return dm.material_class
  return classOfPaper(r.publication_id)
}
export function classOfPaper(pid: string): string {
  const cnt = new Map<string, number>()
  for (const m of materialsOf(pid)) if (m.material_class) cnt.set(m.material_class, (cnt.get(m.material_class) ?? 0) + (m.material_class === 'other' ? 0.1 : 1))
  let best = '', n = 0
  for (const [k, v] of cnt) if (v > n) { best = k; n = v }
  return best
}

function usable(pid: string, origin: 'primary' | 'cited' = 'primary'): ResultRow[] {
  return resultsOf(pid).filter((r) =>
    (METRICS as readonly string[]).includes(r.metric_name) &&
    r.extraction_status === 'extracted' &&
    !r.duplicate_of &&
    r.result_origin === origin &&
    reviewOf(pid, r.result_id).status !== 'rejected' &&
    valueOf(r) != null,
  )
}
const better = isBetter
const pickBest = bestAmong
const cellOf = (pid: string, metric: string) => bestRowOf(pid, [metric]).cells[metric]

export function compareTable(pids: string[], metrics: string[]) {
  const cells = pids.map((pid) => { const row = bestRowOf(pid, metrics); return metrics.map((m) => row.cells[m]) })
  const top = metrics.map((m, j) => {
    let b: number | null = null
    for (const row of cells) {
      const v = row[j] ? valueOf(row[j]!) : null
      if (v != null && (b == null || better(m, v, b))) b = v
    }
    const filled = cells.filter((row) => row[j]).length
    return filled > 1 ? b : null
  })
  const notes: string[] = []
  const classes = [...new Set(pids.map(classOfPaper).filter(Boolean))]
  if (classes.length > 1) notes.push('разные классы материалов: ' + classes.map((c) => CLASS_RU[c] ?? c).join(', '))
  const pce = pids.map((pid) => bestOf(pid, 'PCE')).filter((r): r is ResultRow => !!r)
  const cond = new Set<string>()
  const types = new Set<string>()
  for (const r of pce) {
    const ms = r.measurement_id ? measurement(r.publication_id, r.measurement_id) : undefined
    if (ms && (ms.spectrum || ms.light_intensity)) cond.add(`${ms.spectrum}|${ms.light_intensity}|${ms.intensity_unit}`)
    const d = r.device_id ? device(r.publication_id, r.device_id) : undefined
    if (d && d.device_type) types.add(d.device_type)
  }
  if (cond.size > 1) notes.push('разные условия освещения')
  if (types.size > 1) notes.push('разные типы приборов')
  return { cells, top, notes }
}

export function paperSummary(pid: string) {
  const p = publication(pid)
  return {
    pid,
    title: p?.title ?? pid,
    year: p?.year ?? '',
    cls: classOfPaper(pid),
    inScope: inScope(pid),
    reason: p?.exclusion_reason ?? '',
    values: usable(pid).length,
    issues: issuesOf(pid).length,
    best: bestOf(pid, 'PCE'),
  }
}

const low = (s: string) =>
  s.toLowerCase().replace(/ё/g, 'е').replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4').replace(/\s+/g, ' ').trim()
const W = '(?<![a-zа-я0-9])'
const re = (src: string) => new RegExp(src.replace(/\\W/g, W), 'i')

const METRIC_RULES: [string, RegExp][] = [
  ['retained_PCE', re('\\Wсохран[а-я]* (кпд|эффективн)|\\Wretained|\\Wостаточн[а-я]* кпд')],
  ['stabilized_PCE', re('\\Wстабилизир|\\Wstabilized')],
  ['Jsc_EQE', re('jsc[ _]?(по )?eqe|\\Weqe')],
  ['T80', re('\\Wt80|\\Wстабильн|\\Wдеградац|\\Wсрок службы|\\Wресурс')],
  ['HI', re('\\Wгистерезис|\\Whi(?![a-z])|\\Whysteresis')],
  ['Rsh', re('\\Wrsh|\\Wшунт|\\Wпараллельн[а-я]* сопротивл')],
  ['Rs', re('\\Wrs(?![a-z])|\\Wпоследовательн[а-я]* сопротивл')],
  ['FF', re('\\Wff(?![a-z])|\\Wфактор[а-я]* заполн|\\Wкоэффициент[а-я]* заполн|\\Wfill factor')],
  ['Jsc', re('\\Wjsc|\\Wisc|\\Wток|\\Wплотност[а-я]* тока')],
  ['Voc', re('\\Wvoc|\\Wuoc|\\Wнапряжен|\\Wхолост')],
  ['PCE', re('\\Wкпд|\\Wpce|\\Wэффективн|\\Wefficien')],
]
const CLASS_RULES: [string, RegExp][] = [
  ['perovskite', re('\\Wперовскит|\\Wperovsk')],
  ['CIGS', re('\\Wcigs|\\Wcu\\(in|\\Wcuinga|\\Wмедь-индий')],
  ['CdTe', re('\\Wcdte|\\Wтеллурид кадми|\\Wтеллурид[а-я]* кадми')],
  ['kesterite', re('\\Wкестерит|\\Wkesterit|\\Wczts')],
  ['Sb2Se3', re('\\Wsb2se3|\\Wsb2\\(s|\\Wselenide|\\Wселенид[а-я]* сурьм|\\Wсурьм|\\Wантимон')],
  ['thin-film Si', re('\\Wкремни|\\Wa-si|\\Wsilicon|\\Wsi(?![a-z0-9])')],
]
const NOT_LAYER = new Set([
  'pce', 'voc', 'uoc', 'jsc', 'isc', 'ff', 'rs', 'rsh', 'hi', 't80', 'eqe', 'cigs', 'cdte', 'czts', 'cztse', 'cztsse', 'sb2se3', 'si', 'a-si',
  'vs', 'pdf', 'cited', 'retained', 'stabilized', 'efficiency', 'champion', 'best', 'max', 'mean', 'perovskite', 'kesterite', 'silicon', 'hysteresis',
])

const escRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
interface Parsed {
  raw: string
  q: string
  codes: string[]
  metrics: string[]
  classes: string[]
  layers: string[]
  min?: number
  max?: number
  incl: boolean
  best: boolean
  worst: boolean
  avg: boolean
  cited: boolean
  intent: 'source' | 'issues' | 'out' | 'compare' | 'count' | 'metric' | 'paper' | 'list' | 'unknown'
}

function parse(question: string): Parsed {
  const q = low(question)
  const codes = [...new Set((q.match(/(?<![a-z0-9])[dp]\d{3}(?![0-9])/gi) ?? []).map((c) => c.toUpperCase()))]
  const metrics: string[] = []
  for (const [m, rx] of METRIC_RULES) if (rx.test(q)) metrics.push(m)
  if (metrics.includes('PCE') && (metrics.includes('retained_PCE') || metrics.includes('stabilized_PCE'))) metrics.splice(metrics.indexOf('PCE'), 1)
  if (metrics.includes('Jsc') && metrics.includes('Jsc_EQE')) metrics.splice(metrics.indexOf('Jsc'), 1)
  if (metrics.includes('T80') && !metrics.includes('retained_PCE') && /стабильн|деградац/.test(q)) metrics.push('retained_PCE')
  const classes = CLASS_RULES.filter(([, rx]) => rx.test(q)).map(([c]) => c)

  const layers: string[] = []
  const stripped = q.replace(/(?<![a-z0-9])[dp]\d{3}(?![0-9])/gi, ' ')
  for (const tok of stripped.match(/[a-z][a-z0-9\-:()]*[a-z0-9)]|[a-z]{2,}/gi) ?? []) {
    const t = tok.replace(/[()]+$/, '').toLowerCase()
    if (t.length < 2 || NOT_LAYER.has(t) || /[(),]/.test(t)) continue
    if (CLASS_RULES.some(([, rx]) => rx.test(' ' + t))) continue
    if (!layers.includes(t)) layers.push(t)
  }
  if (/(?<![а-я])углерод/.test(q)) layers.push('carbon')
  if (/(?<![а-я])графен/.test(q)) layers.push('graphene')
  if (/(?<![а-я])золот/.test(q)) layers.push('au')
  if (/(?<![а-я])серебр/.test(q)) layers.push('ag')

  const numq = stripped.replace(/[a-zа-я]+\d[a-z0-9]*/gi, ' ').replace(/(\d),(\d)/g, '$1.$2')
  let min: number | undefined, max: number | undefined, incl = false
  const range = numq.match(/(?:от|между)\s*(\d+(?:\.\d+)?)\s*(?:%|в|мв|ма\/см2)?\s*(?:до|и)\s*(\d+(?:\.\d+)?)/) ?? numq.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/)
  if (range) { min = Math.min(+range[1]!, +range[2]!); max = Math.max(+range[1]!, +range[2]!); incl = true }
  else {
    for (const m of numq.matchAll(/(не\s+ниже|не\s+меньше|не\s+менее|не\s+выше|не\s+больше|не\s+более|выше|больше|более|свыше|превыша[а-я]*|ниже|меньше|менее|>=|<=|≥|≤|>|<|(?<![а-я])от|(?<![а-я])до)\s*(?:чем\s*)?(\d+(?:\.\d+)?)/g)) {
      const op = m[1]!, n = +m[2]!
      const up = /^(не\s+(ниже|меньше|менее)|выше|больше|более|свыше|превыш|>|≥|от)/.test(op)
      if (/^(не|>=|<=|≥|≤|от|до)/.test(op)) incl = true
      if (up) min = n
      else max = n
    }
  }
  if (metrics[0] === 'Voc') { if (min != null && min > 10) min /= 1000; if (max != null && max > 10) max /= 1000 }

  const best = /лучш|максим|рекорд|наибольш|наивысш|самы[йе] (высок|больш)|самое высок|чемпион|champion|(?<![a-z])(best|max|top)(?![a-z])|топ/.test(q)
  const worst = /худш|миним|наименьш|самы[йе] (низк|мал)|самое низк/.test(q)
  const avg = /средн|в среднем|mean|average/.test(q)
  const cited = /цитир|из литератур|чуж[а-я]* (работ|значен)|из других (работ|статей)|cited/.test(q)

  let intent: Parsed['intent'] = 'unknown'
  const where = /где (написан|указан|взят|сказан|приведен|найден|упомина|сказано)|источник|откуда|покажи (место|в статье|в pdf|где)|на какой странице|какая страница|(?<![а-я])цитат(?!ир)/.test(q)
  const bareWhere = /(?<![а-я])где(?![а-я])/.test(q) && codes.length > 0 && metrics.length > 0
  if ((where && (metrics.length || codes.length)) || bareWhere) intent = 'source'
  else if (/замечан|ошибк|проблем|противореч|не сход|несоглас|нестыков|проверк|подозрит|issue/.test(q)) intent = 'issues'
  else if (/вне област|не по тем|исключ|не относ|вне рамок|отброш|не в област|out of scope|вне темы/.test(q)) intent = 'out'
  else if (/сравн|сопостав|(?<![a-z])vs(?![a-z])|против|разниц|отлича|чем [а-я]+ лучше/.test(q)) intent = 'compare'
  else if (/сколько|количеств|число (значен|стат|результ)/.test(q)) intent = 'count'
  else if (metrics.length || min != null || max != null || best || worst || avg) intent = 'metric'
  else if (codes.length) intent = 'paper'
  else if (classes.length || layers.length || /какие статьи|список статей|все статьи|статьи разбор|о ч[её]м/.test(q)) intent = 'list'
  return { raw: question, q, codes, metrics, classes, layers, min, max, incl, best, worst, avg, cited, intent }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const CLASS_AT: Record<string, string> = {
  perovskite: 'перовскиты', CIGS: 'CIGS', CdTe: 'CdTe', kesterite: 'кестериты', Sb2Se3: 'Sb₂Se₃', 'thin-film Si': 'тонкоплёночный кремний', other: 'другое',
}
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
const nStat = (n: number) => `${n} ${plural(n, 'статья', 'статьи', 'статей')}`
const nVal = (n: number) => `${fmtInt(n)} ${plural(n, 'значение', 'значения', 'значений')}`
const nIss = (n: number) => `${n} ${plural(n, 'замечание', 'замечания', 'замечаний')}`
const codesList = (pids: string[], max = 6) => pids.slice(0, max).join(', ') + (pids.length > max ? ` и ещё ${pids.length - max}` : '')
const unitOf = (metric: string) => {
  const units: Record<string, string> = { PCE: '%', FF: '%', HI: '%', retained_PCE: '%', stabilized_PCE: '%', Voc: 'V', Jsc: 'mA/cm2', Jsc_EQE: 'mA/cm2', Rs: 'Ohm*cm2', Rsh: 'Ohm*cm2', T80: 'h' }
  const r = units[metric]
  return r ? ' ' + unitRu(r) : ''
}

class Builder {
  cites: CaseCite[] = []
  cards: CaseCard[] = []
  cite(r: ResultRow): string {
    const i = this.cites.findIndex((c) => c.pid === r.publication_id && c.rid === r.result_id)
    if (i >= 0) return `[${i + 1}]`
    this.cites.push({
      pid: r.publication_id, rid: r.result_id, page: r.source_page || undefined,
      label: [r.publication_id, r.device_id && deviceName(r.publication_id, r.device_id), `${metricLabel(r.metric_name)} ${fmtValue(r)}`, 'results · ' + r.result_id, placeOf(r)].filter(Boolean).join(' · '),
    })
    return `[${this.cites.length}]`
  }
  citeIssue(i: IssueRow): string {
    this.cites.push({ pid: i.publication_id, iid: i.issue_id, page: i.source_page || undefined, label: [i.publication_id, checkLabel(i.check_name), i.source_page && 'стр. ' + i.source_page].filter(Boolean).join(' · ') })
    return `[${this.cites.length}]`
  }
  val(r: ResultRow, withPaper = true) {
    return `${fmtValue(r)}${withPaper ? ' у ' + r.publication_id : ''} ${this.cite(r)}`
  }
  done(text: string, suggestions: string[]): CaseAnswer {
    return { text, cards: this.cards, cites: this.cites, suggestions: suggestions.slice(0, 3) }
  }
}

function select(p: Parsed, pids: string[], metric: string | null): ResultRow[] {
  const layerDevices = new Map<string, Set<string>>()
  if (p.layers.length) {
    for (const pid of pids) {
      const ids = new Set<string>()
      for (const l of layersOf(pid)) {
        const mat = l.layer_material.toLowerCase()
        if (p.layers.some((t) => new RegExp(`(?<![a-z])${escRx(t)}x?(?![a-z])`, 'i').test(mat))) ids.add(l.device_id)
      }
      layerDevices.set(pid, ids)
    }
  }
  const out: ResultRow[] = []
  for (const pid of pids) {
    for (const r of usable(pid, p.cited ? 'cited' : 'primary')) {
      if (metric && r.metric_name !== metric) continue
      if (p.classes.length && !p.classes.includes(classOfResult(r))) continue
      if (p.layers.length && !layerDevices.get(pid)?.has(r.device_id)) continue
      const v = valueOf(r)!
      if (p.min != null && !(v > p.min || (p.incl && v === p.min))) continue
      if (p.max != null && !(v < p.max || (p.incl && v === p.max))) continue
      out.push(r)
    }
  }
  return out
}
function perPaperBest(rows: ResultRow[], metric: string, worst = false): ResultRow[] {
  const by = new Map<string, ResultRow[]>()
  for (const r of rows) by.set(r.publication_id, [...(by.get(r.publication_id) ?? []), r])
  const res: ResultRow[] = []
  for (const list of by.values()) {
    const b = worst ? list.reduce((w, r) => (better(metric, valueOf(w)!, valueOf(r)!) ? r : w)) : pickBest(list, metric)
    if (b) res.push(b)
  }
  return sortRows(res, metric)
}
function sortRows(rows: ResultRow[], metric: string) {
  const s = [...rows].sort((a, b) => valueOf(b)! - valueOf(a)!)
  return lowerIsBetter(metric) ? s.reverse() : s
}
function scopeOf(p: Parsed, metric: string | null): string {
  const parts: string[] = []
  if (p.classes.length) parts.push(p.classes.map((c) => CLASS_AT[c] ?? c).join(' и '))
  if (p.layers.length) parts.push('слой ' + p.layers.map((l) => p.raw.match(new RegExp(escRx(l), 'i'))?.[0] ?? l).join(', '))
  const u = metric ? unitOf(metric) : ''
  if (p.min != null && p.max != null) parts.push(`от ${num(p.min)} до ${num(p.max)}${u}`)
  else if (p.min != null) parts.push(`выше ${num(p.min)}${u}`)
  else if (p.max != null) parts.push(`ниже ${num(p.max)}${u}`)
  if (p.cited) parts.push('цитируемые')
  return parts.join(', ')
}

export function suggestionsFor(pids: string[], domain: 'solar' | 'rag' = 'solar'): string[] {
  if (domain === 'rag') return [...suggestionsForRag(pids).slice(0, 3), tableSuggestion('rag')]
  const data = pids.filter((p) => hasData(p) && inScope(p))
  if (!data.length) return []
  const ranked = data.map((pid) => ({ pid, r: bestOf(pid, 'PCE') })).filter((x) => x.r).sort((a, b) => valueOf(b.r!)! - valueOf(a.r!)!)
  const out: string[] = []
  out.push('Лучший КПД')
  const byIss = [...data].sort((a, b) => issuesOf(b).length - issuesOf(a).length)
  if (ranked.length >= 2) {
    const cls = classOfPaper(ranked[0]!.pid)
    const pair = ranked.find((x, i) => i > 0 && classOfPaper(x.pid) === cls) ?? ranked[1]!
    out.push(`Сравни ${ranked[0]!.pid} и ${pair.pid}`)
  }
  if (byIss[0] && issuesOf(byIss[0]).length) out.push(`Замечания у ${byIss[0]}`)
  if (out.length < 3 && pids.some((p) => hasData(p) && !inScope(p))) out.push('Какие статьи не по теме')
  if (out.length < 3) out.push('Сколько значений')
  return [...out.slice(0, 3), tableSuggestion('solar')]
}

const bestPce = (pid: string) => { const r = bestOf(pid, 'PCE'); return (r && valueOf(r)) ?? -1 }

const samePair = (x: string, skip?: string[]) => {
  const m = /^Сравни (\S+) и (\S+)$/.exec(x)
  return !!m && !!skip && skip.includes(m[1]!) && skip.includes(m[2]!)
}
function followUps(pids: string[], focus?: string, metric = 'PCE', skip?: string[]): string[] {
  const base = suggestionsFor(pids).filter((x) => !samePair(x, skip))
  if (!focus) return base
  const s = [`Где написано ${metricLabel(metric)} ${focus}`]
  if (issuesOf(focus).length) s.push(`Замечания у ${focus}`)
  const other = base.find((x) => x.startsWith('Сравни') && !x.includes(focus))
  const cmp = pids.filter((p) => p !== focus && hasData(p) && inScope(p) && classOfPaper(p) === classOfPaper(focus))
    .sort((a, b) => bestPce(b) - bestPce(a))
  const next = cmp.find((x) => !skip?.includes(x) && bestOf(x, 'PCE'))
  if (next) s.push(`Сравни ${focus} и ${next}`)
  else if (other) s.push(other)
  for (const x of base) if (s.length < 3 && !s.includes(x)) s.push(x)
  return s.slice(0, 3)
}

const HELP = ['Лучший КПД перовскитов', 'КПД выше 15 %', 'Какие статьи не по теме']

export async function answer(question: string, pids: string[], domain: 'solar' | 'rag' = 'solar'): Promise<CaseAnswer> {
  if (isTableQuestion(question, domain)) {
    if (domain === 'rag') await ragLoadAll(pids.filter(ragHasData))
    else await wait(200)
    const a = tableAnswer(question, pids, domain)
    if (a) return a
  }
  if (domain === 'rag') return answerRag(question, pids)
  await wait(300)
  return answerNow(question, pids)
}

export function answerNow(question: string, pids: string[]): CaseAnswer {
  const b = new Builder()
  const all = [...new Set(pids)]
  const data = all.filter(hasData)
  const scope = data.filter(inScope)
  const p = parse(question)

  if (!data.length) return b.done(`В этом разборе пока нет данных. ${NODATA_TEXT}.`, [])
  const help = suggestionsFor(all).length ? suggestionsFor(all) : HELP

  const missing = p.codes.filter((c) => !all.includes(c))
  if (p.codes.length && missing.length === p.codes.length) {
    return b.done(`${missing.length > 1 ? 'Статей' : 'Статьи'} ${missing.join(', ')} нет в этом разборе.`, help)
  }
  const codes = p.codes.filter((c) => all.includes(c))
  const target = codes.length ? codes.filter((c) => data.includes(c)) : scope
  const note = missing.length ? ` Статей ${missing.join(', ')} в разборе нет.` : ''
  const noData = codes.filter((c) => !hasData(c))
  if (codes.length && !target.length) return b.done(`${noData.join(', ')}: ${NODATA_TEXT.toLowerCase()}.`, help)

  switch (p.intent) {
    case 'source': {
      const metric = p.metrics[0] ?? 'PCE'
      const rows = select(p, target, metric)
      const r = pickBest(rows, metric)
      if (!r) return b.done(`${metricLabel(metric)}${codes.length ? ' у ' + codes.join(', ') : ''} в разборе не найден.${note}`, followUps(all, codes[0], metric))
      const where = placeOf(r) || 'место не указано'
      const row = /,\s*строка\s+(.+)$/i.exec(r.source_fragment ?? '')?.[1]?.trim()
      const frag = row
        ? ` Строка таблицы — «${/^pristine$/i.test(row) ? 'без добавки (pristine)' : row}».`
        : r.source_fragment ? ` В статье: «${r.source_fragment.length > 160 ? r.source_fragment.slice(0, 157) + '…' : r.source_fragment}».` : ''
      const others = sortRows(rows.filter((x) => x.publication_id === r.publication_id), metric)
      b.cards.push({ kind: 'results', title: `${metricLabel(metric)} · ${r.publication_id}`, rows: others.map((x) => ({ pid: x.publication_id, rid: x.result_id })) })
      return b.done(
        `${metricLabel(metric)} ${fmtValue(r)} у ${r.publication_id}${r.device_id ? ` (${deviceName(r.publication_id, r.device_id)})` : ''} — ${where} ${b.cite(r)}.${frag}${others.length > 1 ? ` Всего в статье ${nVal(others.length)} этого показателя.` : ''}${note}`,
        followUps(all, r.publication_id, metric),
      )
    }

    case 'issues': {
      const pool = (codes.length ? target : data).filter((pid) => !p.classes.length || p.classes.includes(classOfPaper(pid)))
      let items = pool.flatMap((pid) => issuesOf(pid))
      if (/противореч/.test(p.q)) items = items.filter((i) => i.check_name === 'contradiction')
      else if (p.metrics.includes('HI')) items = items.filter((i) => i.check_name === 'hysteresis_index')
      if (!items.length) return b.done(`Замечаний${codes.length ? ' у ' + codes.join(', ') : ''} нет.${note}`, followUps(all, codes[0]))
      const byCheck = new Map<string, number>()
      for (const i of items) byCheck.set(i.check_name, (byCheck.get(i.check_name) ?? 0) + 1)
      const top = [...byCheck].sort((a, b2) => b2[1] - a[1])
      const parts = top.slice(0, 3).map(([c, n]) => `${checkLabel(c).toLowerCase()} — ${n}`)
      const first = items[0]!
      const papers = new Set(items.map((i) => i.publication_id))
      b.cards.push({ kind: 'issues', title: 'Замечания', items: items.map((i) => ({ pid: i.publication_id, iid: i.issue_id })) })
      const who = codes.length === 1 ? `У ${codes[0]}` : `В ${papers.size} ${plural(papers.size, 'статье', 'статьях', 'статьях')}`
      if (items.length === 1) return b.done(`${who} одно замечание — ${checkLabel(first.check_name).toLowerCase()}, стр. ${first.source_page || '—'}: ${first.description.replace(/\.$/, '')} ${b.citeIssue(first)}.${note}`, followUps(all, first.publication_id))
      return b.done(
        `${who} ${nIss(items.length)}: ${parts.join(', ')}${top.length > 3 ? ' и другие' : ''}. Например, стр. ${first.source_page || '—'}: ${first.description.replace(/\.$/, '')} ${b.citeIssue(first)}.${note}`,
        followUps(all, codes[0] ?? first.publication_id),
      )
    }

    case 'out': {
      const out = data.filter((pid) => !inScope(pid))
      if (!out.length) return b.done(`Все ${nStat(data.length)} разбора по теме.`, help)
      for (const pid of out) b.cards.push({ kind: 'paper', pid })
      const reasons = out.map((pid) => `${pid} — ${(publication(pid)?.exclusion_reason || 'причина не указана').split(/(?<=[.;])\s/)[0]!.replace(/[.;]+$/, '')}`)
      return b.done(`Не по теме ${nStat(out.length)} из ${data.length}: ${reasons.join('; ')}.`, help)
    }

    case 'compare': {
      let cmp: string[]
      let title = 'Сравнение'
      if (codes.length >= 2) cmp = target
      else if (p.classes.length >= 2 || (codes.length === 0 && p.classes.length === 1)) {
        cmp = scope.filter((pid) => p.classes.includes(classOfPaper(pid)) && bestOf(pid, 'PCE'))
        title = 'Сравнение: ' + p.classes.map((c) => CLASS_AT[c] ?? c).join(' и ')
      } else if (codes.length === 1) {
        return b.done(`Для сравнения назовите две статьи, например «Сравни ${codes[0]} и ${scope.find((x) => x !== codes[0]) ?? 'D002'}».`, followUps(all, codes[0]))
      } else {
        cmp = scope.filter((pid) => bestOf(pid, 'PCE')).sort((a, c) => valueOf(bestOf(c, 'PCE')!)! - valueOf(bestOf(a, 'PCE')!)!).slice(0, 6)
        title = 'Сравнение: лучшие по КПД'
      }
      if (cmp.length < 2) return b.done('Для сравнения нужно хотя бы две статьи с данными.' + note, help)
      const metrics = [...new Set([...p.metrics, 'PCE', 'Voc', 'Jsc', 'FF'])].filter((m) => cmp.some((pid) => cellOf(pid, m)))
      b.cards.push({ kind: 'compare', title, pids: cmp, metrics })
      const main = p.metrics[0] ?? 'PCE'
      const ranked = sortRows(cmp.map((pid) => cellOf(pid, main)).filter((r): r is ResultRow => !!r), main)
      const t = compareTable(cmp, metrics)
      let text: string
      if (p.classes.length >= 2) {
        const perClass = p.classes.map((c) => {
          const r = sortRows(cmp.filter((pid) => classOfPaper(pid) === c).map((pid) => cellOf(pid, main)).filter((x): x is ResultRow => !!x), main)[0]
          return r ? `${CLASS_AT[c]} — до ${b.val(r)}` : `${CLASS_AT[c]} — нет данных`
        })
        text = `По показателю ${metricLabel(main)}: ${perClass.join('; ')}.`
      } else if (ranked.length >= 2) {
        const [a, z] = [ranked[0]!, ranked[ranked.length - 1]!]
        text = ranked.length === 2
          ? `По показателю ${metricLabel(main)} лучше ${a.publication_id}: ${b.val(a, false)} против ${b.val(z, false)} у ${z.publication_id}.`
          : `По показателю ${metricLabel(main)} лучшая — ${a.publication_id} (${b.val(a, false)}), последняя — ${z.publication_id} (${b.val(z, false)}).`
      } else text = `${metricLabel(main)} есть только у ${ranked[0]?.publication_id ?? 'одной статьи'}.`
      if (t.notes.length) text += ` Сравнивать осторожно: ${t.notes.join('; ')}.`
      return b.done(text + note, followUps(all, ranked[0]?.publication_id, main, cmp))
    }

    case 'count': {
      const metric = p.metrics[0] ?? null
      const filtered = !!(metric || p.classes.length || p.layers.length || p.min != null || p.max != null || codes.length || p.cited)
      const rows = select(p, target, metric)
      const papers = [...new Set(rows.map((r) => r.publication_id))]
      if (!filtered) {
        const iss = data.reduce((s, pid) => s + issuesOf(pid).length, 0)
        const out = data.length - scope.length
        const vals = scope.reduce((s, pid) => s + usable(pid).length, 0)
        const devs = scope.reduce((s, pid) => s + devicesOf(pid).length, 0)
        return b.done(`В разборе ${nStat(data.length)}${out ? `, из них ${out} не по теме` : ''}. Своих значений показателей — ${vals} (без повторов и цитат) у ${devs} ${plural(devs, 'прибора', 'приборов', 'приборов')}, замечаний — ${iss}.`, help)
      }
      const sc = scopeOf(p, metric)
      if (!rows.length) return b.done(`${metric ? metricLabel(metric) : 'Значений'}${sc ? ' (' + sc + ')' : ''}: ничего не нашлось.${note}`, help)
      if (/статей|статьи|статья/.test(p.q) && !/значени|результат|сколько раз/.test(p.q)) {
        b.cards.push({ kind: 'results', title: metric ? metricLabel(metric) : 'Значения', rows: perPaperBest(rows, metric ?? 'PCE').map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
        return b.done(`${nStat(papers.length)}${sc ? ' (' + sc + ')' : ''}${metric ? ' с показателем ' + metricLabel(metric) : ''}: ${codesList(papers)}.${note}`, help)
      }
      b.cards.push({ kind: 'results', title: metric ? metricLabel(metric) : 'Значения', rows: (metric ? sortRows(rows, metric) : rows).map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
      return b.done(`${nVal(rows.length).replace(/^./, (c) => c.toUpperCase())}${metric ? ' ' + metricLabel(metric) : ''}${sc ? ' (' + sc + ')' : ''} в ${papers.length} ${plural(papers.length, 'статье', 'статьях', 'статьях')}: ${codesList(papers)}.${note}`, help)
    }

    case 'metric': {
      const metric = p.metrics.find((m) => select(p, target, m).length) ?? p.metrics[0] ?? 'PCE'
      const skipped = p.metrics.slice(0, Math.max(0, p.metrics.indexOf(metric))).map(metricLabel)
      const rows = select(p, target, metric)
      const sc = scopeOf(p, metric)
      const label = metricLabel(metric)
      const pre = skipped.length ? `${skipped.join(', ')} в разборе не указан. ` : ''
      if (!rows.length) {
        const any = select({ ...p, min: undefined, max: undefined }, target, metric).length
        return b.done(
          `${label}${sc ? ' (' + sc + ')' : ''}${codes.length ? ' у ' + codes.join(', ') : ''}: ничего не нашлось.${any && (p.min != null || p.max != null) ? ` Без числового условия есть ${nVal(any)}.` : ''}${note}`,
          followUps(all, codes[0], metric),
        )
      }
      const bestRows = perPaperBest(rows, metric)
      const top = bestRows[0]!
      if (codes.length === 1 && !p.best && !p.worst && !p.avg) {
        const list = sortRows(rows, metric)
        b.cards.push({ kind: 'results', title: `${label} · ${codes[0]}`, rows: list.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
        return b.done(`У ${codes[0]} ${nVal(list.length)} ${label}${sc ? ' (' + sc + ')' : ''}; лучшее — ${b.val(pickBest(list, metric)!, false)}.${note}`, followUps(all, codes[0], metric))
      }
      if (p.avg) {
        const vals = bestRows.map((r) => valueOf(r)!)
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length
        b.cards.push({ kind: 'results', title: `${label}: лучшее значение каждой статьи`, rows: bestRows.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
        const lo = bestRows[bestRows.length - 1]!
        return b.done(
          `${label}${sc ? ' (' + sc + ')' : ''} в среднем ${num(mean, 2)}${unitOf(metric)} по лучшим значениям ${bestRows.length} ${plural(bestRows.length, 'статьи', 'статей', 'статей')}.${bestRows.length > 1 ? ` Разброс от ${b.val(lo)} до ${b.val(top)}.` : ` ${b.val(top)}.`}${note}`,
          followUps(all, top.publication_id, metric),
        )
      }
      if (p.worst) {
        const w = perPaperBest(rows, metric, true)
        const worst = sortRows(w, metric).reverse()
        b.cards.push({ kind: 'results', title: `${label}: наименьшие`, rows: worst.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
        const z = worst[0]!
        return b.done(`${lowerIsBetter(metric) ? 'Наибольший' : 'Наименьший'} ${label}${sc ? ' (' + sc + ')' : ''} — ${b.val(z)}${z.aggregation ? ` (${z.aggregation === 'mean' ? 'среднее' : z.aggregation === 'champion' ? 'лучший прибор' : 'медиана'})` : ''}.${note}`, followUps(all, z.publication_id, metric))
      }
      if (p.best || (p.min == null && p.max == null)) {
        b.cards.push({ kind: 'results', title: `${label}${sc ? ': ' + sc : ''} — лучшее в каждой статье`, rows: bestRows.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
        const second = bestRows[1]
        let text = `${pre}${lowerIsBetter(metric) ? 'Наименьший' : 'Лучший'} ${label}${sc ? ' (' + sc + ')' : ''} — ${b.val(top)}${top.device_id ? `, прибор ${deviceName(top.publication_id, top.device_id)}` : ''}.`
        if (second) text += ` Следом ${second.publication_id} — ${b.val(second, false)}; всего показатель есть в ${bestRows.length} ${plural(bestRows.length, 'статье', 'статьях', 'статьях')}.`
        return b.done(text + note, followUps(all, top.publication_id, metric))
      }
      const list = sortRows(rows, metric)
      const papers = [...new Set(list.map((r) => r.publication_id))]
      b.cards.push({ kind: 'results', title: `${label}: ${sc}`, rows: list.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
      return b.done(`${label} ${sc}: ${nVal(list.length)} в ${papers.length} ${plural(papers.length, 'статье', 'статьях', 'статьях')} (${codesList(papers)}). Наибольшее — ${b.val(list[lowerIsBetter(metric) ? list.length - 1 : 0]!)}.${note}`, followUps(all, top.publication_id, metric))
    }

    case 'paper': {
      for (const pid of target.slice(0, 3)) b.cards.push({ kind: 'paper', pid })
      const parts = target.slice(0, 3).map((pid) => {
        const s = paperSummary(pid)
        if (!s.inScope) return `${pid} — не по теме: ${(s.reason || 'причина не указана').replace(/\.$/, '')}.`
        return `${pid} (${s.year}${s.cls ? ', ' + (CLASS_RU[s.cls] ?? s.cls) : ''}): ${nVal(s.values)}, ${nIss(s.issues)}${s.best ? `, лучший КПД ${b.val(s.best, false)}` : ''}.`
      })
      return b.done(parts.join(' ') + note, followUps(all, target[0]))
    }

    case 'list': {
      const rows = select(p, target, null)
      let papers = [...new Set(rows.map((r) => r.publication_id))]
      if (!p.classes.length && !p.layers.length) papers = [...target]
      const sc = scopeOf(p, null)
      if (!papers.length) {
        const known = p.layers.length && !p.classes.length
        return b.done(known ? `Слоя ${scopeOf(p, null).replace(/^слой /, '')} в приборах этого разбора не нашлось.` : `${sc ? sc.replace(/^./, (c) => c.toUpperCase()) + ': н' : 'Н'}ичего не нашлось.`, help)
      }
      const pce = perPaperBest(select(p, papers, 'PCE'), 'PCE')
      if (pce.length) b.cards.push({ kind: 'results', title: 'Лучший КПД в каждой статье', rows: pce.map((r) => ({ pid: r.publication_id, rid: r.result_id })) })
      else for (const pid of papers.slice(0, 3)) b.cards.push({ kind: 'paper', pid })
      return b.done(
        `${sc ? sc.replace(/^./, (c) => c.toUpperCase()) + ' — ' : 'По теме '}${nStat(papers.length)}: ${codesList(papers)}.${pce[0] ? ` Лучший КПД — ${b.val(pce[0])}.` : ''}${note}`,
        followUps(all, pce[0]?.publication_id),
      )
    }
  }
  return b.done('Не понял вопрос. Спросите про показатель, статью или замечания — например, так:', help)
}
