import { finishFact, paramOf, parseRaw, type Fact } from './data'
import type { Paper } from './store'

function hash(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export const figureNo = (p: Paper) => p.figure.match(/Рис\.\s*(\d+)/)?.[1] ?? '1'

function sameStyle(tableRaw: string, value: number, key: string, p: Paper): string {
  const pr = paramOf(p.collection, key)
  const unit = tableRaw.replace(/^-?\d+(?:[.,]\d+)?\s*/, '')
  const k = pr.units[unit] ?? 1
  const digits = (tableRaw.match(/[.,](\d+)/)?.[1]?.length ?? 0)
  const s = (value / k).toFixed(digits).replace('.', ',')
  return unit ? `${s} ${unit}` : s
}

export function figureFacts(p: Paper): Fact[] {
  const seed = p.seed ?? p.id
  const no = figureNo(p)
  const out: Fact[] = []
  const add = (row: string, key: string, tableRaw: string | undefined, rel: number, where: string) => {
    if (!tableRaw) return
    const pr = paramOf(p.collection, key)
    const t = parseRaw(tableRaw, pr)
    if (t == null) return
    const raw = sameStyle(tableRaw, t * (1 + rel), key, p)
    const id = `${p.id}:f:${row}:${key}`
    const base = parseRaw(raw, pr)
    if (base == null) return
    out.push(finishFact({
      id, paperId: p.id, row, param: key, raw, base, edited: null, status: 'new',
      confidence: 0.65 + (hash(id + seed) % 100) / 1000,
      source: { page: p.page, kind: 'figure', ref: `Рис. ${no}`, where, anchor: id },
      by: 'auto',
    }, pr))
  }
  const dev = (tag: string, list: number[]) => list[hash(tag + seed) % list.length]!

  if (p.collection === 'solar') {
    const main = paramOf('solar', 'pce')
    const sorted = [...p.rows].sort((a, b) => (parseRaw(b.values.pce ?? '', main) ?? 0) - (parseRaw(a.values.pce ?? '', main) ?? 0))
    const top = sorted[0]
    if (top) {
      add(top.id, 'voc', top.values.voc, dev('voc', [-0.009, -0.006, 0.005, -0.012]), 'пересечение с осью V')
      add(top.id, 'jsc', top.values.jsc, dev('jsc', [-0.035, 0.008, -0.012, -0.045]), 'пересечение с осью J')
    }
  } else {
    const main = paramOf('rag', 'r5')
    const sorted = [...p.rows].sort((a, b) => (parseRaw(b.values.r5 ?? '', main) ?? 0) - (parseRaw(a.values.r5 ?? '', main) ?? 0))
    sorted.slice(0, 3).forEach((r) => add(r.id, 'r5', r.values.r5, dev('r5' + r.id, [-0.03, -0.012, 0.015, -0.045]), 'столбец диаграммы'))
  }
  return out
}
