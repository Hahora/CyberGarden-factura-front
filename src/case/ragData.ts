import { shallowReactive } from 'vue'
import { isApi } from '../config'
import { RAG_COLUMNS, RAG_PUBLICATIONS, RAG_SUMMARY } from './ragSummary'
import type {
  PublicationRow, RagConfigRow, RagDatasetRow, RagExperimentRow, RagIssueRow, RagPaperSummary, RagResultRow, RagTables, RagTaskRow,
} from './types'

export { RAG_COLUMNS }
export const RAG_TABLE_NAMES = ['publications', 'configurations', 'datasets', 'tasks', 'experiments', 'results', 'issues'] as const
export type RagTableName = (typeof RAG_TABLE_NAMES)[number]

let scopeFn: () => string = () => ''
export const setRagScope = (fn: () => string) => { scopeFn = fn }
const runOfScope = () => (isApi ? scopeFn() : '')
const K = (pid: string, run = runOfScope()) => (run ? run + '|' + pid : pid)
interface ApiRagSummary {
  publication: PublicationRow
  counts?: Partial<Record<string, number>>
  metrics?: { metric_name: string; n: number }[]
  issues?: RagIssueRow[]
  meta?: { is_scan?: boolean; file_status?: string }
}
type Page<T> = { data: T[]; total: number; next_cursor: string | null }
const apiSum = shallowReactive<Record<string, ApiRagSummary | 'missing'>>({})
const sumPending = new Map<string, Promise<ApiRagSummary | undefined>>()
const api = () => import('../api/client')
function loadSum(pid: string, run: string): Promise<ApiRagSummary | undefined> {
  const k = K(pid, run)
  const hit = apiSum[k]
  if (hit) return Promise.resolve(hit === 'missing' ? undefined : hit)
  let p = sumPending.get(k)
  if (!p) {
    p = api()
      .then(({ get }) => get<ApiRagSummary>(`/papers/rag/${encodeURIComponent(pid)}`, { run }, { silent: true }))
      .then((s) => { apiSum[k] = s; return s }, () => { apiSum[k] = 'missing'; return undefined })
      .finally(() => sumPending.delete(k))
    sumPending.set(k, p)
  }
  return p
}
function sumOf(pid: string): ApiRagSummary | undefined {
  const run = runOfScope()
  if (!run) return undefined
  const hit = apiSum[K(pid, run)]
  if (!hit) void loadSum(pid, run)
  return hit && hit !== 'missing' ? hit : undefined
}

const EMPTY: RagPaperSummary = { results: 0, configurations: 0, datasets: 0, tasks: 0, experiments: 0, issues: 0, metrics: [], scan: false }
export const ragPublications = (): PublicationRow[] => RAG_PUBLICATIONS
export const ragPublication = (pid: string): PublicationRow | undefined =>
  runOfScope() ? sumOf(pid)?.publication : RAG_PUBLICATIONS.find((p) => p.publication_id === pid)
export const ragHasData = (pid: string) => (runOfScope() ? true : pid in RAG_SUMMARY)
export const ragInScope = (pid: string) => ragPublication(pid)?.in_scope !== 'false'
export function ragSummaryOf(pid: string): RagPaperSummary {
  if (!runOfScope()) return RAG_SUMMARY[pid] ?? EMPTY
  const s = sumOf(pid)
  if (!s) return EMPTY
  const c = s.counts ?? {}
  return {
    results: c.results ?? 0, configurations: c.configurations ?? 0, datasets: c.datasets ?? 0, tasks: c.tasks ?? 0,
    experiments: c.experiments ?? 0, issues: c.issues ?? s.issues?.length ?? 0,
    metrics: (s.metrics ?? []).map((m) => [m.metric_name, m.n] as [string, number]), scan: !!s.meta?.is_scan,
  }
}
export const ragIsScan = (pid: string) => ragSummaryOf(pid).scan
export function ragTotals(pids: string[] = RAG_PUBLICATIONS.map((p) => p.publication_id)) {
  const t = { papers: 0, results: 0, configurations: 0, datasets: 0, tasks: 0, experiments: 0, issues: 0 }
  for (const pid of pids) {
    const s = ragSummaryOf(pid)
    if (!s.results && !s.issues) continue
    t.papers++; t.results += s.results; t.configurations += s.configurations; t.datasets += s.datasets
    t.tasks += s.tasks; t.experiments += s.experiments; t.issues += s.issues
  }
  return t
}
export function ragTopMetrics(pids: string[], limit = 8): { metric: string; papers: number; count: number }[] {
  const m = new Map<string, { papers: number; count: number }>()
  for (const pid of pids) {
    for (const [name, n] of ragSummaryOf(pid).metrics) {
      const e = m.get(name) ?? { papers: 0, count: 0 }
      e.papers++; e.count += n
      m.set(name, e)
    }
  }
  return [...m].map(([metric, e]) => ({ metric, ...e })).sort((a, b) => b.papers - a.papers || b.count - a.count).slice(0, limit)
}

interface Paper extends RagTables {
  resultById: Map<string, RagResultRow>
  configById: Map<string, RagConfigRow>
  datasetById: Map<string, RagDatasetRow>
  taskById: Map<string, RagTaskRow>
  experimentById: Map<string, RagExperimentRow>
}
type Raw = { columns: Record<string, string[]>; rows: Record<string, string[][]> }
const cache = shallowReactive<Record<string, Paper>>({})
const pending = new Map<string, Promise<void>>()
const failed = shallowReactive<Record<string, string>>({})

