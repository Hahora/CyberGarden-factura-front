import { ApiError, request } from './client'

export type Dom = 'solar' | 'rag'
export interface ServerReview { status: 'new' | 'accepted' | 'rejected'; corrected_value?: string | number | null; at?: string; who?: string }
export interface ServerIssueState { state: 'open' | 'fixed' | 'ok'; auto?: boolean }

const enc = encodeURIComponent
const paperBase = (run: string, domain: Dom, pid: string) => `/runs/${enc(run)}/papers/${domain}/${enc(pid)}`

export function sendReview(run: string, domain: Dom, pid: string, rid: string, status: ServerReview['status'], corrected: number | null) {
  return request<{ review: ServerReview; applied_to: string | null }>(`${paperBase(run, domain, pid)}/results/${enc(rid)}/review`, {
    method: 'PATCH', body: { status, corrected_value: corrected }, silent: true,
  })
}

export function sendReviewBatch(run: string, items: { domain: Dom; pid: string; rid: string; status: ServerReview['status'] }[]) {
  return request<{ count: number }>(`/runs/${enc(run)}/reviews/batch`, { method: 'POST', body: { items }, silent: true })
}

export function sendIssueState(run: string, domain: Dom, pid: string, iid: string, state: ServerIssueState['state']) {
  return request<{ issue: { issue_id: string; state: string; auto: boolean } }>(`${paperBase(run, domain, pid)}/issues/${enc(iid)}`, {
    method: 'PATCH', body: { state }, silent: true,
  })
}

export function resetRunEdits(run: string) {
  return request<{ count: number }>(`/runs/${enc(run)}/reviews`, { method: 'DELETE', silent: true })
}

export const errText = (e: unknown, fallback: string) => (e instanceof ApiError && e.code !== 'network' ? e.message : fallback)
