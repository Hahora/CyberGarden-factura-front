import { reactive, watch } from 'vue'
import {
  NODATA_TEXT, adoptLegacyEdits, hasData, inScope, issueStateIn, issuesOf, paperKey, pruneScopes, publication,
  ragHasData, ragInScope, ragIssuesOf, ragPublication, ragSummaryOf, ragTopMetrics, ragTotals, registerPdf, resultsOf,
  reviewCountIn, reviewIn, reviewScope, setReviewScope,
} from './index'
import { METRICS, type FileStatus, type Run, type RunFile } from './types'
import { toast } from '../store'
import { DOMAIN_RU, pdfUrl } from './index'
import { isApi } from '../config'
import { summaryOf } from '../api/runs'

const hasDataIn = (domain: Run['domain'], pid: string) => (domain === 'rag' ? ragHasData(pid) : hasData(pid))
const inScopeIn = (domain: Run['domain'], pid: string) => (domain === 'rag' ? ragInScope(pid) : inScope(pid))
const publicationIn = (domain: Run['domain'], pid: string) => (domain === 'rag' ? ragPublication(pid) : publication(pid))
const KEY = 'gs:case:runs'
const NODATA = NODATA_TEXT

export const runs = reactive<Run[]>([])
try {
  const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
  if (Array.isArray(v) && !isApi) runs.push(...(v as Run[]).filter((r) => r && typeof r.id === 'string' && Array.isArray(r.files) && !r.remote && !(r as { demo?: boolean }).demo))
} catch { }
watch(runs, (v) => { if (isApi) return; try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { } }, { deep: true })

export const runOf = (id: string): Run | undefined => runs.find((r) => r.id === id)
export const sortedRuns = () => [...runs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt)

export type Msg =
  | { id: string; role: 'user'; kind: 'files'; at: number; fileIds: string[] }
  | { id: string; role: 'system'; kind: 'run'; at: number; fileIds: string[] }
  | { id: string; role: 'user'; kind: 'question'; at: number; text: string }
  | { id: string; role: 'system'; kind: 'answer'; at: number; q: string; answer?: unknown; pending?: boolean; error?: string }
export type RunEx = Run & { detail?: boolean; messages?: Msg[]; batches?: { id: string; at: number; fileIds: string[] }[] }
let mseq = 0
const mid = () => 'm' + Date.now().toString(36) + (mseq++).toString(36)
export const filesPair = (at: number, fileIds: string[]): Msg[] => [
  { id: mid(), role: 'user', kind: 'files', at, fileIds },
  { id: mid(), role: 'system', kind: 'run', at, fileIds },
]
export function messagesOf(id: string): Msg[] {
  return (runOf(id) as RunEx | undefined)?.messages ?? []
}
function migrate(r: RunEx) {
  if (r.messages) return
  const bs = r.batches?.length ? r.batches : [{ id: 'b0', at: r.createdAt, fileIds: r.files.map((f) => f.id) }]
  r.messages = bs.flatMap((b) => filesPair(b.at, b.fileIds))
  delete r.batches
}
for (const r of runs) migrate(r as RunEx)

for (const r of runs) {
  for (const f of r.files) if (f.status === 'nodata' && f.reason && /бэк/.test(f.reason)) f.reason = NODATA_TEXT
}

adoptLegacyEdits((pid) => runs.filter((r) => r.files.some((f) => f.id === pid)).map((r) => r.id))
pruneScopes(runs.map((r) => r.id))
if (!runOf(reviewScope.value)) setReviewScope(sortedRuns()[0]?.id ?? '')

function finish(f: RunFile, domain: Run['domain']) {
  f.progress = 100
  f.hasData = hasDataIn(domain, f.id)
  if (!f.hasData) {
    f.status = 'nodata'
    f.reason = NODATA
  } else if (!inScopeIn(domain, f.id)) {
    f.status = 'out'
    f.reason = publicationIn(domain, f.id)?.exclusion_reason || 'не по теме'
  } else {
    f.status = 'done'
    f.reason = undefined
  }
}

