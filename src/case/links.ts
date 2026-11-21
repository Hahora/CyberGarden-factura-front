import { CLASS_RU, inScope, layersOf, materialsOf, publication, publications, ragPublication, resultsOf } from './index'
import { ragFacets, type RagShareKind } from './ragLinks'

export type EdgeKind = 'class' | 'absorber' | 'layer' | 'cited' | RagShareKind
export type NodeKind = 'paper' | 'class' | 'material' | 'layer' | 'cited' | RagShareKind

export interface LinkNode { id: string; kind: NodeKind; label: string; pid?: string; weight: number }
export interface LinkEdge { from: string; to: string; kind: EdgeKind; label: string }
export interface LinkGraph { nodes: LinkNode[]; edges: LinkEdge[] }
export interface Shared { kind: Exclude<EdgeKind, 'cited'>; label: string }
export interface Related { pid: string; shared: Shared[] }

export const EDGE_RU: Record<EdgeKind, string> = {
  class: 'Класс поглотителя', absorber: 'Тот же поглотитель', layer: 'Материал слоёв', cited: 'Цитируемые работы',
  dataset: 'Общий датасет', generator: 'Общий генератор', embedding: 'Общие эмбеддинги', retriever: 'Общий ретривер',
}
export const EDGE_KINDS: Record<'solar' | 'rag', EdgeKind[]> = {
  solar: ['class', 'absorber', 'layer', 'cited'],
  rag: ['dataset', 'generator', 'embedding', 'retriever'],
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const KEEP_PLAIN = /^(P3HT|C60|V1553)$/
function pretty(s: string) {
  if (KEEP_PLAIN.test(s)) return s
  return s.replace(/(?<![\d.])(?<=[A-Za-z)])(\d+)(?![\d.])/g, (d) => [...d].map((c) => SUB[+c]).join(''))
}

const ABSORBER_ALIAS: Record<string, string> = { ch3nh3pbi3: 'MAPbI₃' }
function absorberOf(m: { formula_normalized: string }): { key: string; label: string } | null {
  const f = m.formula_normalized.replace(/\s+\(.*$/, '').replace(/\s+/g, '')
  if (!f) return null
  const key = f.toLowerCase()
  return { key, label: ABSORBER_ALIAS[key] ?? pretty(f) }
}

const TOO_GENERIC = /^(glass|metal|substrate|стекло|soda.?lime glass|slg)$/i
const FUNCS = ['ETL', 'HTL', 'back_contact', 'front_contact'] as const
const FUNC_SHORT: Record<string, string> = { ETL: 'ETL', HTL: 'HTL', back_contact: 'задний электрод', front_contact: 'передний электрод' }

function layerMat(raw: string): { key: string; label: string } | null {
  let s = raw.replace(/\([^)]*\)/g, ' ').replace(/,.*$/, ' ')
  s = s.replace(/\bsol[–-]gel\b.*$/i, ' ').replace(/\b(compact|nanoparticles|NPs|glass|paste|layer|film)\b/gi, ' ')
  s = s.replace(/\b\d+(\.\d+)?\s*(nm|um|μm|mg\/m[lL]|M|wt\.?%|at\.?%)\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || TOO_GENERIC.test(s)) return null
  let key = s.toLowerCase().replace(/[\s-]/g, '')
  const ALIAS: Record<string, [string, string]> = {
    spirometad: ['spiro', 'Spiro-OMeTAD'], spiroometad: ['spiro', 'Spiro-OMeTAD'], 'tio2': ['tio2', 'TiO₂'],
    nio: ['nio', 'NiOx'], niox: ['nio', 'NiOx'], 'zno:al': ['azo', 'AZO'], azo: ['azo', 'AZO'],
    uzo: ['izno', 'i-ZnO'], izno: ['izno', 'i-ZnO'], carbon: ['carbon', 'углерод'],
  }
  if (key.startsWith('undoped')) key = 'uzo'
  const a = ALIAS[key]
  if (a) return { key: a[0], label: a[1] }
  return { key, label: pretty(s) }
}

