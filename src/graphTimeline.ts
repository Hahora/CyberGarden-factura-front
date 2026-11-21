import { buildGraph, type Graph } from './graph'
import type { CollectionId } from './data'

export const EXT_ID = 'x:ext'
export interface TNode { id: string; label: string; full: string; kind: 'paper' | 'ext'; x: number; y: number; w: number; h: number; year: number | null; root: boolean }
export interface TLayout {
  nodes: TNode[]
  edges: { source: string; target: string }[]
  years: { y: number; label: string }[]
  height: number
  width: number
  byId: Map<string, TNode>
  near: Map<string, Set<string>>
  rootY: number
}

export const GUT = 44
const PILL_H = 34
const ROW_GAP = 30
const SUB_GAP = 12
const PAD_T = 18
const PAD_B = 22

export function shortTitle(t: string, n = 17): string {
  const head = (t.split(/[:—–(,]| - /)[0] ?? t).trim() || t
  if (head.length <= n) return head
  let out = ''
  for (const w of head.split(/\s+/)) {
    if ((out + ' ' + w).trim().length > n - 1) break
    out = (out + ' ' + w).trim()
  }
  return (out || head.slice(0, n - 1)).trimEnd() + '…'
}
const pillW = (label: string) => Math.round(label.length * 6.9 + 26)

export function layoutTimeline(g: Graph, rootId: string, width: number): TLayout {
  const root = g.byId.get(rootId)
  const papers = new Set<string>([rootId])
  const extIds: string[] = []
  for (const e of g.edges) {
    if (e.type !== 'cites') continue
    const other = e.source === rootId ? e.target : e.target === rootId ? e.source : null
    if (!other) continue
    const n = g.byId.get(other)
    if (!n) continue
    if (n.kind === 'paper') papers.add(other)
    else if (n.kind === 'ext' && e.source === rootId) extIds.push(other)
  }
  const list = [...papers].map((id) => g.byId.get(id)!).filter(Boolean)
  const byYear = new Map<number, typeof list>()
  for (const n of list) {
    const y = n.year ?? 0
    byYear.set(y, [...(byYear.get(y) ?? []), n])
  }
  const avail = Math.max(120, width - GUT - 10)
  const nodes: TNode[] = []
  const years: { y: number; label: string }[] = []
  let y = PAD_T
  let rootY = 0
  const place = (items: { id: string; label: string; full: string; kind: 'paper' | 'ext'; year: number | null; root: boolean }[], label: string) => {
    const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
    const ri = sorted.findIndex((i) => i.root)
    if (ri >= 0) { const [r] = sorted.splice(ri, 1); sorted.splice(Math.floor(sorted.length / 2), 0, r!) }
    const lines: typeof sorted[] = [[]]
    let used = 0
    for (const it of sorted) {
      const w = Math.min(avail, pillW(it.label))
      const cur = lines[lines.length - 1]!
      if (cur.length && used + SUB_GAP + w > avail) { lines.push([it]); used = w } else { cur.push(it); used += (cur.length > 1 ? SUB_GAP : 0) + w }
    }
    const top = y
    for (const line of lines) {
      const ws = line.map((it) => Math.min(avail, pillW(it.label)))
      const total = ws.reduce((a, b) => a + b, 0) + SUB_GAP * (line.length - 1)
      let x = GUT + (avail - total) / 2
      line.forEach((it, i) => {
        nodes.push({ ...it, x: x + ws[i]! / 2, y: y + PILL_H / 2, w: ws[i]!, h: PILL_H })
        if (it.root) rootY = y + PILL_H / 2
        x += ws[i]! + SUB_GAP
      })
      y += PILL_H + SUB_GAP
    }
    y -= SUB_GAP
    if (label) years.push({ y: (top + y) / 2, label })
    y += ROW_GAP
  }
  for (const yr of [...byYear.keys()].sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : b - a))) {
    place(byYear.get(yr)!.map((n) => ({ id: n.id, label: shortTitle(n.full), full: n.full, kind: 'paper' as const, year: n.year, root: n.id === rootId })), yr ? String(yr) : '')
  }
  if (extIds.length) {
    const label = `+${extIds.length} внешних`
    place([{ id: EXT_ID, label, full: label, kind: 'ext', year: null, root: false }], '')
  }
  const height = y - ROW_GAP + PAD_B
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ext = new Set(extIds)
  const seen = new Set<string>()
  const edges: { source: string; target: string }[] = []
  for (const e of g.edges) {
    if (e.type !== 'cites') continue
    const s = e.source
    const t = ext.has(e.target) ? EXT_ID : e.target
    if (!byId.has(s) || !byId.has(t)) continue
    if (t === EXT_ID && s !== rootId) continue
    const k = s + '>' + t
    if (seen.has(k)) continue
    seen.add(k)
    edges.push({ source: s, target: t })
  }
  const near = new Map<string, Set<string>>()
  for (const n of nodes) near.set(n.id, new Set())
  for (const e of edges) { near.get(e.source)!.add(e.target); near.get(e.target)!.add(e.source) }
  void root
  return { nodes, edges, years, height, width, byId, near, rootY }
}

export const buildFor = (collection: CollectionId) => buildGraph(collection)
