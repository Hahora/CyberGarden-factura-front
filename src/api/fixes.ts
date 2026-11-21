import { reactive } from 'vue'
import { get, request } from './client'

type Dom = 'solar' | 'rag'
const enc = encodeURIComponent
const base = (run: string, domain: Dom, pid: string) => `/runs/${enc(run)}/papers/${domain}/${enc(pid)}`

export interface FixItem {
  rid: string; metric?: string; current?: number | null; suggested?: number; action?: 'reject' | 'note'
  unit?: string | null; reason?: string; method?: string; confidence?: 'high' | 'medium' | 'low'
}
export interface FixAlt { title: string; confidence?: string; items: FixItem[] }
export interface FixInfo {
  issue_id: string; check_name: string; state: string
  suggestions: FixItem[]; alternatives: FixAlt[]
  resolution: { issue_state: 'ok'; reason: string } | null; note: string | null
}

const avail = reactive<Record<string, string[] | 'loading' | 'none'>>({})
const key = (run: string, domain: Dom, pid: string) => `${run}|${domain}|${pid}`

export function fixAvailable(run: string, domain: Dom, pid: string, iid: string): boolean {
  const k = key(run, domain, pid)
  const v = avail[k]
  if (v === undefined) {
    avail[k] = 'loading'
    get<{ issues?: { issue_id: string; fix_available?: boolean }[] }>(`${base(run, domain, pid)}/review`, undefined, { silent: true })
      .then((r) => { avail[k] = (r.issues ?? []).filter((x) => x.fix_available).map((x) => x.issue_id) })
      .catch(() => { avail[k] = 'none' })
    return false
  }
  return Array.isArray(v) && v.includes(iid)
}
export function dropFixes(run: string, pid?: string) {
  for (const k of Object.keys(avail)) if (k.startsWith(run + '|') && (!pid || k.endsWith('|' + pid))) delete avail[k]
}

export const loadFix = (run: string, domain: Dom, pid: string, iid: string) =>
  get<FixInfo>(`${base(run, domain, pid)}/issues/${enc(iid)}/fix`, undefined, { silent: true })

export function applyFix(run: string, domain: Dom, pid: string, iid: string, items: FixItem[], state: 'fixed' | 'ok') {
  const body = { items: items.map((x) => (x.action ? { rid: x.rid, action: x.action } : { rid: x.rid, suggested: x.suggested })), issue_state: state }
  return request<{ action_id?: string }>(`${base(run, domain, pid)}/issues/${enc(iid)}/fix/apply`, { method: 'POST', body, silent: true })
}
export const undoAction = (id: string) => request(`/actions/${enc(id)}/undo`, { method: 'POST', silent: true })
