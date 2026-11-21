import { reactive } from 'vue'
import { API_URL } from '../config'
import { ApiError, authHeaders, get, request } from './client'

const enc = encodeURIComponent
const runPath = (id: string) => `/runs/${enc(id)}`

export interface Thread {
  id: string; title: string; created_at: string; updated_at: string; questions: number
  last_message?: { role: string; text: string; at: string } | null
  running_message_id?: string | null
}
export interface ServerMsg {
  id: string; role: 'user' | 'assistant' | 'system'; kind: 'files' | 'run' | 'text' | 'answer'
  text?: string; files?: string[]; at: string
  status?: 'running' | 'done' | 'stopped' | 'error'
  answer?: RawAnswer; clarify?: boolean; rating?: 'up' | 'down' | null; thread_id?: string; source?: 'ask' | 'messages'
}
export interface RawCite {
  n?: number; domain?: 'solar' | 'rag'; pid?: string | null; result_id?: string | null; issue_id?: string | null
  chunk_id?: string; agg_id?: string; calc_id?: string; table?: string; row_id?: string; row?: string; rid?: string; iid?: string
  page?: number | string | null; fragment?: string; text?: string; label?: string; src_id?: string; openalex_id?: string; url?: string
}
export interface Source {
  id?: string; openalex_id: string; title: string; authors?: string[]; year?: number | null; venue?: string | null; doi?: string | null
  url?: string | null; oa_url?: string | null; cited_by_count?: number | null; relation?: 'this' | 'related' | 'cites' | 'search'; abstract?: string | null
  cited_in?: { message_id: string; question: string }[]
}
export interface RawAnswer { text: string; cards?: unknown[]; cites?: RawCite[]; suggestions?: string[]; sources?: Source[]; clarify?: boolean; fallback?: unknown; partial?: unknown }

export const threads = reactive<Record<string, Thread[]>>({})
export const currentThread = reactive<Record<string, string>>({})

export async function loadThreads(run: string): Promise<Thread[]> {
  const r = await get<{ data: Thread[] }>(`${runPath(run)}/threads`, undefined, { silent: true })
  threads[run] = r.data ?? []
  return threads[run]!
}
export async function openThread(run: string, tid: string) {
  const t = await get<Thread & { messages: ServerMsg[]; stream_url?: string | null }>(`${runPath(run)}/threads/${enc(tid)}`, undefined, { silent: true })
  currentThread[run] = t.id
  return t
}
export async function createThread(run: string, title?: string): Promise<Thread> {
  const t = await request<Thread>(`${runPath(run)}/threads`, { method: 'POST', body: title ? { title } : {}, silent: true })
  threads[run] = [t, ...(threads[run] ?? [])]
  currentThread[run] = t.id
  return t
}
export async function renameThread(run: string, tid: string, title: string) {
  const t = await request<Thread>(`${runPath(run)}/threads/${enc(tid)}`, { method: 'PATCH', body: { title }, silent: true })
  const l = threads[run] ?? []
  const i = l.findIndex((x) => x.id === tid)
  if (i >= 0) l[i] = t
  return t
}
export async function deleteThread(run: string, tid: string) {
  await request(`${runPath(run)}/threads/${enc(tid)}`, { method: 'DELETE', silent: true })
  threads[run] = (threads[run] ?? []).filter((x) => x.id !== tid)
  if (currentThread[run] === tid) delete currentThread[run]
}

export async function postQuestion(run: string, text: string, opts: { thread?: string; pid?: string } = {}) {
  const body: Record<string, string> = { text }
  if (opts.thread) body.thread_id = opts.thread
  if (opts.pid) body.pid = opts.pid
  return request<{ message_id: string; question_id: string; stream_url: string; thread_id?: string }>(`${runPath(run)}/messages`, { method: 'POST', body, silent: true })
}
export const stopMessage = (run: string, mid: string) => request(`${runPath(run)}/messages/${enc(mid)}/stop`, { method: 'POST', silent: true })
export const rateMessage = (run: string, mid: string, rating: 'up' | 'down' | null, reason?: string) =>
  request(`${runPath(run)}/messages/${enc(mid)}/rating`, { method: 'PUT', body: rating === 'down' && reason ? { rating, reason } : { rating }, silent: true })
