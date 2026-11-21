import { download, toXlsx, zipStore, type ExportTable } from '../exporters'
import {
  RAG_COLUMNS, RAG_TABLE_NAMES, devicesOf, inScope, issuesOf, layersOf, materialsOf, measurementsOf, publication, ragConfigsOf, ragDatasetsOf,
  ragExperimentsOf, ragInScope, ragIssuesOf, ragLoadAll, ragPublication, ragResultsOf, ragTasksOf, resultsOf, reviewIn, reviewScope, type RagTableName,
} from './index'
import { passportJSON, passportMD } from '../passport'
import { runOf } from './runs'
import { GOLD_COLUMNS } from './goldTables'
import type { GoldTables } from './types'
import { fmtInt } from '../fmt'

export type TableName = keyof GoldTables
export const TABLE_NAMES = Object.keys(GOLD_COLUMNS) as TableName[]
export type Row = Record<string, string>
export type Tables = Record<TableName, Row[]>

export interface BuildOptions {
  only?: Set<string>
  skipRejected?: boolean
  scope?: string
}

const asRow = (r: object) => r as unknown as Row

export function buildSubmission(pids: string[], o: BuildOptions = {}): Tables {
  const out = Object.fromEntries(TABLE_NAMES.map((n) => [n, [] as Row[]])) as unknown as Tables
  const skipRejected = o.skipRejected !== false
  const scope = o.scope ?? reviewScope.value
  const reviewOf = (pid: string, rid: string) => reviewIn(scope, pid, rid)
  for (const pid of pids) {
    const pub = publication(pid)
    if (!pub) continue
    out.publications.push(asRow(pub))
    if (!inScope(pid)) continue

    const keep = new Set<string>()
    for (const r of resultsOf(pid)) {
      if (skipRejected && reviewOf(pid, r.result_id).status === 'rejected') continue
      if (o.only && !o.only.has(pid + ':' + r.result_id)) continue
      keep.add(r.result_id)
    }
    for (const m of materialsOf(pid)) out.materials.push(asRow(m))
    for (const d of devicesOf(pid)) out.devices.push(asRow(d))
    for (const l of layersOf(pid)) out.layers.push(asRow(l))
    for (const m of measurementsOf(pid)) out.measurements.push(asRow(m))
    for (const r of resultsOf(pid)) {
      if (!keep.has(r.result_id)) continue
      const row: Row = { ...asRow(r) }
      const rv = reviewOf(pid, r.result_id)
      if (rv.corrected != null) {
        const was = r.normalized_value
        const v = String(+rv.corrected.toFixed(6))
        row.normalized_value = v
        row.metric_value = v
        row.note = [r.note, `Исправлено вручную: было ${was}`].filter(Boolean).join('. ')
      }
      if (row.duplicate_of && !keep.has(row.duplicate_of)) row.duplicate_of = ''
      out.results.push(row)
    }
    for (const i of issuesOf(pid)) {
      const ids = i.record_ids.split(';').map((s) => s.trim()).filter(Boolean)
      out.issues.push({ ...asRow(i), record_ids: ids.filter((id) => keep.has(id)).join(';') })
    }
  }
  return out
}

const q = (s: string) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
export function tableCsv(name: TableName, rows: Row[], columns?: string[]): string {
  const cols = columns ?? GOLD_COLUMNS[name]
  return '﻿' + [cols, ...rows.map((r) => cols.map((c) => r[c] ?? ''))].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'
}
export const passportFiles = (id: 'solar' | 'rag') => [
  { name: 'PASSPORT.md', data: passportMD([id]) },
  { name: 'passport.json', data: JSON.stringify(passportJSON([id]), null, 2) },
]
export const submissionZip = (t: Tables): Uint8Array => zipStore([...TABLE_NAMES.map((n) => ({ name: n + '.csv', data: tableCsv(n, t[n]) })), ...passportFiles('solar')])
export const rowCount = (t: Tables) => TABLE_NAMES.reduce((a, n) => a + t[n].length, 0)

const NUMERIC = new Set(['year', 'layer_order', 'active_area', 'bandgap_value', 'metric_value', 'normalized_value', 'source_page', 'spread_value', 'n_devices'])
const BOOL = new Set(['in_scope', 'mask_used', 'certified'])
export function linkedJson(t: Tables) {
  const typed = (name: TableName) =>
    t[name].map((r) =>
      Object.fromEntries(
        GOLD_COLUMNS[name].map((c) => {
          const v = r[c] ?? ''
          if (v === '') return [c, null]
          if (NUMERIC.has(c) && Number.isFinite(Number(v))) return [c, Number(v)]
          if (BOOL.has(c)) return [c, v === 'true']
          if (c === 'record_ids' || (c === 'device_id' && name === 'measurements')) return [c, v.split(';').map((s) => s.trim())]
          return [c, v]
        }),
      ),
    )
  return {
    meta: { generated_by: 'Фактура AI', tables: Object.fromEntries(TABLE_NAMES.map((n) => [n, t[n].length])) },
    ...Object.fromEntries(TABLE_NAMES.map((n) => [n, typed(n)])),
  }
}

