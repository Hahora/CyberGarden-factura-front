import { reactive } from 'vue'
import { runs, filesPair, type RunEx } from '../case/runs'
import type { FileStatus, Run, RunFile } from '../case/types'
import { dropPaper, remoteIds, setRemoteDomain, setRemoteFiles } from './papers'
import { ApiError, accessToken, get, getAll, request, upload } from './client'
import { API_URL } from '../config'
import { toast } from '../store'
import { download } from '../exporters'
import { fmtInt } from '../fmt'
import { plural } from '../search'

interface ApiFile {
  id: string; name: string; status: FileStatus; status_label?: string; stage?: string; progress?: number; has_data?: boolean; eta_seconds?: number | null
  results?: number; issues?: number; reason?: string | null; pages?: number | null
  open_issue_count?: number; suggested_domain?: 'solar' | 'rag' | null; ocr_confidence?: number | null; title?: string | null
}
export interface ApiRun {
  id: string; title: string; domain: string; status: Run['apiStatus']; created_at: string; updated_at?: string; progress?: number; eta_seconds?: number | null
  counts?: { files: number; queued: number; running: number; done: number; out: number; error: number; nodata: number }
  results?: number; issues?: number; issues_open?: number; pinned?: boolean; files?: ApiFile[]; rejected?: { name: string; code: string; message: string }[]
}
export interface ApiSummary {
  files: number; papers_in_scope: number; papers_out: number; files_without_results: number; files_error: number
  results: number; scored_results: number; issues_total: number; issues_open?: number
  coverage: { metric: string; n: number; total: number; results?: number }[]
  issues_by_check: { check_name: string; total: number }[]
  best_values?: Record<string, { pid: string; result_id: string; value: number; unit?: string | null; aggregation?: string; corrected?: boolean }>
}
export const issueStats = reactive<Record<string, { check_name: string; count: number; papers: number }[] | undefined>>({})

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
    get<{ data: { check_name: string; count: number; papers: number }[] }>('/issues/stats', { run: id }, { silent: true }).then((s) => { issueStats[id] = s.data }).catch(() => { delete issueStats[id] })
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
    suggestedDomain: st === 'out' ? (f.suggested_domain ?? old?.suggestedDomain ?? undefined) : undefined,
    ocrConfidence: f.ocr_confidence ?? old?.ocrConfidence ?? undefined,
    openIssues: f.open_issue_count ?? undefined,
    title: f.title?.trim() || old?.title || undefined,
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
  r.apiIssuesOpen = a.issues_open ?? undefined
  if (a.pinned !== undefined) r.pinned = a.pinned
  r.apiEta = a.eta_seconds ?? undefined
  if (a.files) { r.files = files; (r as RunEx).detail = true }
  const ids = r.files.map((f) => f.id)
  if (!r.messages?.length) r.messages = filesPair(r.createdAt, ids)
  else for (const m of r.messages) if (m.kind === 'files' || m.kind === 'run') m.fileIds = ids
  if (isNew) { remoteIds.add(a.id); runs.push(r) }
}