const PARALLEL = 3
const TICK = 100
interface Job { runId: string; fileId: string; timer: number; left: number; total: number }
const jobs = new Map<string, Job>()
const jkey = (runId: string, fileId: string) => runId + '\u0000' + fileId
const fileOf = (runId: string, fileId: string) => runOf(runId)?.files.find((f) => f.id === fileId)

function pump() {
  if (jobs.size >= PARALLEL) return
  for (const r of runs) {
    if (r.remote) continue
    for (const f of r.files) {
      if (jobs.size >= PARALLEL) return
      if (f.status !== 'queued' || jobs.has(jkey(r.id, f.id))) continue
      start(r.id, f)
    }
  }
}
function start(runId: string, f: RunFile) {
  const total = 1500 + Math.random() * 2500
  f.status = 'running'
  f.progress = 0
  const job: Job = { runId, fileId: f.id, timer: 0, left: total, total }
  job.timer = window.setInterval(() => {
    const file = fileOf(runId, job.fileId)
    if (!file || file.status !== 'running') return drop(job)
    job.left -= TICK
    if (job.left <= 0) {
      finish(file, runOf(runId)?.domain ?? 'solar')
      drop(job)
      pump()
      return
    }
    file.progress = Math.min(99, Math.round((1 - job.left / job.total) * 100))
  }, TICK)
  jobs.set(jkey(runId, f.id), job)
}
function drop(job: Job) {
  clearInterval(job.timer)
  jobs.delete(jkey(job.runId, job.fileId))
}
for (const r of runs) for (const f of r.files) if (f.status === 'running') { f.status = 'queued'; f.progress = 0 }
pump()

export const isRunning = (id: string) => !!runOf(id)?.files.some((f) => f.status === 'queued' || f.status === 'running')
export function runProgress(id: string) {
  const fs = runOf(id)?.files ?? []
  return fs.length ? Math.round(fs.reduce((s, f) => s + (f.status === 'queued' ? 0 : f.status === 'running' ? f.progress : 100), 0) / fs.length) : 100
}

interface Entry { name: string; blob: Blob | null }
const u16 = (v: DataView, o: number) => v.getUint16(o, true)
const u32 = (v: DataView, o: number) => v.getUint32(o, true)
function decodeName(bytes: Uint8Array, utf8: boolean) {
  if (utf8) return new TextDecoder().decode(bytes)
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return new TextDecoder('ibm866').decode(bytes) }
}
async function inflate(data: Blob, method: number): Promise<Blob | null> {
  if (method === 0) return data
  if (method !== 8 || typeof DecompressionStream === 'undefined') return null
  try {
    return await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob()
  } catch { return null }
}
export async function readZip(file: Blob): Promise<Entry[]> {
  const tailLen = Math.min(file.size, 65_557)
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer())
  let eocd = -1
  for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) return []
  const count = u16(tail, eocd + 10)
  const cdSize = u32(tail, eocd + 12)
  const cdOff = u32(tail, eocd + 16)
  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer())
  const out: Entry[] = []
  let p = 0
  for (let n = 0; n < count && p + 46 <= cd.byteLength && u32(cd, p) === 0x02014b50; n++) {
    const flags = u16(cd, p + 8)
    const method = u16(cd, p + 10)
    const size = u32(cd, p + 20)
    const nameLen = u16(cd, p + 28)
    const extraLen = u16(cd, p + 30)
    const commentLen = u16(cd, p + 32)
    const local = u32(cd, p + 42)
    const full = decodeName(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen), !!(flags & 0x800))
    p += 46 + nameLen + extraLen + commentLen
    const name = full.split('/').pop() ?? ''
    if (!/\.pdf$/i.test(name) || full.startsWith('__MACOSX/') || name.startsWith('._')) continue
    let blob: Blob | null = null
    try {
      const lh = new DataView(await file.slice(local, local + 30).arrayBuffer())
      if (u32(lh, 0) === 0x04034b50 && !(flags & 1)) {
        const start = local + 30 + u16(lh, 26) + u16(lh, 28)
        const raw = await inflate(file.slice(start, start + size), method)
        if (raw) blob = new Blob([raw], { type: 'application/pdf' })
      }
    } catch { }
    out.push({ name, blob })
  }
  return out
}