export const downloadZip = (t: Tables, name = 'submission.zip') => download(name, submissionZip(t), 'application/zip')
export const downloadJson = (t: Tables, name = 'submission.json') => download(name, JSON.stringify(linkedJson(t), null, 2), 'application/json')
export function downloadXlsx(t: Tables, name = 'results.xlsx') {
  const head = GOLD_COLUMNS.results
  const tbl: ExportTable = { head, rows: t.results.map((r) => head.map((c) => r[c] ?? '')), facts: t.results.length, papers: new Set(t.results.map((r) => r.publication_id)).size }
  download(name, toXlsx(tbl), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

export interface SubmissionSummary { tables: number; values: number; rows: number }
export function downloadSubmission(pids: string[], name = 'submission.zip', o: BuildOptions = {}): SubmissionSummary {
  const t = buildSubmission(pids, o)
  downloadZip(t, name)
  return summaryOf(t)
}
export type RagTables = Record<RagTableName, Row[]>
export function buildRagSubmission(pids: string[], o: BuildOptions = {}): RagTables {
  const out = Object.fromEntries(RAG_TABLE_NAMES.map((n) => [n, [] as Row[]])) as unknown as RagTables
  const skipRejected = o.skipRejected !== false
  const scope = o.scope ?? reviewScope.value
  for (const pid of pids) {
    const pub = ragPublication(pid)
    if (!pub) continue
    out.publications.push(asRow(pub))
    if (!ragInScope(pid)) continue
    const keep = new Set<string>()
    for (const r of ragResultsOf(pid)) {
      if (skipRejected && reviewIn(scope, pid, r.result_id, 'rag').status === 'rejected') continue
      if (o.only && !o.only.has(pid + ':' + r.result_id)) continue
      keep.add(r.result_id)
    }
    for (const r of ragConfigsOf(pid)) out.configurations.push(asRow(r))
    for (const r of ragDatasetsOf(pid)) out.datasets.push(asRow(r))
    for (const r of ragTasksOf(pid)) out.tasks.push(asRow(r))
    for (const r of ragExperimentsOf(pid)) out.experiments.push(asRow(r))
    for (const r of ragResultsOf(pid)) {
      if (!keep.has(r.result_id)) continue
      const row: Row = { ...asRow(r) }
      const rv = reviewIn(scope, pid, r.result_id, 'rag')
      if (rv.corrected != null) {
        const v = String(+rv.corrected.toFixed(6))
        row.note = [r.note, `Исправлено вручную: было ${r.normalized_value}`].filter(Boolean).join('. ')
        row.normalized_value = v
        row.metric_value = v
      }
      if (row.duplicate_of && !keep.has(row.duplicate_of)) row.duplicate_of = ''
      out.results.push(row)
    }
    for (const i of ragIssuesOf(pid)) {
      const ids = i.record_ids.split(';').map((s) => s.trim()).filter(Boolean)
      out.issues.push({ ...asRow(i), record_ids: ids.filter((id) => keep.has(id)).join(';') })
    }
  }
  return out
}
export async function ragSubmission(pids: string[], o: BuildOptions = {}): Promise<RagTables> {
  await ragLoadAll(pids)
  return buildRagSubmission(pids, o)
}
export const ragTableCsv = (name: RagTableName, rows: Row[]) => tableCsv(name as unknown as TableName, rows, RAG_COLUMNS[name])
export const ragSubmissionZip = (t: RagTables): Uint8Array => zipStore([...RAG_TABLE_NAMES.map((n) => ({ name: n + '.csv', data: ragTableCsv(n, t[n]) })), ...passportFiles('rag')])
export const ragSummaryOfTables = (t: RagTables): SubmissionSummary =>
  ({ tables: RAG_TABLE_NAMES.length, values: t.results.length, rows: RAG_TABLE_NAMES.reduce((a, n) => a + t[n].length, 0) })
export async function downloadRagSubmission(pids: string[], name = 'submission.zip', o: BuildOptions = {}): Promise<SubmissionSummary> {
  const t = await ragSubmission(pids, o)
  download(name, ragSubmissionZip(t), 'application/zip')
  return ragSummaryOfTables(t)
}
export async function downloadRunSubmission(runId: string, pids: string[], name = 'submission.zip'): Promise<SubmissionSummary> {
  if (runOf(runId)?.remote) {
    await (await import('../api/runs')).downloadServerSet(runId)
    return { tables: 0, values: 0, rows: 0 }
  }
  return runOf(runId)?.domain === 'rag' ? downloadRagSubmission(pids, name, { scope: runId }) : downloadSubmission(pids, name, { scope: runId })
}
export const summaryOf = (t: Tables): SubmissionSummary => ({ tables: TABLE_NAMES.length, values: t.results.length, rows: rowCount(t) })
const pl = (n: number, f: [string, string, string]) => (n % 10 === 1 && n % 100 !== 11 ? f[0] : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? f[1] : f[2])
export const submissionToast = (s: SubmissionSummary) =>
  `Скачано: ${s.tables} ${pl(s.tables, ['таблица', 'таблицы', 'таблиц'])}, ${fmtInt(s.values)} ${pl(s.values, ['значение', 'значения', 'значений'])}`