let timer = 0
const active = (r: Run) => r.remote && (r.apiStatus === 'queued' || r.apiStatus === 'running')
const streams = new Map<string, EventSource>()
const noSse = new Set<string>()
type FileEvent = ApiFile
type RunEvent = Pick<ApiRun, 'status' | 'results' | 'issues' | 'issues_open'> & { progress?: number | null; eta_seconds?: number | null }
function applyFile(id: string, f: FileEvent) {
  const r = runs.find((x) => x.id === id)
  if (!r || !f?.id) return
  const i = r.files.findIndex((x) => x.id === f.id)
  const old = i >= 0 ? r.files[i] : undefined
  const nf = mapFile(f, old)
  if (old && old.status !== nf.status && FINISHED.includes(nf.status)) dropPaper(id, f.id)
  if (i >= 0) r.files[i] = nf
  else r.files.push(nf)
}
function applyRun(id: string, a: RunEvent) {
  const r = runs.find((x) => x.id === id)
  if (!r || !a) return
  if (a.status) r.apiStatus = a.status
  if (a.results != null) r.apiResults = a.results
  if (a.issues != null) r.apiIssues = a.issues
  if (a.issues_open != null) r.apiIssuesOpen = a.issues_open
  r.apiProgress = a.progress ?? undefined
  r.apiEta = a.eta_seconds ?? undefined
}
function stream(id: string) {
  const token = accessToken()
  if (streams.has(id) || noSse.has(id) || typeof EventSource === 'undefined' || !token) return
  const es = new EventSource(`${API_URL}/runs/${encodeURIComponent(id)}/events?access_token=${encodeURIComponent(token)}`)
  streams.set(id, es)
  let got = false
  const stop = () => { es.close(); streams.delete(id) }
  const read = <T>(e: Event): T | null => {
    got = true
    try { return JSON.parse((e as MessageEvent<string>).data) as T } catch { return null }
  }
  es.addEventListener('file.progress', (e) => { const f = read<FileEvent>(e); if (f) applyFile(id, f) })
  es.addEventListener('file.done', (e) => { const f = read<FileEvent>(e); if (f) applyFile(id, f); void loadRun(id) })
  es.addEventListener('run.progress', (e) => { const a = read<RunEvent>(e); if (a) applyRun(id, a) })
  es.addEventListener('run.done', (e) => { read(e); stop(); void loadRun(id) })
  es.onerror = () => {
    if (got && es.readyState !== EventSource.CLOSED) return
    stop()
    if (!got) noSse.add(id)
    schedule()
  }
}
async function tick() {
  timer = 0
  for (const r of runs.filter((x) => active(x) && !streams.has(x.id))) {
    try { upsert(await get<ApiRun>(`/runs/${encodeURIComponent(r.id)}`, undefined, { silent: true })) } catch { }
  }
  schedule()
}
export function schedule() {
  for (const r of runs) if (active(r)) stream(r.id)
  if (!timer && runs.some((r) => active(r) && !streams.has(r.id))) timer = window.setTimeout(tick, 2000)
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
  for (const es of streams.values()) es.close()
  streams.clear()
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.remote) runs.splice(i, 1)
  remoteIds.clear()
}

export function dropSummary(id: string) {
  delete summaries[id]
  delete issueStats[id]
  delete sumErr[id]
  sumPending.delete(id)
}
export function reloadRunPapers(id: string) {
  dropPaper(id)
  dropSummary(id)
}

const runPath = (id: string) => `/runs/${encodeURIComponent(id)}`
async function act(fn: () => Promise<ApiRun | void>, fail: string): Promise<boolean> {
  try {
    const a = await fn()
    if (a) { upsert(a); schedule() }
    return true
  } catch (e) {
    toast(e instanceof ApiError && e.code !== 'network' ? e.message : fail)
    return false
  }
}
export const patchRun = (id: string, body: { title?: string; pinned?: boolean }) =>
  act(() => request<ApiRun>(runPath(id), { method: 'PATCH', body, silent: true }), 'Не удалось сохранить разбор')
export const restartApiRun = (id: string, fileIds?: string[]) =>
  act(() => request<ApiRun>(`${runPath(id)}/restart`, { method: 'POST', body: fileIds ? { file_ids: fileIds } : {}, silent: true }).then((a) => { reloadRunPapers(id); return a }), 'Не удалось перезапустить разбор')
export const stopApiRun = (id: string) =>
  act(() => request<ApiRun>(`${runPath(id)}/stop`, { method: 'POST', silent: true }), 'Не удалось остановить разбор')
