import { reactive } from 'vue'
import { runs, filesPair, type RunEx } from '../case/runs'
import type { FileStatus, Run, RunFile } from '../case/types'
import { dropPaper, remoteIds, setRemoteDomain, setRemoteFiles } from './papers'
import { ApiError, get, getAll, request, upload } from './client'
import { toast } from '../store'
import { download } from '../exporters'
import { fmtInt } from '../fmt'
import { plural } from '../search'

interface ApiFile {
  id: string; name: string; status: FileStatus; status_label?: string; stage?: string; progress?: number; has_data?: boolean; eta_seconds?: number | null
  results?: number; issues?: number; reason?: string | null
}
export interface ApiRun {
  id: string; title: string; domain: string; status: Run['apiStatus']; created_at: string; updated_at?: string; progress?: number; eta_seconds?: number | null
  counts?: { files: number; queued: number; running: number; done: number; out: number; error: number; nodata: number }
  results?: number; issues?: number; files?: ApiFile[]; rejected?: { name: string; code: string; message: string }[]
}
export interface ApiSummary {
  files: number; papers_in_scope: number; papers_out: number; files_without_results: number; files_error: number
  results: number; scored_results: number; issues_total: number
  coverage: { metric: string; n: number; total: number; results?: number }[]
  issues_by_check: { check_name: string; total: number }[]
}

export const summaries = reactive<Record<string, ApiSummary | undefined>>({})
const sumPending = new Set<string>()
const sumErr = reactive<Record<string, boolean>>({})
export const summaryLoading = (id: string) => { summaryOf(id); return !summaries[id] && !sumErr[id] }
export const summaryFailed = (id: string) => !!sumErr[id] && !summaries[id]
export function retrySummary(id: string) { delete sumErr[id]; sumPending.delete(id); void summaryOf(id) }
export function summaryOf(id: string): ApiSummary | undefined {
  if (!summaries[id] && !sumPending.has(id)) {
    sumPending.add(id)
    get<ApiSummary>(`/runs/${id}/summary`, undefined, { silent: true }).then((s) => { summaries[id] = s }).catch(() => { sumErr[id] = true }).finally(() => sumPending.delete(id))
  }
  return summaries[id]
}

const FINISHED: FileStatus[] = ['done', 'ocr', 'out', 'nodata', 'error']
function mapFile(f: ApiFile, old?: RunFile): RunFile {
  const st = f.status
  return {
    id: f.id, name: f.name, status: st,
    progress: st === 'running' ? f.progress ?? old?.progress ?? 0 : st === 'queued' ? 0 : 100,
    hasData: f.has_data ?? (st === 'done' || st === 'ocr'),
    reason: st === 'out' || st === 'error' ? f.reason ?? f.status_label ?? undefined : undefined,
    stage: st === 'running' ? f.stage : undefined,
    eta: (st === 'running' || st === 'queued') && f.eta_seconds != null ? f.eta_seconds : undefined,
  }
}
export function upsert(a: ApiRun) {
  let r = runs.find((x) => x.id === a.id) as RunEx | undefined
  const isNew = !r
  const files = (a.files ?? []).map((f) => mapFile(f, r?.files.find((o) => o.id === f.id)))
  if (r) {
    for (const f of files) {
      const o = r.files.find((x) => x.id === f.id)
      if (o && o.status !== f.status && FINISHED.includes(f.status)) dropPaper(a.id, f.id)
    }
    if (r.apiStatus !== a.status && a.status === 'done') { delete summaries[a.id]; dropPaper(a.id) }
  } else {
    r = { id: a.id, title: a.title, domain: a.domain === 'rag' ? 'rag' : 'solar', createdAt: 0, files: [], remote: true } as RunEx
  }
  r.title = a.title
  r.domain = a.domain === 'rag' ? 'rag' : 'solar'
  setRemoteDomain(a.id, r.domain)
  if (a.files) setRemoteFiles(a.id, files.filter((f) => f.status === 'done' || f.status === 'out' || f.status === 'nodata' || f.status === 'ocr').map((f) => f.id))
  r.createdAt = Date.parse(a.created_at) || Date.now()
  r.apiStatus = a.status
  r.apiResults = a.results ?? 0
  r.apiIssues = a.issues ?? 0
  r.apiProgress = a.progress ?? undefined
  r.apiEta = a.eta_seconds ?? undefined
  if (a.files) { r.files = files; (r as RunEx).detail = true }
  const ids = r.files.map((f) => f.id)
  if (!r.messages?.length) r.messages = filesPair(r.createdAt, ids)
  else for (const m of r.messages) if (m.kind === 'files' || m.kind === 'run') m.fileIds = ids
  if (isNew) { remoteIds.add(a.id); runs.push(r) }
}

