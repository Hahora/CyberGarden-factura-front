import { reactive } from 'vue'
import { API_URL } from '../config'
import { toast } from '../store'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string | null, public details?: unknown) {
    super(message)
  }
}

const TK = 'gs:api:token'
let access = ''
let expiresAt = 0
try { access = sessionStorage.getItem(TK) ?? '' } catch { }
export const hasToken = () => !!access
export function setToken(t: string, expiresIn = 900) {
  access = t
  expiresAt = t ? Date.now() + expiresIn * 1000 : 0
  try { if (t) sessionStorage.setItem(TK, t); else sessionStorage.removeItem(TK) } catch { }
}

export const server = reactive({ state: 'unknown' as 'unknown' | 'up' | 'down' })
export async function checkHealth(): Promise<boolean> {
  const ctl = new AbortController()
  const t = window.setTimeout(() => ctl.abort(), 8000)
  try {
    const r = await fetch(API_URL + '/health', { signal: ctl.signal })
    server.state = r.ok ? 'up' : 'down'
  } catch { server.state = 'down' } finally { window.clearTimeout(t) }
  return server.state === 'up'
}

let onAuthLost: () => void = () => {}
export const setAuthLost = (fn: () => void) => { onAuthLost = fn }
function authLost() {
  setToken('')
  onAuthLost()
}

let refreshing: Promise<boolean> | null = null
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch(API_URL + '/auth/refresh', { method: 'POST', credentials: 'include' })
      if (!r.ok) return false
      const b = (await r.json()) as { access_token: string; expires_in?: number }
      setToken(b.access_token, b.expires_in)
      return true
    } catch { return false }
  })().finally(() => { refreshing = null })
  return refreshing
}
export async function authHeaders(): Promise<Record<string, string>> {
  if (access && expiresAt && expiresAt - Date.now() < 30_000) await refresh()
  return access ? { Authorization: 'Bearer ' + access } : {}
}

export interface Opts {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | (string | number)[]>
  silent?: boolean
  anon?: boolean
  raw?: boolean
}
const qs = (q: Opts['query']) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(q ?? {})) {
    if (v === undefined) continue
    for (const x of Array.isArray(v) ? v : [v]) p.append(k, String(x))
  }
  const s = p.toString()
  return s ? '?' + s : ''
}
let lastNet = 0
async function send(path: string, o: Opts): Promise<Response> {
  const headers: Record<string, string> = o.anon ? {} : await authHeaders()
  let body: BodyInit | undefined
  if (o.body instanceof FormData) body = o.body
  else if (o.body !== undefined) { body = JSON.stringify(o.body); headers['Content-Type'] = 'application/json' }
  try {
    return await fetch(API_URL + path + qs(o.query), { method: o.method ?? 'GET', headers, body, credentials: 'include' })
  } catch {
    server.state = 'down'
    if (!o.silent && Date.now() - lastNet > 5000) { lastNet = Date.now(); toast('Сервер недоступен') }
    throw new ApiError(0, 'network', 'Сервер недоступен')
  }
}
export async function request<T = unknown>(path: string, o: Opts = {}): Promise<T> {
  let r = await send(path, o)
  if (r.status === 401 && !o.anon) {
    if (await refresh()) r = await send(path, o)
    if (r.status === 401) { authLost(); throw new ApiError(401, 'unauthorized', 'Нужно войти') }
  }
  if (server.state === 'down') server.state = 'up'
  if (!r.ok) {
    let e: { code?: string; message?: string; field?: string; details?: unknown } = {}
    try { e = ((await r.json()) as { error?: typeof e }).error ?? {} } catch { }
    const err = new ApiError(r.status, e.code ?? 'error', e.message ?? `Ошибка ${r.status}`, e.field, e.details)
    if (!o.silent) toast(err.message)
    throw err
  }
  if (o.raw) return r as unknown as T
  if (r.status === 204) return undefined as T
  return (await r.json()) as T
}
export const get = <T>(path: string, query?: Opts['query'], o: Opts = {}) => request<T>(path, { ...o, query })
export const post = <T>(path: string, body?: unknown, o: Opts = {}) => request<T>(path, { ...o, method: 'POST', body })

export async function upload<T>(path: string, body: FormData, onProgress?: (p: number) => void): Promise<T> {
  const once = async () => {
    const headers = await authHeaders()
    return new Promise<{ status: number; text: string }>((res, rej) => {
      const x = new XMLHttpRequest()
      x.open('POST', API_URL + path)
      x.withCredentials = true
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
      x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total) }
      x.onload = () => res({ status: x.status, text: x.responseText })
      x.onerror = x.onabort = () => rej(new Error('network'))
      x.send(body)
    })
  }
  let r: { status: number; text: string }
  try {
    r = await once()
    if (r.status === 401) {
      if (await refresh()) { onProgress?.(0); r = await once() }
      if (r.status === 401) { authLost(); throw new ApiError(401, 'unauthorized', 'Нужно войти') }
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    server.state = 'down'
    toast('Сервер недоступен')
    throw new ApiError(0, 'network', 'Сервер недоступен')
  }
  if (server.state === 'down') server.state = 'up'
  let b: unknown
  try { b = r.text ? JSON.parse(r.text) : undefined } catch { }
  if (r.status < 200 || r.status >= 300) {
    const e = (b as { error?: { code?: string; message?: string; field?: string; details?: unknown } } | undefined)?.error ?? {}
    const err = new ApiError(r.status, e.code ?? 'error', e.message ?? `Ошибка ${r.status}`, e.field, e.details)
    toast(err.message)
    throw err
  }
  return b as T
}

export async function getAll<T>(path: string, query: Opts['query'] = {}, o: Opts = {}): Promise<T[]> {
  const out: T[] = []
  let cursor: string | undefined
  for (let i = 0; i < 200; i++) {
    const p = await request<{ data: T[]; next_cursor: string | null }>(path, { ...o, query: { ...query, cursor } })
    out.push(...p.data)
    if (!p.next_cursor) break
    cursor = p.next_cursor
  }
  return out
}
