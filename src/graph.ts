import { COLLECTIONS, fmt, paramOf, type CollectionId } from './data'
import { dictionary, materialBySynonym, type MaterialEntry } from './dictionary'
import { referencesOf, type Reference } from './refs'
import { structureOf } from './structure'
import { factsOf, state, valueOf, type Paper } from './store'

export type NodeKind = 'paper' | 'ext' | 'entity'
export interface GNode {
  id: string
  kind: NodeKind
  label: string
  full: string
  year: number | null
  r: number
  paperId?: string
  entityId?: string
  unparsed?: boolean
}
export interface GEdge { source: string; target: string; type: 'cites' | 'uses' }
export interface Graph { nodes: GNode[]; edges: GEdge[]; byId: Map<string, GNode> }
export type Pos = Record<string, { x: number; y: number }>

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const surname = (authors: string) => authors.split(/[\s,]+/)[0] ?? authors

const paperBySeed = (seed: string) => state.papers.find((p) => (p.seed ?? p.id) === seed && p.processing >= 100)

export function refNodeId(paperId: string, r: Reference): string {
  if (r.key.startsWith('p:')) return paperBySeed(r.key.slice(2))?.id ?? r.key
  if (r.key.startsWith('u:')) return `u:${paperId}:${r.n}`
  return r.key
}

function entryHits(entry: MaterialEntry, p: Paper): boolean {
  const layers = p.collection === 'solar' ? structureOf(p).flatMap((v) => v.layers.map((l) => l.raw)).join(' ') : ''
  const hay = (p.title + ' ' + p.tags + ' ' + p.paragraphs.join(' ') + ' ' + layers).toLowerCase()
  return [entry.canon, ...entry.synonyms.map((x) => x.text)].some((w) => w.length >= 3 && hay.includes(w.toLowerCase()))
}
export const entitiesOf = (p: Paper): MaterialEntry[] =>
  dictionary.materials.filter((m) => m.collection === p.collection && entryHits(m, p))

export function findEntity(text: string): MaterialEntry | null {
  const exact = materialBySynonym(text)
  if (exact) return exact
  const t = text.toLowerCase()
  let best: { m: MaterialEntry; len: number } | null = null
  for (const m of dictionary.materials) {
    for (const w of [m.canon, ...m.synonyms.map((x) => x.text)]) {
      const l = w.toLowerCase()
      if (l.length >= 3 && t.includes(l) && (!best || l.length > best.len)) best = { m, len: l.length }
    }
  }
  return best?.m ?? null
}

export function bestOf(p: Paper): { value: number; text: string; label: string } | null {
  const param = paramOf(p.collection, COLLECTIONS[p.collection].best)
  let v: number | null = null
  for (const f of factsOf(p.id)) {
    if (f.param !== param.key || f.status === 'rejected') continue
    const x = valueOf(f)
    if (x != null && (v == null || x > v)) v = x
  }
  return v == null ? null : { value: v, text: fmt(v, param), label: param.label }
}

const doneIn = (c?: CollectionId) => state.papers.filter((p) => p.processing >= 100 && (!c || p.collection === c))

export function citedBy(paperId: string): Paper[] {
  const me = state.papers.find((p) => p.id === paperId)
  if (!me) return []
  const key = 'p:' + (me.seed ?? me.id)
  return doneIn().filter((p) => p.id !== me.id && referencesOf(p.id).some((r) => r.key === key))
}

