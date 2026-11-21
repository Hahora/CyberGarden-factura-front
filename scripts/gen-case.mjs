import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const TABLES = ['publications', 'materials', 'devices', 'layers', 'measurements', 'results', 'issues']
const dir = resolve('data/solar')

function parseCSV(text) {
  text = text.replace(/^﻿/, '')
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
  return { columns: head, rows: body.map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] ?? '']))) }
}

const out = {}
const columns = {}
for (const t of TABLES) {
  const { columns: cols, rows } = parseCSV(readFileSync(resolve(dir, t + '.csv'), 'utf8'))
  out[t] = rows
  columns[t] = cols
}

mkdirSync(resolve('src/case'), { recursive: true })
const ts = `import type { GoldTables } from './types'

export const GOLD_COLUMNS: Record<keyof GoldTables, string[]> = ${JSON.stringify(columns)}

const GOLD_TABLES: GoldTables = ${JSON.stringify(out)} as unknown as GoldTables
export default GOLD_TABLES
`
writeFileSync(resolve('src/case/goldTables.ts'), ts)
console.log(TABLES.map((t) => `${t}: ${out[t].length}`).join(', '))
