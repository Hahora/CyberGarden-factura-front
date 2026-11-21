import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const TABLES = ['publications', 'configurations', 'datasets', 'tasks', 'experiments', 'results', 'issues']
const dir = resolve('data/rag')
const SCANS = ['D002', 'D013', 'D021']

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '')
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows
  return { columns: head, rows: body }
}

const cols = {}
const rowsOf = {}
for (const t of TABLES) {
  const p = parseCSV(readFileSync(resolve(dir, t + '.csv'), 'utf8'))
  cols[t] = p.columns
  rowsOf[t] = p.rows
}

const pubs = rowsOf.publications.map((r) => Object.fromEntries(cols.publications.map((c, i) => [c, r[i] ?? ''])))
mkdirSync(resolve('public/case/rag'), { recursive: true })
const summary = {}
for (const p of pubs) {
  const pid = p.publication_id
  const per = {}
  const counts = {}
  for (const t of TABLES.slice(1)) {
    per[t] = rowsOf[t].filter((r) => r[0] === pid)
    counts[t] = per[t].length
  }
  const mi = cols.results.indexOf('metric_name')
  const metrics = {}
  for (const r of per.results) metrics[r[mi]] = (metrics[r[mi]] ?? 0) + 1
  const sorted = Object.entries(metrics).sort((a, b) => b[1] - a[1])
  writeFileSync(resolve('public/case/rag', pid + '.json'), JSON.stringify({ columns: Object.fromEntries(TABLES.slice(1).map((t) => [t, cols[t]])), rows: per }))
  summary[pid] = { results: counts.results, configurations: counts.configurations, datasets: counts.datasets, tasks: counts.tasks, experiments: counts.experiments, issues: counts.issues, metrics: sorted, scan: SCANS.includes(pid) }
}

const ts = `import type { RagPaperSummary, PublicationRow } from './types'

export const RAG_COLUMNS: Record<string, string[]> = ${JSON.stringify(cols)}

export const RAG_PUBLICATIONS: PublicationRow[] = ${JSON.stringify(pubs)}

export const RAG_SUMMARY: Record<string, RagPaperSummary> = ${JSON.stringify(summary)}
`
writeFileSync(resolve('src/case/ragSummary.ts'), ts)
const tot = (k) => Object.values(summary).reduce((a, s) => a + s[k], 0)
console.log(`статей: ${pubs.length}, результатов: ${tot('results')}, конфигураций: ${tot('configurations')}, датасетов: ${tot('datasets')}, задач: ${tot('tasks')}, экспериментов: ${tot('experiments')}, замечаний: ${tot('issues')}`)