export function whereUsed(entityId: string): { paper: Paper; best: string | null; value: number | null }[] {
  const m = dictionary.materials.find((x) => x.id === entityId)
  if (!m) return []
  return doneIn(m.collection)
    .filter((p) => entryHits(m, p))
    .map((paper) => {
      const b = bestOf(paper)
      return { paper, best: b ? `${b.label} ${b.text}` : null, value: b?.value ?? null }
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
}

export function buildGraph(cid: CollectionId): Graph {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const byId = new Map<string, GNode>()
  const add = (n: GNode) => {
    if (!byId.has(n.id)) { byId.set(n.id, n); nodes.push(n) }
  }
  const papers = doneIn(cid)
  for (const p of papers) {
    add({ id: p.id, kind: 'paper', label: cut(p.title, 24), full: p.title, year: p.year, r: 9 + Math.sqrt(factsOf(p.id).length) * 2, paperId: p.id })
  }
  for (const p of papers) {
    for (const r of referencesOf(p.id)) {
      const id = refNodeId(p.id, r)
      if (r.key.startsWith('p:')) {
        if (!byId.has(id)) continue
      } else {
        const un = r.status === 'unparsed'
        add({
          id, kind: 'ext', unparsed: un, year: r.year, r: un ? 4 : 5.5,
          label: un ? cut(r.title, 14) : `${surname(r.authors)} ${r.year ?? ''}`.trim(),
          full: `${r.authors}. ${r.title}${r.year ? ', ' + r.year : ''}`,
        })
      }
      edges.push({ source: p.id, target: id, type: 'cites' })
    }
    for (const m of entitiesOf(p)) {
      const id = 'e:' + m.id
      add({ id, kind: 'entity', label: m.canon, full: `${m.canon} — ${m.name}`, year: null, r: 8, entityId: m.id })
      edges.push({ source: p.id, target: id, type: 'uses' })
    }
  }
  const kr = (n: GNode) => (n.kind === 'paper' ? 0 : n.kind === 'entity' ? 1 : 2)
  nodes.sort((a, b) => kr(a) - kr(b) || a.id.localeCompare(b.id))
  edges.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.type.localeCompare(b.type))
  return { nodes, edges, byId }
}

export const neighborsOf = (g: { edges: GEdge[] }, id: string): Set<string> => {
  const s = new Set<string>()
  for (const e of g.edges) {
    if (e.source === id) s.add(e.target)
    else if (e.target === id) s.add(e.source)
  }
  return s
}

export function defaultRoot(g: Graph): string | null {
  const papers = g.nodes.filter((n) => n.kind === 'paper')
  let best: GNode | null = null
  let bc = -1
  for (const n of papers) {
    const c = g.edges.filter((e) => e.target === n.id && e.type === 'cites').length
    if (c > bc || (c === bc && best && n.id < best.id)) { bc = c; best = n }
  }
  return best?.id ?? null
}

export function nearGraph(g: Graph, root: string): Graph {
  const keep = new Set<string>([root])
  for (const e of g.edges) {
    if (e.source === root) keep.add(e.target)
    if (e.target === root) keep.add(e.source)
  }
  for (const n of g.nodes) if (n.kind === 'paper') keep.add(n.id)
  const nodes = g.nodes.filter((n) => keep.has(n.id))
  return { nodes, edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)), byId: new Map(nodes.map((n) => [n.id, n])) }
}

export function yearColor(year: number | null, min: number, max: number): string {
  const t = year == null || max <= min ? 1 : Math.min(1, Math.max(0, (year - min) / (max - min)))
  if (t < 0.34) return 'var(--faint)'
  if (t < 0.67) return 'color-mix(in srgb, var(--blue) 50%, var(--ink))'
  return 'var(--blue)'
}