export interface Dropped { files: File[]; folder?: string }
export async function droppedFiles(dt: DataTransfer | null): Promise<Dropped> {
  if (!dt) return { files: [] }
  const entries = [...dt.items].map((i) => (i.kind === 'file' ? i.webkitGetAsEntry?.() : null))
  const plain = [...dt.files]
  if (!entries.some((e) => e?.isDirectory)) return { files: plain }
  const out: File[] = []
  let folder: string | undefined
  const fileOfEntry = (e: FileSystemFileEntry) => new Promise<File | null>((res) => e.file(res, () => res(null)))
  const readAll = (d: FileSystemDirectoryEntry) => new Promise<FileSystemEntry[]>((res) => {
    const reader = d.createReader()
    const acc: FileSystemEntry[] = []
    const next = () => reader.readEntries((list) => { if (!list.length) return res(acc); acc.push(...list); next() }, () => res(acc))
    next()
  })
  const walk = async (e: FileSystemEntry, inDir: boolean): Promise<void> => {
    if (e.isDirectory) {
      folder ??= e.name
      for (const c of await readAll(e as FileSystemDirectoryEntry)) await walk(c, true)
    } else {
      const f = await fileOfEntry(e as FileSystemFileEntry)
      if (f && (!inDir || /\.(pdf|zip)$/i.test(f.name))) out.push(f)
    }
  }
  for (const e of entries) if (e) await walk(e, false)
  return { files: out, folder }
}

const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
const isZip = (f: File) => /\.zip$/i.test(f.name) || /zip/.test(f.type)
const pidOf = (name: string) => name.replace(/\.pdf$/i, '').trim()
let seq = 0
const newId = () => 'r' + Date.now().toString(36) + (seq++).toString(36)

async function collect(files: File[], taken: Set<string>, domain: Run['domain'] = 'solar') {
  const list: RunFile[] = []
  const skipped: string[] = []
  let folder: string | undefined
  let zipName: string | undefined
  const add = (name: string, blob: Blob | null, pdf: boolean) => {
    const id = pdf ? pidOf(name) : name
    if (!id) return
    if (taken.has(id)) { skipped.push(name); return }
    taken.add(id)
    if (pdf && blob) registerPdf(id, blob, domain)
    list.push(pdf
      ? { id, name, status: 'queued', progress: 0, hasData: hasDataIn(domain, id) }
      : { id, name, status: 'error', progress: 0, hasData: false, reason: 'не PDF' })
  }
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath ?? ''
    if (rel && !folder) folder = rel.split('/')[0]
    if (isZip(f)) {
      zipName ??= f.name.replace(/\.zip$/i, '')
      const inner = await readZip(f).catch(() => [] as Entry[])
      if (!inner.length) toast(`В «${f.name}» не нашлось PDF`)
      for (const e of inner) add(e.name, e.blob, true)
    } else if (isPdf(f)) add(f.name, f, true)
    else if (!rel) add(f.name, null, false)
  }
  if (skipped.length) toast(skipped.length === 1 ? `«${skipped[0]}» уже есть в разборе — пропущен` : `Повторы пропущены: ${skipped.length}`)
  const ok = list.some((f) => f.status === 'queued')
  if (!ok && list.length) toast('Нужны PDF или ZIP с PDF')
  return { list: ok ? list : [], folder, zipName }
}

const sent = new Map<string, Map<string, File>>()
export async function createRun(files: File[], domain: Run['domain'] = 'solar', opts: { title?: string } = {}): Promise<string | null> {
  if (isApi) {
    Object.assign(sending, { phase: 'send', pct: 0 })
    const id = await (await import('../api/runs')).createApiRun(files, { title: opts.title, domain, onProgress: (p) => { sending.pct = Math.min(100, Math.round(p * 100)) } })
    if (id) sent.set(id, new Map(files.filter(isPdf).map((f) => [pidOf(f.name.split('/').pop() ?? f.name), f])))
    return id
  }
  const { list, folder, zipName } = await collect(files, new Set(), domain)
  if (!list.length) return null
  const pdfs = list.filter((f) => f.status !== 'error')
  const title = opts.title || folder || zipName || (pdfs.length === 1 ? pdfs[0]!.id : `${pdfs[0]!.id} и ещё ${pdfs.length - 1}`)
  const at = Date.now()
  const run: RunEx = { id: newId(), title, domain, createdAt: at, files: list, messages: filesPair(at, list.map((f) => f.id)) }
  runs.push(run)
  pump()
  return run.id
}

