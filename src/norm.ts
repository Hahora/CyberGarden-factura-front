import { COLLECTIONS, TOKEN, fmt, fmtFull, normConditions, paramOf, parseRaw, type Fact, type Param } from './data'
import { dictionary } from './dictionary'
import { factOf, factsOf, valueOf, type Issue, type Paper } from './store'

export interface Step {
  k: string
  v: string
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const num = (n: number) => String(Math.round(n * 1e6) / 1e6).replace('.', ',')
const wordRe = (s: string) => new RegExp(`(?<![\\p{L}\\d])${esc(s)}(?![\\p{L}\\d])`, 'iu')
const NUM = /(-?\d+(?:[.,]\d+)?)\s*(.*)$/

const plain = (s: string) => s.replace(TOKEN, '$2')

function namesOf(p: Paper, key: string): string[] {
  const list = (dictionary.params[p.collection]?.[key] ?? []).map((x) => x.text)
  return [paramOf(p.collection, key).label, ...list]
}

function synonymIn(p: Paper, key: string, text: string): string | null {
  const found = namesOf(p, key)
    .filter((n) => wordRe(n).test(text))
    .sort((a, b) => b.length - a.length)
  return found[0] ?? null
}

function contextOf(f: Fact, p: Paper): string {
  if (f.quote) return f.quote
  if (f.source.kind !== 'text') return ''
  const para = p.paragraphs.find((x) => x.includes(`[[${f.row}.${f.param}|`))
  return para ? plain(para) : ''
}

function canonText(f: Fact, p: Paper): { canon: string; via: string } | null {
  const low = f.raw.toLowerCase()
  for (const c of dictionary.conditions) {
    const hit = [c.canon, ...c.synonyms.map((x) => x.text)].find((x) => low.includes(x.toLowerCase()))
    if (hit) return { canon: c.canon, via: hit }
  }
  for (const m of dictionary.materials) {
    if (m.collection !== p.collection) continue
    const hit = [m.canon, ...m.synonyms.map((x) => x.text)].find((x) => wordRe(x).test(f.raw))
    if (hit) return { canon: m.canon, via: hit }
  }
  return null
}

export function normTrace(f: Fact, p: Paper): Step[] {
  const param = paramOf(p.collection, f.param)
  const steps: Step[] = []
  const where = f.source.kind === 'figure' ? 'На рисунке' : f.source.kind === 'manual' ? 'Выделено' : 'В статье'
  steps.push({ k: where, v: `«${f.raw}»` })

  const syn = synonymIn(p, f.param, contextOf(f, p))
  const name = f.source.kind === 'table' ? `столбец «${param.label}»` : syn && syn.toLowerCase() !== param.label.toLowerCase() ? `в тексте «${syn}»` : ''
  steps.push({ k: 'Параметр', v: name ? `${param.label} (${name})` : param.label })

  if (param.text) {
    const unitHit = param.key === 'conditions' ? f.raw.match(/(\d+(?:[.,]\d+)?)\s*Вт\/м²/) : null
    if (unitHit) steps.push({ k: 'Единицы', v: `${unitHit[0]} → ${normConditions(unitHit[0])}` })
    const hit = canonText(f, p)
    if (hit) {
      steps.push({ k: 'Словарь', v: hit.via.toLowerCase() === hit.canon.toLowerCase() ? 'совпало с канонической записью' : `«${hit.via}» → каноническая запись` })
      steps.push({ k: 'Итог', v: hit.canon })
    } else {
      steps.push({ k: 'Словарь', v: 'в словаре не нашли — оставили как в статье' })
      steps.push({ k: 'Итог', v: f.raw })
    }
    return steps
  }

  const m = f.raw.trim().match(NUM)
  const unit = m?.[2]?.trim() ?? ''
  if (m) steps.push({ k: 'Число', v: `${m[1]}, ${unit ? 'единица ' + unit : 'без единицы'}` })
  const k = param.units[unit] ?? (unit === param.unit ? 1 : undefined)
  if (m && k !== undefined && (k !== 1 || unit !== param.unit)) {
    const to = param.unit || 'доли'
    steps.push({ k: 'Перевод', v: `${unit || 'доли'} → ${to}, × ${num(k)}` })
  }
  if (f.edited != null) steps.push({ k: 'Исправлено', v: fmtFull(f.edited, param) })
  else if (f.base != null) steps.push({ k: 'Итог', v: fmtFull(f.base, param) })
  else steps.push({ k: 'Итог', v: 'не распознано' })
  return steps
}

export interface Cross {
  fig: string
  tbl: string
  pct: number
  over: boolean
  text: string
}

export function crossOf(f: Fact, p: Paper): Cross | null {
  if (f.source.kind !== 'figure' && f.source.kind !== 'table') return null
  const want = f.source.kind === 'figure' ? 'table' : 'figure'
  const other = factsOf(p.id).find((x) => x.row === f.row && x.param === f.param && x.source.kind === want && x.status !== 'rejected')
  if (!other) return null
  const fig = f.source.kind === 'figure' ? f : other
  const tbl = f.source.kind === 'figure' ? other : f
  const a = valueOf(fig)
  const b = valueOf(tbl)
  if (a == null || b == null || b === 0) return null
  const param = paramOf(p.collection, f.param)
  const pct = (Math.abs(a - b) / Math.abs(b)) * 100
  const figS = fmt(a, param)
  const tblS = fmt(b, param)
  return {
    fig: figS,
    tbl: tblS,
    pct,
    over: pct > 3,
    text: `на рисунке ${figS}, в таблице ${tblS} — расхождение ${pct.toFixed(1).replace('.', ',')} %`,
  }
}

export interface Guess {
  row: string
  param: string
  raw: string
}

function paramByUnit(p: Paper, text: string): string | null {
  const m = text.match(NUM)
  const unit = m?.[2]?.trim().split(/[\s,;)]/)[0] ?? ''
  if (!unit) return null
  for (const pr of COLLECTIONS[p.collection].params) if (!pr.text && Object.keys(pr.units).includes(unit) && unit !== '') return pr.key
  return null
}

