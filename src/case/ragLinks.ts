import { ragConfigsOf, ragDatasetsOf, ragLoad, ragPublication, ragPublications, ragSummaryOf } from './ragData'

export type RagShareKind = 'dataset' | 'generator' | 'embedding' | 'retriever'
export interface RagShared { kind: RagShareKind; label: string }
export interface RagRelated { pid: string; title: string; shared: RagShared[] }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const ORDER: Record<RagShareKind, number> = { dataset: 0, generator: 1, embedding: 2, retriever: 3 }

export function ragFacets(pid: string): Map<string, RagShared> {
  const m = new Map<string, RagShared>()
  const add = (kind: RagShareKind, v: string) => { const n = norm(v); if (n && !m.has(kind + '|' + n)) m.set(kind + '|' + n, { kind, label: v.trim() }) }
  for (const d of ragDatasetsOf(pid)) add('dataset', d.dataset_name)
  for (const c of ragConfigsOf(pid)) {
    add('generator', c.generator_model); add('embedding', c.embedding_model); add('retriever', c.retriever_model)
  }
  return m
}

export async function ragRelated(pid: string, onProgress?: (list: RagRelated[]) => void): Promise<RagRelated[]> {
  await ragLoad(pid)
  const mine = ragFacets(pid)
  const others = ragPublications().map((p) => p.publication_id).filter((p) => p !== pid && ragSummaryOf(p).results > 0)
    .sort((a, b) => ragSummaryOf(a).results - ragSummaryOf(b).results)
  const out = new Map<string, RagRelated>()
  const publish = () => [...out.values()].sort((a, b) => b.shared.length - a.shared.length || a.pid.localeCompare(b.pid))
  for (const o of others) {
    await ragLoad(o)
    const shared: RagShared[] = []
    for (const [k, v] of ragFacets(o)) if (mine.has(k)) shared.push(v)
    if (shared.length) {
      shared.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.label.localeCompare(b.label))
      out.set(o, { pid: o, title: ragPublication(o)?.title ?? o, shared })
      onProgress?.(publish())
    }
  }
  return publish()
}