function toRows<T>(raw: Raw, t: string): T[] {
  const cols = raw.columns[t] ?? RAG_COLUMNS[t] ?? []
  return (raw.rows[t] ?? []).map((r) => {
    const o: Record<string, string> = {}
    for (let i = 0; i < cols.length; i++) o[cols[i]!] = r[i] ?? ''
    return o as unknown as T
  })
}
const idx = <T>(list: T[], key: (r: T) => string) => new Map(list.map((r) => [key(r), r]))

function put(k: string, t: RagTables) {
  cache[k] = {
    ...t,
    resultById: idx(t.results, (r) => r.result_id), configById: idx(t.configurations, (r) => r.config_id),
    datasetById: idx(t.datasets, (r) => r.dataset_id), taskById: idx(t.tasks, (r) => r.task_id), experimentById: idx(t.experiments, (r) => r.experiment_id),
  }
  delete failed[k]
}
const ROW_TABLES = ['configurations', 'datasets', 'tasks', 'experiments', 'results'] as const
type TablesResp = { tables?: Record<string, Page<unknown>> }
async function fetchApi(pid: string, run: string): Promise<RagTables> {
  const s = await loadSum(pid, run)
  if (!s) throw new Error('Статья не найдена')
  const { get } = await api()
  const path = `/papers/rag/${encodeURIComponent(pid)}`
  const out: Record<string, unknown[]> = {}
  const first = await get<TablesResp>(path, { run, tables: ROW_TABLES.join(','), limit: 1000 }, { silent: true })
  for (const t of ROW_TABLES) {
    const pg = first.tables?.[t]
    const rows: unknown[] = [...(pg?.data ?? [])]
    let cursor = pg?.next_cursor
    for (let i = 0; cursor && i < 200; i++) {
      const next = (await get<TablesResp>(path, { run, tables: t, limit: 1000, cursor }, { silent: true })).tables?.[t]
      rows.push(...(next?.data ?? []))
      cursor = next?.next_cursor
    }
    out[t] = rows
  }
  return {
    configurations: out.configurations as RagConfigRow[], datasets: out.datasets as RagDatasetRow[], tasks: out.tasks as RagTaskRow[],
    experiments: out.experiments as RagExperimentRow[], results: out.results as RagResultRow[], issues: s.issues ?? [],
  }
}
async function fetchLocal(pid: string): Promise<RagTables> {
  const r = await fetch(`/case/rag/${encodeURIComponent(pid)}.json`)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const raw = (await r.json()) as Raw
  return {
    results: toRows<RagResultRow>(raw, 'results'), configurations: toRows<RagConfigRow>(raw, 'configurations'),
    datasets: toRows<RagDatasetRow>(raw, 'datasets'), tasks: toRows<RagTaskRow>(raw, 'tasks'),
    experiments: toRows<RagExperimentRow>(raw, 'experiments'), issues: toRows<RagIssueRow>(raw, 'issues'),
  }
}
export function ragLoad(pid: string): Promise<void> {
  const run = runOfScope()
  const k = K(pid, run)
  if (cache[k] || !ragHasData(pid)) return Promise.resolve()
  let p = pending.get(k)
  if (!p) {
    p = (run ? fetchApi(pid, run) : fetchLocal(pid))
      .then((t) => put(k, t))
      .catch((e: unknown) => { failed[k] = e instanceof Error ? e.message : 'ошибка загрузки' })
      .finally(() => { pending.delete(k) })
    pending.set(k, p)
  }
  return p
}
export const ragLoadAll = (pids: string[]): Promise<void> => Promise.all(pids.map(ragLoad)).then(() => undefined)
export function ragRetry(pids: string[]): Promise<void> {
  for (const p of pids) if (failed[K(p)]) { delete failed[K(p)]; delete apiSum[K(p)] }
  return ragLoadAll(pids)
}
export const ragLoaded = (pid: string) => !!cache[K(pid)]
export const ragLoadError = (pid: string) => failed[K(pid)] ?? (runOfScope() && apiSum[K(pid)] === 'missing' ? 'Статья не найдена' : '')

export const ragResultsOf = (pid: string): RagResultRow[] => cache[K(pid)]?.results ?? []
export const ragConfigsOf = (pid: string): RagConfigRow[] => cache[K(pid)]?.configurations ?? []
export const ragDatasetsOf = (pid: string): RagDatasetRow[] => cache[K(pid)]?.datasets ?? []
export const ragTasksOf = (pid: string): RagTaskRow[] => cache[K(pid)]?.tasks ?? []
export const ragExperimentsOf = (pid: string): RagExperimentRow[] => cache[K(pid)]?.experiments ?? []
export const ragIssuesOf = (pid: string): RagIssueRow[] => cache[K(pid)]?.issues ?? []
export const ragResult = (pid: string, rid: string): RagResultRow | undefined => cache[K(pid)]?.resultById.get(rid)
export const ragConfig = (pid: string, id: string): RagConfigRow | undefined => cache[K(pid)]?.configById.get(id)
export const ragDataset = (pid: string, id: string): RagDatasetRow | undefined => cache[K(pid)]?.datasetById.get(id)
export const ragTask = (pid: string, id: string): RagTaskRow | undefined => cache[K(pid)]?.taskById.get(id)
export const ragExperiment = (pid: string, id: string): RagExperimentRow | undefined => cache[K(pid)]?.experimentById.get(id)
export const ragIssue = (pid: string, id: string): RagIssueRow | undefined => ragIssuesOf(pid).find((i) => i.issue_id === id)
export const ragIssuesForResult = (pid: string, rid: string): RagIssueRow[] =>
  ragIssuesOf(pid).filter((i) => i.record_ids.split(';').map((s) => s.trim()).includes(rid))
export const ragAllResults = (pids: string[]): RagResultRow[] => pids.flatMap(ragResultsOf)
