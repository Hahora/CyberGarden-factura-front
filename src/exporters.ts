import { cellText, fmt, paramOf, rowLabel, unitText } from './data'
import { quoteOf } from './query'
import { plural } from './search'
import { buildTables, linkedJSON, tableCSV, type Table } from './submission'
import { factsOf, issuesFor, paperOf, state, toast, valueOf, type Paper } from './store'

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'copy' | 'submission' | 'linked'

export interface ExportOptions {
  paperIds: string[]
  rows?: Set<string>
  onlyAccepted: boolean
  normalized: boolean
  withSource: boolean
  withQuote: boolean
}

export interface ExportTable {
  head: string[]
  rows: string[][]
  facts: number
  papers: number
}

function inRows(o: ExportOptions, paperId: string, row: string) {
  if (!o.rows) return true
  if (row !== '*') return o.rows.has(`${paperId}:${row}`)
  for (const k of o.rows) if (k.startsWith(paperId + ':')) return true
  return false
}

function pickFacts(o: ExportOptions) {
  const out: { paper: Paper; fact: ReturnType<typeof factsOf>[number] }[] = []
  for (const id of o.paperIds) {
    const paper = paperOf(id)
    if (!paper || paper.processing < 100) continue
    for (const fact of factsOf(id)) {
      if (fact.status === 'rejected') continue
      if (!inRows(o, id, fact.row)) continue
      if (o.onlyAccepted && fact.status !== 'accepted') continue
      out.push({ paper, fact })
    }
  }
  return out
}

function valueUnit(paper: Paper, f: ReturnType<typeof factsOf>[number], normalized: boolean): [string, string] {
  const p = paramOf(paper.collection, f.param)
  if (p.text) return [f.raw, '']
  if (normalized) {
    const v = valueOf(f)
    return v == null ? [f.raw, ''] : [fmt(v, p, false), p.unit]
  }
  return [cellText(f.raw), unitText(f.raw)]
}

export function buildTable(o: ExportOptions): ExportTable {
  const list = pickFacts(o)
  const head = ['Статья', 'Год', 'Образец', 'Параметр', 'Значение', 'Единица', 'Статус']
  if (o.withSource) head.push('Страница', 'Источник')
  if (o.withQuote) head.push('Цитата')
  const rows = list.map(({ paper, fact: f }) => {
    const [val, unit] = valueUnit(paper, f, o.normalized)
    const row = [
      paper.title, String(paper.year), rowLabel(paper, f.row), paramOf(paper.collection, f.param).label, val, unit,
      f.status === 'accepted' ? 'принят' : 'на проверке',
    ]
    if (o.withSource) row.push(String(f.source.page), `${f.source.ref}, ${f.source.where}`)
    if (o.withQuote) row.push(f.quote ?? quoteOf(f, paper))
    return row
  })
  return { head, rows, facts: rows.length, papers: new Set(list.map((x) => x.paper.id)).size }
}