function unitsOf(p: Paper, pr?: Param): string[] {
  const all = pr ? Object.keys(pr.units) : COLLECTIONS[p.collection].params.flatMap((x) => Object.keys(x.units))
  return [...new Set(all)].filter(Boolean).sort((a, b) => b.length - a.length)
}

export function pickValue(p: Paper, text: string, param?: string): string {
  const pr = param ? paramOf(p.collection, param) : undefined
  if (pr?.text) return text.trim().slice(0, 80)
  const units = unitsOf(p, pr)
  const re = new RegExp(`(-?\\d+(?:[.,]\\d+)?)(?:\\s*(${units.map(esc).join('|')})(?![\\p{L}]))?`, 'u')
  const m = text.match(re)
  return m ? m[0].trim() : text.trim().slice(0, 40)
}

export function guessFact(p: Paper, text: string, ctx: { cell?: string | null; rowLabelText?: string; before?: string; after?: string }): Guess {
  if (ctx.cell) {
    const [, , row, param] = ctx.cell.split(':')
    if (row && param) return { row, param, raw: pickValue(p, text, param) }
  }
  const before = ctx.before ?? ''
  const near = `${before.slice(-90)} ${text} ${(ctx.after ?? '').slice(0, 30)}`
  const col = COLLECTIONS[p.collection]

  let param: string | null = null
  let best = Infinity
  for (const pr of col.params) {
    for (const n of namesOf(p, pr.key)) {
      const re = new RegExp(wordRe(n).source, 'giu')
      for (const hit of near.matchAll(re)) {
        const at = hit.index ?? 0
        const mid = near.indexOf(text.slice(0, 12))
        const d = at <= mid ? mid - at : (at - mid) * 1.5
        if (d < best) {
          best = d
          param = pr.key
        }
      }
    }
  }
  if (!param || best > 90) param = paramByUnit(p, text) ?? param ?? col.best
  const pr = paramOf(p.collection, param)

  let row = pr.text && param === 'conditions' ? '*' : ''
  if (!row && ctx.rowLabelText) row = p.rows.find((r) => r.label === ctx.rowLabelText)?.id ?? ''
  if (!row) {
    let at = -1
    for (const r of p.rows) {
      const i = near.search(wordRe(r.label))
      if (i >= 0 && (at < 0 || i < at)) {
        at = i
        row = r.id
      }
    }
  }
  if (!row) row = p.rows[0]?.id ?? '*'
  return { row, param, raw: pickValue(p, text, param) }
}

export function previewRaw(p: Paper, param: string, raw: string): { ok: boolean; text: string } {
  const pr = paramOf(p.collection, param)
  const t = raw.trim()
  if (!t) return { ok: false, text: '' }
  if (pr.text) return { ok: true, text: t }
  let base = parseRaw(t, pr)
  if (base == null && pr.unit) base = parseRaw(`${t} ${pr.unit}`, pr)
  if (base == null) return { ok: false, text: 'не распознано' }
  const out = fmt(base, pr)
  return { ok: true, text: out === t ? out : `${t} → ${out}` }
}

export function mainFactId(i: Issue): string | undefined {
  if (i.plugin === 'jv_consistency') return i.factIds.find((id) => factOf(id)?.param === 'pce') ?? i.factIds[i.factIds.length - 1]
  return i.factIds[0]
}

export function sortIssues(list: Issue[]): Issue[] {
  const w = (i: Issue) => (i.level === 'conflict' ? 0 : 1)
  return list.map((x, n) => ({ x, n })).sort((a, b) => w(a.x) - w(b.x) || a.n - b.n).map((o) => o.x)
}