export const sending = reactive({ phase: '' as '' | 'send', pct: 0 })
export function sendingText(): string {
  if (sending.phase === 'send') return sending.pct < 100 ? `Отправляем ${sending.pct} %` : 'Сервер принимает…'
  return 'Отправляем…'
}
export async function startRun(files: File[], domain: Run['domain'], opts: { title?: string } = {}): Promise<string | null> {
  try { return await createRun(files, domain, opts) } finally { Object.assign(sending, { phase: '', pct: 0 }) }
}
export async function rerunAs(runId: string, pids: string[], domain: Run['domain']): Promise<string | null> {
  const r = runOf(runId)
  if (!r || !pids.length) return null
  const title = `${r.title} · ${domain === 'rag' ? 'RAG' : 'солнечные'}`
  if (isApi) {
    const id = await (await import('../api/runs')).rerunAsApi(runId, pids, domain, title)
    if (id !== undefined) return id
  }
  const files: File[] = []
  for (const pid of pids) {
    let f = sent.get(runId)?.get(pid)
    if (!f) {
      try {
        const url = isApi ? `${(await import('../api/papers')).pdfApiUrl(pid, r.domain)}?run=${encodeURIComponent(runId)}` : pdfUrl(pid, r.domain)
        const headers = isApi ? await (await import('../api/client')).authHeaders() : {}
        const res = await fetch(url, { headers, credentials: 'include' })
        if (!res.ok) continue
        f = new File([await res.blob()], pid + '.pdf', { type: 'application/pdf' })
      } catch { continue }
    }
    files.push(f)
  }
  if (!files.length) { toast('Не удалось получить PDF этих статей — загрузите их заново'); return null }
  if (files.length < pids.length) toast(`PDF нашлись не у всех статей: разбираем ${files.length} из ${pids.length}`)
  return startRun(files, domain, { title })
}

export async function setRunDomain(id: string, domain: Run['domain']) {
  if (isApi) return
  const r = runOf(id)
  if (!r || r.domain === domain) return
  const old = r.domain
  for (const f of r.files) {
    const u = pdfUrl(f.id, old)
    if (!u.startsWith('blob:')) continue
    try { registerPdf(f.id, await (await fetch(u)).blob(), domain) } catch { }
  }
  r.domain = domain
  rerun(id)
  toast(`Область разбора: ${DOMAIN_RU[domain]}`)
}

export async function addToRun(id: string, files: File[]): Promise<number> {
  if (isApi) { toast('Догрузка файлов в разбор — в разработке'); return 0 }
  const r = runOf(id) as RunEx | undefined
  if (!r) return 0
  const { list } = await collect(files, new Set(r.files.map((f) => f.id)), r.domain)
  if (!list.length) return 0
  const msgs = messagesOf(id)
  const at = Date.now()
  r.files.push(...list)
  msgs.push(...filesPair(at, list.map((f) => f.id)))
  pump()
  return list.length
}

export function renameRun(id: string, title: string) {
  if (isApi) return
  const r = runOf(id)
  const t = title.trim()
  if (r && t) r.title = t
}
export function deleteRun(id: string) {
  if (isApi) return
  const i = runs.findIndex((r) => r.id === id)
  if (i < 0) return
  stopRun(id, true)
  const [r] = runs.splice(i, 1)
  if (reviewScope.value === id) setReviewScope(sortedRuns()[0]?.id ?? '')
  toast(`Разбор «${r!.title}» удалён`, { label: 'Вернуть', run: () => { if (!runOf(r!.id)) runs.splice(Math.min(i, runs.length), 0, r!) } })
}
export function rerun(id: string) {
  if (isApi) return
  const r = runOf(id)
  if (!r) return
  stopRun(id, true)
  for (const f of r.files) if (f.reason !== 'не PDF') { f.status = 'queued'; f.progress = 0; f.reason = undefined }
  pump()
}
export function stopRun(id: string, quiet = false) {
  if (isApi) return
  const r = runOf(id)
  if (!r) return
  for (const f of r.files) {
    const j = jobs.get(jkey(id, f.id))
    if (j) drop(j)
    if (!quiet && (f.status === 'queued' || f.status === 'running')) { f.status = 'error'; f.reason = 'остановлено' }
  }
  if (!quiet) pump()
}