const cell = (s: string) => (/[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
export const toCSV = (t: ExportTable) => '\uFEFF' + [t.head, ...t.rows].map((r) => r.map(cell).join(';')).join('\r\n')
export const toTSV = (t: ExportTable) => [t.head, ...t.rows].map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n')
const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
export function zipStore(files: { name: string; data: string }[]): Uint8Array {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true)
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n, true)
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.data)
    const crc = crc32(data)
    const lh = new Uint8Array(30 + name.length)
    const lv = new DataView(lh.buffer)
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, 0); u16(lv, 12, 0x21)
    u32(lv, 14, crc); u32(lv, 18, data.length); u32(lv, 22, data.length); u16(lv, 26, name.length); u16(lv, 28, 0)
    lh.set(name, 30)
    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, 0); u16(cv, 14, 0x21)
    u32(cv, 16, crc); u32(cv, 20, data.length); u32(cv, 24, data.length); u16(cv, 28, name.length); u32(cv, 42, offset)
    ch.set(name, 46)
    parts.push(lh, data)
    central.push(ch)
    offset += lh.length + data.length
  }
  const size = central.reduce((a, c) => a + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  u32(ev, 0, 0x06054b50); u16(ev, 8, files.length); u16(ev, 10, files.length); u32(ev, 12, size); u32(ev, 16, offset)
  const all = [...parts, ...central, end]
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0))
  let p = 0
  for (const c of all) { out.set(c, p); p += c.length }
  return out
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
const colName = (i: number) => String.fromCharCode(65 + i)
export function toXlsx(t: ExportTable): Uint8Array {
  const rows = [t.head, ...t.rows]
  const sheet = rows
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          const ref = colName(ci) + (ri + 1)
          if (ri > 0 && /^-?\d+([.,]\d+)?$/.test(c)) return `<c r="${ref}"><v>${c.replace(',', '.')}</v></c>`
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(c)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zipStore([
    { name: '[Content_Types].xml', data: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Факты" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: X + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>` },
  ])
}

export function buildJSON(o: ExportOptions) {
  return o.paperIds
    .map((id) => paperOf(id))
    .filter((p): p is Paper => !!p && p.processing >= 100)
    .map((p) => ({
      paper: { id: p.id, title: p.title, authors: p.authors, year: p.year, journal: p.journal, collection: p.collection },
      facts: factsOf(p.id)
        .filter((f) => f.status !== 'rejected' && (!o.onlyAccepted || f.status === 'accepted') && inRows(o, p.id, f.row))
        .map((f) => {
          const param = paramOf(p.collection, f.param)
          const [val, unit] = valueUnit(p, f, o.normalized)
          return {
            sample: rowLabel(p, f.row),
            parameter: param.label,
            as_printed: f.raw,
            value: o.normalized ? valueOf(f) : val,
            unit: (o.normalized ? param.unit : unit) || null,
            status: f.status,
            edited: f.edited != null,
            confidence: Number(f.confidence.toFixed(2)),
            ...(o.withSource ? { source: { page: f.source.page, ref: f.source.ref, where: f.source.where } } : {}),
            ...(o.withQuote ? { quote: f.quote ?? quoteOf(f, p) } : {}),
          }
        }),
      issues: issuesFor(p).map((i) => ({ level: i.level, title: i.title, text: i.text })),
    }))
}

export function download(name: string, content: string | Uint8Array | Blob, mime: string) {
  const blob = content instanceof Blob ? content : typeof content === 'string' ? new Blob([content], { type: mime + ';charset=utf-8' }) : new Blob([content as BlobPart], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export const submissionTables = (o: ExportOptions): Table[] => buildTables(collectionId(o), { paperIds: o.paperIds, onlyAccepted: o.onlyAccepted })
const collectionId = (o: ExportOptions) => (o.paperIds.map((id) => paperOf(id)?.collection).find(Boolean) ?? state.collection) as 'solar' | 'rag'

export async function runExport(format: ExportFormat, o: ExportOptions, base = 'faktura-facts'): Promise<boolean> {
  if (format === 'submission' || format === 'linked') {
    const tables = submissionTables(o)
    const rows = tables.reduce((a, t) => a + t.rows.length, 0)
    if (!tables.some((t) => t.name !== 'publications' && t.rows.length)) {
      toast('Нечего экспортировать — выберите статьи или снимите «только принятые»')
      return false
    }
    if (format === 'submission') download('faktura-submission.zip', zipStore(tables.map((t) => ({ name: t.name + '.csv', data: tableCSV(t) }))), 'application/zip')
    else download('faktura-linked.json', JSON.stringify(linkedJSON(collectionId(o), tables), null, 2), 'application/json')
    toast(`Скачано: ${tables.length} ${plural(tables.length, ['таблица', 'таблицы', 'таблиц'])}, ${rows} ${plural(rows, ['строка', 'строки', 'строк'])}`)
    return true
  }
  const t = buildTable(o)
  if (!t.facts) {
    toast('Нечего экспортировать — выберите статьи или снимите «только принятые»')
    return false
  }
  if (format === 'csv') download(base + '.csv', toCSV(t), 'text/csv')
  else if (format === 'xlsx') download(base + '.xlsx', toXlsx(t), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  else if (format === 'json') download(base + '.json', JSON.stringify(buildJSON(o), null, 2), 'application/json')
  else {
    const ok = await copyText(toTSV(t))
    toast(ok ? `Скопировано: ${t.facts} строк — вставьте в Excel или Google Таблицы` : 'Не удалось скопировать')
    return ok
  }
  toast(`Скачано: ${t.facts} ${plural(t.facts, ['факт', 'факта', 'фактов'])} (${base}.${format})`)
  return true
}