interface PaperFacts {
  pid: string
  cls: string | null
  absorbers: Map<string, string>
  layers: Map<string, { fn: string; label: string }>
}
const facts = new Map<string, PaperFacts>()
function factsOf(pid: string): PaperFacts {
  let f = facts.get(pid)
  if (f) return f
  f = { pid, cls: null, absorbers: new Map(), layers: new Map() }
  for (const m of materialsOf(pid)) {
    if (!f.cls && m.material_class && m.material_class !== 'other') f.cls = m.material_class
    const a = absorberOf(m)
    if (a) f.absorbers.set(a.key, a.label)
  }
  for (const l of layersOf(pid)) {
    if (!(FUNCS as readonly string[]).includes(l.layer_function)) continue
    const lm = layerMat(l.layer_material)
    if (lm) f.layers.set(l.layer_function + '|' + lm.key, { fn: l.layer_function, label: lm.label })
  }
  facts.set(pid, f)
  return f
}

const defaultPids = () => publications().filter((p) => inScope(p.publication_id)).map((p) => p.publication_id)

export interface CitedInfo { count: number; refs: string[]; text: string }
function refKey(s: string) {
  const t = s.trim().replace(/^refs?\.?\s*/i, '').replace(/\s*\(.*\)\s*$/, '').replace(/^\[|\]$/g, '')
  return /^[\d,\s–-]+$/.test(t) ? t.replace(/\s+/g, '') : s.trim()
}
const refNum = (r: string) => parseInt(r, 10)
export function citedOf(pid: string): CitedInfo {
  const rows = resultsOf(pid).filter((r) => r.result_origin === 'cited')
  const set = new Set<string>()
  for (const r of rows) for (const p of r.cited_publication_id.split(/;/)) if (p.trim()) set.add(refKey(p))
  const refs = [...set].sort((a, b) => (refNum(a) || 1e9) - (refNum(b) || 1e9) || a.localeCompare(b))
  const n = rows.length
  const word = n % 10 === 1 && n % 100 !== 11 ? 'значение' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'значения' : 'значений'
  const list = refs.slice(0, 8).map((r) => (/^[\d,–-]+$/.test(r) ? `[${r}]` : r)).join(refs.some((r) => /\D/.test(r.replace(/[,–-]/g, ''))) ? '; ' : ', ') + (refs.length > 8 ? '…' : '')
  return { count: n, refs, text: n ? `${n} ${word}${list ? ' из ' + list : ''}` : '' }
}

export function graphData(pids: string[] = defaultPids()): LinkGraph {
  const ps = pids.filter((p) => publication(p))
  const nodes: LinkNode[] = ps.map((pid) => ({ id: pid, kind: 'paper', label: pid, pid, weight: 1 }))
  const edges: LinkEdge[] = []
  const add = (id: string, kind: NodeKind, label: string, ekind: EdgeKind, members: string[], elabel: string) => {
    nodes.push({ id, kind, label, weight: members.length })
    for (const pid of members) edges.push({ from: pid, to: id, kind: ekind, label: elabel })
  }
  const group = <T>(pick: (f: PaperFacts) => [string, T][]) => {
    const g = new Map<string, { v: T; pids: string[] }>()
    for (const pid of ps) for (const [k, v] of pick(factsOf(pid))) {
      const e = g.get(k)
      if (e) e.pids.push(pid)
      else g.set(k, { v, pids: [pid] })
    }
    return [...g].filter(([, e]) => e.pids.length > 1)
  }
  for (const [k, e] of group((f) => (f.cls ? [[f.cls, f.cls] as [string, string]] : []))) {
    const l = CLASS_RU[e.v] ?? e.v
    add('class:' + k, 'class', l, 'class', e.pids, l)
  }
  for (const [k, e] of group((f) => [...f.absorbers].map(([key, label]) => [key, label] as [string, string]))) {
    add('mat:' + k, 'material', e.v, 'absorber', e.pids, e.v)
  }
  for (const [k, e] of group((f) => [...f.layers].map(([key, v]) => [key, v] as [string, { fn: string; label: string }]))) {
    const l = `${FUNC_SHORT[e.v.fn]} ${e.v.label}`
    add('layer:' + k, 'layer', l, 'layer', e.pids, l)
  }
  for (const pid of ps) {
    const c = citedOf(pid)
    if (c.count) add('cited:' + pid, 'cited', `Цитируемые работы · ${c.count}`, 'cited', [pid], c.text)
  }
  return { nodes, edges }
}