export async function deleteApiRun(id: string): Promise<boolean> {
  const ok = await act(() => request<void>(runPath(id), { method: 'DELETE', silent: true }), 'Не удалось удалить разбор')
  if (ok) {
    const i = runs.findIndex((r) => r.id === id)
    if (i >= 0) runs.splice(i, 1)
    remoteIds.delete(id)
  }
  return ok
}
export async function addFilesApi(id: string, files: File[], onProgress?: (p: number) => void): Promise<number> {
  const fd = formOf(files)
  if (!fd) return 0
  const before = new Set(runs.find((r) => r.id === id)?.files.map((f) => f.id) ?? [])
  let a: ApiRun
  try { a = await upload<ApiRun>(`${runPath(id)}/files`, fd, onProgress) } catch { return 0 }
  rejectedToast(a)
  upsert(a)
  dropSummary(id)
  schedule()
  return (a.files ?? []).filter((f) => !before.has(f.id)).length
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
function formOf(files: File[]): FormData | null {
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
  return fd
}
function rejectedToast(a: ApiRun) {
  if (!a.rejected?.length) return
  const head = a.rejected.slice(0, 3).map((x) => `${x.name} — ${x.message}`).join('; ')
  toast(`Не приняты: ${head}${a.rejected.length > 3 ? ` и ещё ${a.rejected.length - 3}` : ''}`)
}
export async function createApiRun(files: File[], opts: { title?: string; domain?: 'solar' | 'rag'; onProgress?: (p: number) => void } = {}): Promise<string | null> {
  const fd = formOf(files)
  if (!fd) return null
  fd.append('domain', opts.domain ?? 'solar')
  if (opts.title) fd.append('title', opts.title)
  let a: ApiRun
  try { a = await upload<ApiRun>('/runs', fd, opts.onProgress) } catch { return null }
  rejectedToast(a)
  upsert(a)
  schedule()
  return a.id
}

const nameFrom = (r: Response, fallback: string) => {
  const x = r.headers.get('X-Export-Filename')
  if (x) { try { return decodeURIComponent(x) } catch { return x } }
  return fallback
}
type Fmt = 'zip' | 'json' | 'xlsx'
const MIME: Record<Fmt, string> = { zip: 'application/zip', json: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const FILE: Record<Fmt, string> = { zip: 'submission.zip', json: 'dataset.json', xlsx: 'dataset.xlsx' }
const STEM: Record<Fmt, string> = { zip: 'submission', json: 'submission', xlsx: 'results' }
export function downloadServerSet(runId: string, partial = false, check = true): Promise<boolean> {
  return downloadServer({ runId, fmt: 'zip', partial, check })
}
export function downloadAllRunsSet(domain: 'solar' | 'rag', partial = false, check = true): Promise<boolean> {
  return downloadServer({ domain, fmt: 'zip', partial, check })
}
export function downloadServerData(runId: string, fmt: 'json' | 'xlsx', partial = false): Promise<boolean> {
  return downloadServer({ runId, fmt, partial, check: false })
}
type DlOpts = { runId?: string; domain?: 'solar' | 'rag'; fmt: Fmt; partial: boolean; check: boolean }
async function downloadServer(o: DlOpts): Promise<boolean> {
  const again = (p: Partial<DlOpts>) => () => void downloadServer({ ...o, ...p })
  try {
    const query: Record<string, string | boolean> = {}
    if (o.domain) query.domain = o.domain
    if (o.partial) query.partial = true
    if (o.check) query.check = true
    const path = o.runId ? `/runs/${encodeURIComponent(o.runId)}/${FILE[o.fmt]}` : '/submission.zip'
    const r = await request<Response>(path, { raw: true, silent: true, query })
    const blob = await r.blob()
    const ext = o.fmt === 'xlsx' ? 'xlsx' : o.fmt
    download(nameFrom(r, o.runId ? `${STEM[o.fmt]}-${o.runId}.${ext}` : 'submission-all.zip'), blob, MIME[o.fmt])
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
      toast(e.message || 'Разбор ещё идёт', { label: 'Скачать готовое', run: again({ partial: true }) })
    } else if (e instanceof ApiError && e.code === 'submission_invalid') {
      const errs = (e.details as { errors?: unknown[] } | undefined)?.errors
      const first = Array.isArray(errs) && errs.length ? String(errs[0]) : ''
      toast(`Набор не прошёл проверку check_submission.py${first ? ': ' + first : ''}`, { label: 'Скачать без проверки', run: again({ check: false }) })
    } else if (e instanceof ApiError) { if (e.code !== 'network') toast(e.message) }
    else toast('Не удалось скачать набор')
    return false
  }
}
