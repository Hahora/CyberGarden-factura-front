import {
  deviceName, fmtValue, metricLabel, num, placeOf, publication, resultLink, resultsOf, reviewInherited, reviewOf, unitRu, type ResultRow,
} from './case'

export type JKind = 'fixed' | 'rejected' | 'accepted'
export interface JEntry {
  key: string
  pid: string
  rid: string
  kind: JKind
  at: number
  row: ResultRow
  subject: string
  from?: string
  to?: string
}

export const J_VERB: Record<JKind, string> = { fixed: 'Исправлено значение', rejected: 'Отклонено значение', accepted: 'Принято значение' }
export const J_FILTER: { id: JKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'fixed', label: 'Исправлено' },
  { id: 'rejected', label: 'Отклонено' },
  { id: 'accepted', label: 'Принято' },
]

const original = (r: ResultRow) => (r.normalized_value ? `${num(r.normalized_value)}${r.normalized_unit ? ' ' + unitRu(r.normalized_unit) : ''}` : '—')

export function journal(pids: string[]): JEntry[] {
  const out: JEntry[] = []
  for (const pid of pids) {
    for (const r of resultsOf(pid)) {
      const rv = reviewOf(pid, r.result_id)
      if (rv.status === 'new' && rv.corrected == null) continue
      if (reviewInherited(pid, r.result_id)) continue
      const kind: JKind = rv.status === 'rejected' ? 'rejected' : rv.corrected != null ? 'fixed' : 'accepted'
      const dev = r.device_id ? deviceName(pid, r.device_id) : ''
      out.push({
        key: pid + ':' + r.result_id, pid, rid: r.result_id, kind, at: rv.at ?? 0, row: r,
        subject: metricLabel(r.metric_name) + (dev ? ' · ' + dev : ''),
        ...(kind === 'fixed' ? { from: original(r), to: fmtValue(r) } : {}),
      })
    }
  }
  return out.sort((a, b) => b.at - a.at)
}

export const jPlace = (e: JEntry) => [e.pid, placeOf(e.row)].filter(Boolean).join(' · ')
export const jPaper = (pid: string) => publication(pid)?.title ?? pid
export const jLink = (e: JEntry, run?: string) => {
  const l = resultLink(e.pid, e.rid)
  return run ? { ...l, query: { ...l.query, run } } : l
}
