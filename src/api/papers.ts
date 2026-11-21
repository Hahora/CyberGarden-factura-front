import { shallowReactive } from 'vue'
import { API_URL } from '../config'
import { get } from './client'
import type { ServerIssueState, ServerReview } from './edits'
import type { DeviceRow, IssueRow, LayerRow, MaterialRow, MeasurementRow, PublicationRow, ResultRow } from '../case/types'

export interface ResultMeta { quote_found?: boolean; issue_ids?: string[]; duplicates?: string[] }
export interface ApiPaper {
  publication: PublicationRow
  materials: MaterialRow[]
  devices: DeviceRow[]
  layers: LayerRow[]
  measurements: MeasurementRow[]
  results: ResultRow[]
  issues: IssueRow[]
  paper_status: 'has_data' | 'nodata' | 'out'
  reviews?: Record<string, ServerReview>
  issue_states?: Record<string, ServerIssueState>
  meta?: { file_status?: string; run_ids?: string[]; pdf_pages?: number; results?: Record<string, ResultMeta>; suggested_domain?: 'solar' | 'rag' | null }
}

type EditsHook = (run: string, domain: 'solar' | 'rag', pid: string, reviews?: Record<string, ServerReview>, states?: Record<string, ServerIssueState>) => void
let editsHook: EditsHook = () => {}
export const setEditsHook = (fn: EditsHook) => { editsHook = fn }
export const adoptEdits: EditsHook = (...a) => editsHook(...a)

export const remoteIds = shallowReactive(new Set<string>())
export const isRemoteScope = (id: string) => remoteIds.has(id)
const ragRuns = shallowReactive(new Set<string>())
const ready = shallowReactive(new Map<string, Set<string>>())
export function setRemoteFiles(id: string, pids: string[]) { ready.set(id, new Set(pids)) }
export const isReady = (run: string, pid: string) => ready.get(run)?.has(pid) ?? true
export function setRemoteDomain(id: string, domain: 'solar' | 'rag') {
  if (domain === 'rag') ragRuns.add(id)
  else ragRuns.delete(id)
}

const cache = shallowReactive(new Map<string, ApiPaper | 'missing'>())
const SEP = '|'
const key = (run: string, pid: string) => run + SEP + pid
const queue: (() => Promise<void>)[] = []
const pending = new Set<string>()
let active = 0
function pump() {
  while (active < 4 && queue.length) {
    active++
    void queue.shift()!().finally(() => { active--; pump() })
  }
}
async function fetchPaper(run: string, pid: string): Promise<ApiPaper> {
  const p = await get<ApiPaper>(`/papers/solar/${encodeURIComponent(pid)}`, { run }, { silent: true })
  adoptEdits(run, 'solar', pid, p.reviews, p.issue_states)
  return p
}
export function paperOf(run: string, pid: string): ApiPaper | undefined {
  if (ragRuns.has(run) || !isReady(run, pid)) return undefined
  const k = key(run, pid)
  const hit = cache.get(k)
  if (hit) return hit === 'missing' ? undefined : hit
  if (!pending.has(k)) {
    pending.add(k)
    queue.push(async () => {
      try { cache.set(k, await fetchPaper(run, pid)) }
      catch { cache.set(k, 'missing') } finally { pending.delete(k) }
    })
    pump()
  }
  return undefined
}
const refreshTimers = new Map<string, number>()
export function refreshPaper(run: string, pid: string) {
  const k = key(run, pid)
  if (!cache.has(k)) return
  window.clearTimeout(refreshTimers.get(k))
  refreshTimers.set(k, window.setTimeout(() => {
    refreshTimers.delete(k)
    fetchPaper(run, pid).then((p) => cache.set(k, p), () => {})
  }, 400))
}
export const paperLoaded = (run: string, pid: string) => ragRuns.has(run) || !isReady(run, pid) || cache.has(key(run, pid))
export const paperFailed = (run: string, pid: string) => cache.get(key(run, pid)) === 'missing'
export function dropPaper(run: string, pid?: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(run + SEP) && (!pid || k === key(run, pid))) cache.delete(k)
}
export const pdfApiUrl = (pid: string, domain: 'solar' | 'rag' = 'solar', run?: string) => `${API_URL}/papers/${domain}/${encodeURIComponent(pid)}/pdf${run ? '?run=' + encodeURIComponent(run) : ''}`