const FINISHED: FileStatus[] = ['done', 'out']
export const runPapers = (id: string): string[] =>
  (runOf(id)?.files ?? []).filter((f) => f.hasData && FINISHED.includes(f.status)).map((f) => f.id)
export const runPapersInScope = (id: string): string[] => {
  const r = runOf(id)
  if (r?.remote) return r.files.filter((f) => (f.status === 'done' || f.status === 'ocr') && f.hasData).map((f) => f.id)
  return runPapers(id).filter((pid) => inScopeIn(r?.domain ?? 'solar', pid))
}

export interface RunSummary {
  files: number
  papers: number
  inScope: number
  out: number
  nodata: number
  errors: number
  values: number
  issues: number
  open: number
  accepted: number
  byCheck?: { check: string; total: number }[]
  coverage: { metric: string; share: number; n: number }[]
  domain: Run['domain']
  configurations: number
  datasets: number
  tasks: number
  experiments: number
}
export function runSummary(id: string): RunSummary {
  const r = runOf(id)
  const fs = r?.files ?? []
  const pids = runPapersInScope(id)
  if (r?.remote) return remoteSummary(id)
  if (r?.domain === 'rag') return ragRunSummary(id, pids)
  let values = 0
  let issues = 0
  let open = 0
  let accepted = 0
  const found = new Map<string, Set<string>>()
  for (const pid of pids) {
    const rs = resultsOf(pid)
    values += rs.length
    issues += issuesOf(pid).length
    open += issuesOf(pid).filter((i) => issueStateIn(id, pid, i.issue_id) === 'open').length
    for (const x of rs) {
      if (reviewIn(id, pid, x.result_id).status === 'accepted') accepted++
      if (x.extraction_status && x.extraction_status !== 'extracted') continue
      let s = found.get(x.metric_name)
      if (!s) found.set(x.metric_name, (s = new Set()))
      s.add(pid)
    }
  }
  return {
    files: fs.length,
    papers: fs.filter((f) => f.reason !== 'не PDF').length,
    inScope: fs.filter((f) => f.status === 'done').length,
    out: fs.filter((f) => f.status === 'out').length,
    nodata: fs.filter((f) => f.status === 'nodata').length,
    errors: fs.filter((f) => f.status === 'error').length,
    values,
    issues,
    open,
    accepted,
    coverage: METRICS.map((m) => ({ metric: m, n: found.get(m)?.size ?? 0, share: pids.length ? (found.get(m)?.size ?? 0) / pids.length : 0 })),
    domain: 'solar', configurations: 0, datasets: 0, tasks: 0, experiments: 0,
  }
}
function remoteSummary(id: string): RunSummary {
  const r = runOf(id)!
  const fs = r.files
  const s = summaryOf(id)
  const pids = runPapersInScope(id)
  const n = (st: FileStatus) => fs.filter((f) => f.status === st).length
  const inScope = s?.papers_in_scope ?? n('done') + n('ocr')
  const rag = r.domain === 'rag'
  return {
    files: s?.files ?? fs.length,
    papers: fs.length,
    inScope,
    out: s?.papers_out ?? n('out'),
    nodata: s?.files_without_results ?? n('nodata'),
    errors: s?.files_error ?? n('error'),
    values: s?.results ?? r.apiResults ?? 0,
    issues: s?.issues_total ?? r.apiIssues ?? 0,
    open: s?.issues_total ?? r.apiIssues ?? 0,
    accepted: 0,
    byCheck: s?.issues_by_check.map((c) => ({ check: c.check_name, total: c.total })),
    coverage: rag
      ? (s?.coverage ?? []).slice(0, 8).map((c) => ({ metric: c.metric, n: c.n, share: c.total ? c.n / c.total : 0 }))
      : METRICS.map((m) => {
        const c = s?.coverage.find((x) => x.metric === m)
        return { metric: m, n: c?.n ?? 0, share: c?.total ? c.n / c.total : pids.length ? (c?.n ?? 0) / pids.length : 0 }
      }),
    domain: rag ? 'rag' : 'solar', configurations: 0, datasets: 0, tasks: 0, experiments: 0,
  }
}
function ragRunSummary(id: string, pids: string[]): RunSummary {
  const fs = runOf(id)?.files ?? []
  const t = ragTotals(pids)
  let open = 0
  for (const pid of pids) {
    const list = ragIssuesOf(pid)
    open += list.length ? list.filter((i) => issueStateIn(id, pid, i.issue_id, 'rag') === 'open').length : ragSummaryOf(pid).issues
  }
  return {
    files: fs.length,
    papers: fs.filter((f) => f.reason !== 'не PDF').length,
    inScope: fs.filter((f) => f.status === 'done').length,
    out: fs.filter((f) => f.status === 'out').length,
    nodata: fs.filter((f) => f.status === 'nodata').length,
    errors: fs.filter((f) => f.status === 'error').length,
    values: t.results, issues: t.issues, open,
    accepted: reviewCountIn(id, pids.map((p) => paperKey(p, 'rag') + ':'), 'accepted'),
    coverage: ragTopMetrics(pids, 8).map((m) => ({ metric: m.metric, n: m.papers, share: pids.length ? m.papers / pids.length : 0 })),
    domain: 'rag', configurations: t.configurations, datasets: t.datasets, tasks: t.tasks, experiments: t.experiments,
  }
}