export function layoutRings(g: { nodes: GNode[]; edges: GEdge[] }, root: string): Pos {
  const pos: Pos = { [root]: { x: 0, y: 0 } }
  const out = new Set<string>()
  const cit = new Set<string>()
  for (const e of g.edges) {
    if (e.source === root) out.add(e.target)
    if (e.target === root && e.type === 'cites') cit.add(e.source)
  }
  const rest = g.nodes.filter((n) => n.id !== root)
  const r1 = rest.filter((n) => out.has(n.id))
  const r2 = rest.filter((n) => !out.has(n.id) && cit.has(n.id))
  const r3 = rest.filter((n) => !out.has(n.id) && !cit.has(n.id))
  const rank = (n: GNode) => (n.kind === 'paper' ? 0 : n.kind === 'entity' ? 1 : 2)
  r1.sort((a, b) => rank(a) - rank(b) || (b.year ?? 0) - (a.year ?? 0) || a.id.localeCompare(b.id))

  let radius = 0
  const place = (list: GNode[], minR: number) => {
    if (!list.length) return
    radius = Math.max(radius + 95, minR, (list.length * 56) / (2 * Math.PI))
    const key = (n: GNode) => {
      let sx = 0, sy = 0
      for (const e of g.edges) {
        const o = e.source === n.id ? e.target : e.target === n.id ? e.source : null
        const p = o && pos[o]
        if (p && (p.x || p.y)) { const l = Math.hypot(p.x, p.y); sx += p.x / l; sy += p.y / l }
      }
      return sx || sy ? Math.atan2(sy, sx) : 99
    }
    const sorted = list.map((n) => ({ n, k: key(n) })).sort((a, b) => a.k - b.k).map((x) => x.n)
    sorted.forEach((n, i) => {
      const a = -Math.PI / 2 + (i / sorted.length) * Math.PI * 2
      pos[n.id] = { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
    })
  }
  place(r1, 130)
  place(r2, 120)
  place(r3, 120)
  return pos
}

export interface YearRing { r: number; label: string }

export function layoutYears(g: { nodes: GNode[]; edges: GEdge[] }, root: string): { pos: Pos; rings: YearRing[] } {
  const pos: Pos = { [root]: { x: 0, y: 0 } }
  const rootYear = g.nodes.find((n) => n.id === root)?.year ?? 0
  const rest = g.nodes.filter((n) => n.id !== root)
  const bucketOf = (y: number) => { const d = rootYear - y; return d <= 0 ? 1 : d <= 2 ? 2 : d <= 7 ? 3 : 4 }
  const groups = new Map<number, GNode[]>()
  for (const n of rest) {
    const k = n.year == null ? 0 : bucketOf(n.year)
    groups.set(k, [...(groups.get(k) ?? []), n])
  }
  const labelOf = (k: number, list: GNode[]) => {
    if (k === 0) return 'материалы'
    const ys = list.map((n) => n.year!)
    const lo = Math.min(...ys), hi = Math.max(...ys)
    return lo === hi ? String(lo) : `${lo}–${hi}`
  }
  const order = [...groups.keys()].sort((a, b) => a - b).map((k) => ({ key: k, label: labelOf(k, groups.get(k)!) }))

  const rings: YearRing[] = []
  let radius = 0
  for (const { key, label } of order) {
    const list = groups.get(key)!
    radius = Math.max(radius + 88, (list.length * 54) / (2 * Math.PI), 120)
    const angleKey = (n: GNode) => {
      let sx = 0, sy = 0
      for (const e of g.edges) {
        const o = e.source === n.id ? e.target : e.target === n.id ? e.source : null
        const q = o && pos[o]
        if (q && (q.x || q.y)) { const l = Math.hypot(q.x, q.y); sx += q.x / l; sy += q.y / l }
      }
      return sx || sy ? Math.atan2(sy, sx) : 99
    }
    const sorted = list
      .map((n) => ({ n, k: angleKey(n) }))
      .sort((a, b) => a.k - b.k || a.n.id.localeCompare(b.n.id))
      .map((x) => x.n)
    sorted.forEach((n, i) => {
      const a = -Math.PI / 2 + ((i + 0.5) / sorted.length) * Math.PI * 2
      pos[n.id] = { x: Math.cos(a) * radius, y: Math.sin(a) * radius }
    })
    rings.push({ r: radius, label })
  }
  return { pos, rings }
}

export function layoutForce(g: { nodes: GNode[]; edges: GEdge[] }, root: string | null, iters = 260): Pos {
  const n = g.nodes.length
  const P = g.nodes.map((nd, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2
    const r = 60 + ((i * 37) % 11) * 14
    return { id: nd.id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 }
  })
  const idx = new Map(P.map((p, i) => [p.id, i]))
  const links = g.edges.map((e) => [idx.get(e.source)!, idx.get(e.target)!, e.type === 'uses' ? 80 : 100] as const)
  for (let it = 0; it < iters; it++) {
    const cool = 1 - it / iters
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = P[i]!, b = P[j]!
        let dx = a.x - b.x, dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = (i % 3) - 1 + 0.5; dy = (j % 3) - 1 + 0.5; d2 = 1 }
        const d = Math.sqrt(d2)
        const f = Math.min(40, 2600 / d2)
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
    }
    for (const [i, j, len] of links) {
      const a = P[i]!, b = P[j]!
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const f = (d - len) * 0.05
      a.vx += (dx / d) * f; a.vy += (dy / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    for (const p of P) {
      p.vx -= p.x * 0.012; p.vy -= p.y * 0.012
      p.x += p.vx * 0.5 * (0.2 + cool * 0.8)
      p.y += p.vy * 0.5 * (0.2 + cool * 0.8)
      p.vx *= 0.6; p.vy *= 0.6
    }
    if (root && idx.has(root)) { const r = P[idx.get(root)!]!; r.x = 0; r.y = 0 }
  }
  const w = g.nodes.map((nd) => (nd.kind === 'paper' ? Math.min(24, nd.label.length) * 6.8 + 12 : nd.r * 2 + 6))
  const h = g.nodes.map((nd) => (nd.kind === 'paper' ? nd.r * 2 + 34 : nd.r * 2 + 6))
  for (let it = 0; it < 90; it++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = P[i]!, b = P[j]!
        const ox = (w[i]! + w[j]!) / 2 - Math.abs(a.x - b.x)
        const oy = (h[i]! + h[j]!) / 2 - Math.abs(a.y - b.y)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        const fixA = root === g.nodes[i]!.id, fixB = root === g.nodes[j]!.id
        const share = fixA || fixB ? 1 : 0.5
        if (oy < ox) {
          const s = (a.y >= b.y ? 1 : -1) * oy * share
          if (!fixA) a.y += s
          if (!fixB) b.y -= s
        } else {
          const s = (a.x >= b.x ? 1 : -1) * ox * share
          if (!fixA) a.x += s
          if (!fixB) b.x -= s
        }
      }
    }
    if (!moved) break
  }
  return Object.fromEntries(P.map((p) => [p.id, { x: p.x, y: p.y }]))
}

export function edgesCsv(g: Graph, edges: GEdge[] = g.edges): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = ['source,target,type,source_label,target_label']
  for (const e of edges) {
    lines.push([e.source, e.target, e.type, q(g.byId.get(e.source)?.full ?? ''), q(g.byId.get(e.target)?.full ?? '')].join(','))
  }
  return lines.join('\n')
}

export function refSummary(paperId: string) {
  const refs = referencesOf(paperId)
  return { refs: refs.length, unparsed: refs.filter((r) => r.status === 'unparsed').length, citedBy: citedBy(paperId).length }
}