let timer = 0
const active = (r: Run) => r.remote && (r.apiStatus === 'queued' || r.apiStatus === 'running')
async function tick() {
  timer = 0
  for (const r of runs.filter(active)) {
    try { upsert(await get<ApiRun>(`/runs/${encodeURIComponent(r.id)}`, undefined, { silent: true })) } catch { }
  }
  schedule()
}
export function schedule() {
  if (!timer && runs.some(active)) timer = window.setTimeout(tick, 2000)
}
export async function loadRun(id: string): Promise<boolean> {
  try { upsert(await get<ApiRun>(`/runs/${encodeURIComponent(id)}`, undefined, { silent: true })); schedule(); return true } catch { schedule(); return false }
}
export async function refreshRuns() {
  const list = await getAll<ApiRun>('/runs', { limit: 50 }, { silent: true })
  const ids = new Set(list.map((r) => r.id))
  for (const a of list) upsert(a)
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.remote && !ids.has(runs[i]!.id)) { remoteIds.delete(runs[i]!.id); runs.splice(i, 1) }
  schedule()
}
export function clearRemote() {
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.remote) runs.splice(i, 1)
  remoteIds.clear()
}

export async function rerunAsApi(runId: string, fileIds: string[], domain: 'solar' | 'rag', title: string): Promise<string | null | undefined> {
  try {
    const a = await request<ApiRun>(`/runs/${encodeURIComponent(runId)}/rerun-as`, { method: 'POST', body: { domain, file_ids: fileIds, title }, silent: true })
    upsert(a)
    schedule()
    return a.id
  } catch (e) {
    if (e instanceof ApiError && (e.status === 405 || (e.status === 404 && e.code !== 'not_found'))) return undefined
    if (e instanceof ApiError && e.code !== 'network') toast(e.message)
    return null
  }
}

const isZip = (f: File) => /\.zip$/i.test(f.name) || /zip/.test(f.type)
export async function createApiRun(files: File[], opts: { title?: string; domain?: 'solar' | 'rag'; onProgress?: (p: number) => void } = {}): Promise<string | null> {
  const fd = new FormData()
  const zips = files.filter(isZip)
  const pdfs = files.filter((f) => !isZip(f))
  if (pdfs.length) {
    for (const f of pdfs) fd.append('file', f, (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
    if (zips.length) toast('ZIP вместе с PDF не загружается — отправьте архив отдельно')
  } else if (zips.length) {
    fd.append('archive', zips[0]!, zips[0]!.name)
    if (zips.length > 1) toast('За раз загружается один ZIP — остальные пропущены')
  } else return null
  fd.append('domain', opts.domain ?? 'solar')
  if (opts.title) fd.append('title', opts.title)
  let a: ApiRun
  try { a = await upload<ApiRun>('/runs', fd, opts.onProgress) } catch { return null }
  if (a.rejected?.length) {
    const head = a.rejected.slice(0, 3).map((x) => `${x.name} — ${x.message}`).join('; ')
    toast(`Не приняты: ${head}${a.rejected.length > 3 ? ` и ещё ${a.rejected.length - 3}` : ''}`)
  }
  upsert(a)
  schedule()
  return a.id
}

const nameFrom = (r: Response, fallback: string) => {
  const x = r.headers.get('X-Export-Filename')
  if (x) { try { return decodeURIComponent(x) } catch { return x } }
  return fallback
}
export async function downloadServerSet(runId: string, partial = false, check = true): Promise<boolean> {
  try {
    const query: Record<string, boolean> = {}
    if (partial) query.partial = true
    if (check) query.check = true
    const r = await request<Response>(`/runs/${encodeURIComponent(runId)}/submission.zip`, { raw: true, silent: true, query })
    const blob = await r.blob()
    download(nameFrom(r, `submission-${runId}.zip`), blob, 'application/zip')
    const v = Number(r.headers.get('X-Export-Results') ?? NaN)
    const p = Number(r.headers.get('X-Export-Papers') ?? NaN)
    const t = r.headers.get('X-Export-Tables') ?? '7'
    const st = r.headers.get('X-Check-Status')
    const checkText = st === 'ok' ? ' · проверка check_submission.py пройдена'
      : st === 'warnings' ? ' · проверка пройдена с предупреждениями — см. check_report.txt в архиве'
      : ''
    toast((Number.isFinite(v) && Number.isFinite(p)
      ? `Скачано: ${t} таблиц, ${fmtInt(v)} ${plural(v, ['значение', 'значения', 'значений'])} из ${fmtInt(p)} ${plural(p, ['статья', 'статьи', 'статей'])}`
      : `Скачано: ${t} таблиц`) + checkText)
    return true
  } catch (e) {
    if (e instanceof ApiError && e.code === 'run_in_progress') {
      toast(e.message || 'Разбор ещё идёт', { label: 'Скачать готовое', run: () => void downloadServerSet(runId, true, check) })
    } else if (e instanceof ApiError && e.code === 'submission_invalid') {
      const errs = (e.details as { errors?: unknown[] } | undefined)?.errors
      const first = Array.isArray(errs) && errs.length ? String(errs[0]) : ''
      toast(`Набор не прошёл проверку check_submission.py${first ? ': ' + first : ''}`, { label: 'Скачать без проверки', run: () => void downloadServerSet(runId, partial, false) })
    } else if (e instanceof ApiError) { if (e.code !== 'network') toast(e.message) }
    else toast('Не удалось скачать набор')
    return false
  }
}