export const messageSources = (run: string, mid: string) =>
  get<{ message_id: string; question: string; sources: Source[]; generated_at?: string }>(`${runPath(run)}/messages/${enc(mid)}/sources`, undefined, { silent: true })
export const chatSources = (run: string, thread?: string) =>
  get<{ thread_id: string | null; sources: Source[]; generated_at?: string }>(`${runPath(run)}/sources`, thread ? { thread } : undefined, { silent: true })
export const chatSuggestions = (run: string, thread?: string) =>
  get<{ data: string[] }>(`${runPath(run)}/suggestions`, thread ? { thread } : undefined, { silent: true }).then((r) => r.data ?? [])

export type StreamEvent =
  | { event: 'step'; data: { text: string } }
  | { event: 'text'; data: { text: string } }
  | { event: 'card'; data: { card: unknown } }
  | { event: 'cite'; data: { cite: RawCite } }
  | { event: 'suggestions'; data: { suggestions: string[] } }
  | { event: 'done'; data: { message_id: string; status: string; answer?: RawAnswer; clarify?: boolean } }
  | { event: 'error'; data: { code: string; message: string; retryable?: boolean } }

export async function readStream(url: string, on: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const full = url.startsWith('http') ? url : url.startsWith(API_URL) ? url : url.startsWith('/api/') ? url.replace(/^\/api\/v1/, API_URL) : API_URL + url
  const res = await fetch(full, { headers: { ...(await authHeaders()), Accept: 'text/event-stream' }, credentials: 'include', signal })
  if (!res.ok || !res.body) {
    let msg = 'Не удалось получить ответ'
    try { msg = ((await res.json()) as { error?: { message?: string } }).error?.message ?? msg } catch { }
    throw new ApiError(res.status, 'stream_failed', msg)
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value.replace(/\r\n/g, '\n')
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i)
      buf = buf.slice(i + 2)
      let ev = 'message'
      const data: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (!data.length) continue
      try { on({ event: ev, data: JSON.parse(data.join('\n')) } as StreamEvent) } catch { }
      if (ev === 'done' || ev === 'error') { void reader.cancel().catch(() => {}); return }
    }
  }
}

export function citeLabel(c: RawCite): string {
  if (c.label) return c.label
  if (c.text) return c.text
  const page = c.page != null && c.page !== '' ? `стр. ${c.page}` : ''
  const frag = c.fragment ? `«${c.fragment.length > 140 ? c.fragment.slice(0, 140) + '…' : c.fragment}»` : ''
  const id = c.result_id ?? c.issue_id ?? (c.table && c.row_id ? `${c.table} · ${c.row_id}` : '')
  return [c.pid, id, page, frag].filter(Boolean).join(' · ')
}
export function normalizeAnswer(a: RawAnswer | undefined) {
  if (!a) return undefined
  const cites = (a.cites ?? []).map((c) => ({
    pid: c.pid ?? '',
    ...(c.rid || c.result_id ? { rid: (c.rid ?? c.result_id)! } : {}),
    ...(c.iid || c.issue_id ? { iid: (c.iid ?? c.issue_id)! } : {}),
    ...(c.table && (c.row || c.row_id) ? { table: c.table, row: (c.row ?? c.row_id)! } : {}),
    ...(c.page != null && c.page !== '' ? { page: String(c.page) } : {}),
    ...(c.domain === 'rag' ? { domain: 'rag' as const } : {}),
    ...(c.url ? { url: c.url } : {}),
    label: citeLabel(c),
  }))
  return { text: a.text ?? '', cards: (a.cards ?? []) as never[], cites, suggestions: a.suggestions ?? [], sources: a.sources ?? [], ...(a.clarify ? { clarify: true } : {}) }
}