export function sharedBetween(a: string, b: string): Shared[] {
  const fa = factsOf(a), fb = factsOf(b)
  const out: Shared[] = []
  for (const [k, label] of fa.absorbers) if (fb.absorbers.has(k)) out.push({ kind: 'absorber', label: `поглотитель ${label}` })
  if (fa.cls && fa.cls === fb.cls) out.push({ kind: 'class', label: `класс: ${CLASS_RU[fa.cls] ?? fa.cls}` })
  for (const [k, v] of fa.layers) if (fb.layers.has(k)) out.push({ kind: 'layer', label: `${FUNC_SHORT[v.fn]} ${v.label}` })
  return out
}

export function relatedPapers(pid: string, pids: string[] = defaultPids()): Related[] {
  const w = (s: Shared[]) => s.reduce((a, x) => a + (x.kind === 'absorber' ? 3 : 1), 0)
  return pids
    .filter((p) => p !== pid && publication(p))
    .map((p) => ({ pid: p, shared: sharedBetween(pid, p) }))
    .filter((r) => r.shared.length)
    .sort((a, b) => w(b.shared) - w(a.shared) || b.shared.length - a.shared.length || a.pid.localeCompare(b.pid))
}

export const paperClass = (pid: string): string => factsOf(pid).cls ?? 'other'

const RAG_NODE: Record<RagShareKind, NodeKind> = { dataset: 'dataset', generator: 'generator', embedding: 'embedding', retriever: 'retriever' }
export function ragGraphData(pids: string[]): LinkGraph {
  const ps = pids.filter((p) => ragPublication(p))
  const nodes: LinkNode[] = ps.map((pid) => ({ id: pid, kind: 'paper', label: pid, pid, weight: 1 }))
  const edges: LinkEdge[] = []
  const g = new Map<string, { kind: RagShareKind; label: string; pids: string[] }>()
  for (const pid of ps) {
    for (const [k, v] of ragFacets(pid)) {
      const e = g.get(k)
      if (e) e.pids.push(pid)
      else g.set(k, { kind: v.kind, label: v.label, pids: [pid] })
    }
  }
  for (const [k, e] of g) {
    if (e.pids.length < 2) continue
    const id = k
    nodes.push({ id, kind: RAG_NODE[e.kind], label: e.label, weight: e.pids.length })
    for (const pid of e.pids) edges.push({ from: pid, to: id, kind: e.kind, label: e.label })
  }
  return { nodes, edges }
}
const RAG_W: Record<RagShareKind, number> = { dataset: 3, generator: 2, embedding: 1, retriever: 1 }
export function ragSharedBetween(a: string, b: string): Shared[] {
  const fa = ragFacets(a)
  const fb = ragFacets(b)
  const out: Shared[] = []
  for (const [k, v] of fa) if (fb.has(k)) out.push({ kind: v.kind, label: `${EDGE_RU[v.kind].replace(/^Общи[йе] /, '').toLowerCase()} ${v.label}` })
  return out
}
export function ragRelatedPapers(pid: string, pids: string[]): Related[] {
  const w = (s: Shared[]) => s.reduce((acc, x) => acc + RAG_W[x.kind as RagShareKind], 0)
  return pids
    .filter((p) => p !== pid && ragPublication(p))
    .map((p) => ({ pid: p, shared: ragSharedBetween(pid, p) }))
    .filter((r) => r.shared.length)
    .sort((a, b) => w(b.shared) - w(a.shared) || b.shared.length - a.shared.length || a.pid.localeCompare(b.pid))
}