export const inbox = reactive({
  files: [] as File[],
  folder: '' as string,
  pick: 0,
  clear: 0,
})
export function sendToInbox(files: File[], folder = '') {
  inbox.files = [...inbox.files, ...files]
  if (folder) inbox.folder = folder
}
export function takeInbox(): { files: File[]; folder: string } {
  const out = { files: [...inbox.files], folder: inbox.folder }
  inbox.files = []
  inbox.folder = ''
  return out
}

export function togglePinRun(id: string) {
  if (isApi) return
  const r = runOf(id)
  if (!r) return
  r.pinned = !r.pinned
  toast(r.pinned ? `Разбор «${r.title}» закреплён` : `Разбор «${r.title}» откреплён`, { label: 'Отменить', run: () => { r.pinned = !r.pinned } })
}

type AskFn = (q: string, pids: string[], domain?: Run['domain']) => Promise<unknown>
const ASK = import.meta.glob<{ answer: AskFn }>('./ask.ts')
async function loadAsk(): Promise<AskFn | null> {
  const load = Object.values(ASK)[0]
  if (!load) return null
  try { return (await load()).answer } catch { return null }
}
async function respond(runId: string, msgId: string) {
  const m = messagesOf(runId).find((x) => x.id === msgId)
  if (!m || m.kind !== 'answer') return
  m.pending = true
  m.error = undefined
  const started = Date.now()
  try {
    const fn = await loadAsk()
    if (!fn) throw new Error('Ответы пока недоступны')
    const ans = await fn(m.q, runPapersInScope(runId), runOf(runId)?.domain ?? 'solar')
    const wait = 600 - (Date.now() - started)
    if (wait > 0) await new Promise((res) => setTimeout(res, wait))
    const cur = messagesOf(runId).find((x) => x.id === msgId)
    if (cur && cur.kind === 'answer') { cur.answer = ans; cur.pending = false }
  } catch (e) {
    const cur = messagesOf(runId).find((x) => x.id === msgId)
    if (cur && cur.kind === 'answer') { cur.pending = false; cur.error = e instanceof Error ? e.message : 'Не удалось ответить' }
  }
}
export function askRun(id: string, text: string) {
  if (isApi) return
  const q = text.trim()
  if (!q || !runOf(id)) return
  const msgs = messagesOf(id)
  const at = Date.now()
  const a: Msg = { id: mid(), role: 'system', kind: 'answer', at, q, pending: true }
  msgs.push({ id: mid(), role: 'user', kind: 'question', at, text: q }, a)
  void respond(id, a.id)
}
export const retryAnswer = (runId: string, msgId: string) => void respond(runId, msgId)
for (const r of runs) for (const m of (r as RunEx).messages ?? []) if (m.kind === 'answer' && m.pending) void respond(r.id, m.id)
