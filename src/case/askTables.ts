import { PASSPORT, TYPE_LABEL, type PEntity, type PField } from '../passport'
import { NODATA_TEXT, labelOfField, ruValue } from './index'
import { buildRagSubmission, buildSubmission, type Row } from './export'
import { KEY_COL, TABS, TAB_RU } from './submissionFocus'
import type { CaseAnswer, CaseCard, CaseCite } from './ask'
import { fmtInt } from '../fmt'

type Domain = 'solar' | 'rag'
const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
const nRows = (n: number) => `${fmtInt(n)} ${plural(n, 'строка', 'строки', 'строк')}`
const word = (name: string) => new RegExp('(?<![a-z0-9_])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9_])', 'i')

const TABLE_STEMS: [string, RegExp][] = [
  ['publications', /публикац/], ['materials', /материал/], ['devices', /прибор/], ['layers', /слое|слои/], ['measurements', /измерени|услови/],
  ['results', /результат|значени/], ['issues', /замечани/], ['configurations', /конфигурац/], ['datasets', /датасет/], ['tasks', /задач/], ['experiments', /эксперимент/],
]
const INTENT = /что (такое|значит|означает|в|за|лежит)|поля|полей|поле\b|колонк|столбц|обязательн|таблиц|формат|схем|сколько (строк|записей|полей)|допустим|паспорт/

interface Hit { entity: PEntity; field?: PField }
function parse(q: string, domain: Domain): { table?: PEntity; field?: PField; wantCount: boolean; wantRequired: boolean; wantTables: boolean } | null {
  const ents = PASSPORT[domain].entities
  const text = low(q)
  const wantCount = /сколько (строк|записей|в таблиц)|размер таблиц/.test(text)
  const wantRequired = /обязательн/.test(text)
  const wantTables = /какие таблиц|сколько таблиц|из каких таблиц|что за таблиц|формат (набора|сдачи)|что сдава/.test(text)
  let table: PEntity | undefined = ents.find((e) => word(e.id).test(text))
  if (!table && /таблиц/.test(text)) {
    const stem = TABLE_STEMS.find(([id, rx]) => rx.test(text) && ents.some((e) => e.id === id))
    if (stem) table = ents.find((e) => e.id === stem[0])
  }
  let hit: Hit | undefined
  const fieldNames = new Map<string, Hit[]>()
  for (const e of ents) for (const f of e.fields) fieldNames.set(f.name, [...(fieldNames.get(f.name) ?? []), { entity: e, field: f }])
  for (const [name, list] of fieldNames) {
    if (name === 'publication_id' && !/publication_id/.test(text)) continue
    if (!word(name).test(text)) continue
    hit = (table && list.find((h) => h.entity.id === table!.id)) || list.find((h) => h.entity.id === 'results') || list[0]
    break
  }
  const named = !!table || !!hit
  if (!INTENT.test(text) && !wantTables) return null
  if (!named && !wantRequired && !wantTables) return null
  if (hit && !wantCount) return { table: hit.entity, field: hit.field, wantCount, wantRequired, wantTables }
  return { table, wantCount, wantRequired, wantTables }
}

function pickRows(rows: Row[], field?: string, n = 3): Row[] {
  const src = field ? rows.filter((r) => r[field]) : rows
  const out: Row[] = []
  const seenPid = new Set<string>(), seenVal = new Set<string>()
  for (const pass of [0, 1]) {
    for (const r of src) {
      if (out.length >= n) break
      if (out.includes(r)) continue
      if (pass === 0 && (seenPid.has(r.publication_id!) || (field && seenVal.has(r[field]!)))) continue
      if (pass === 1 && field && seenVal.has(r[field]!)) continue
      out.push(r); seenPid.add(r.publication_id!); if (field) seenVal.add(r[field]!)
    }
  }
  return out
}
const pickCols = (e: PEntity, rows: Row[], field?: string): string[] => {
  const key = KEY_COL[e.id]!
  const cols = e.id === 'publications' ? ['publication_id', 'year', 'in_scope'] : ['publication_id', key]
  if (field && !cols.includes(field)) cols.push(field)
  for (const f of e.fields) {
    if (cols.length >= 6) break
    if (!cols.includes(f.name) && rows.some((r) => r[f.name]) && !['source_fragment', 'authors', 'DOI', 'title'].includes(f.name)) cols.push(f.name)
  }
  return cols
}

export const isTableQuestion = (question: string, domain: Domain) => parse(question, domain) !== null

export function tableAnswer(question: string, pids: string[], domain: Domain): CaseAnswer | null {
  const p = parse(question, domain)
  if (!p) return null
  const tabs = TABS[domain]
  const tables = (domain === 'rag' ? buildRagSubmission(pids) : buildSubmission(pids)) as unknown as Record<string, Row[]>
  const total = tabs.reduce((a, t) => a + (tables[t]?.length ?? 0), 0)
  const empty = total === 0
  const cites: CaseCite[] = []
  const cards: CaseCard[] = []
  const citeRow = (tab: string, r: Row): string => {
    const id = r[KEY_COL[tab]!]!
    const i = cites.findIndex((c) => c.table === tab && c.row === id && c.pid === r.publication_id)
    if (i >= 0) return `[${i + 1}]`
    cites.push({ pid: r.publication_id!, rid: tab === 'results' ? id : undefined, iid: tab === 'issues' ? id : undefined, table: tab, row: id, page: r.source_page || undefined, domain: domain === 'rag' ? 'rag' : undefined,
      label: [tab, id, r.source_page && 'стр. ' + r.source_page].filter(Boolean).join(' · ') })
    return `[${cites.length}]`
  }
  const nPapers = (rows: Row[]) => new Set(rows.map((r) => r.publication_id)).size
  const emptyNote = empty ? ` В этом разборе строк пока нет: ${NODATA_TEXT.toLowerCase()}.` : ''
  const sug = (e?: PEntity): string[] => {
    const t = e?.id ?? (domain === 'rag' ? 'configurations' : 'devices')
    return [`Что в таблице ${t === 'results' ? (domain === 'rag' ? 'datasets' : 'devices') : t}`, 'Что значит extraction_status', 'Какие поля обязательны'].slice(0, 3)
  }
  const done = (text: string, s: string[]): CaseAnswer => ({ text, cards, cites, suggestions: s })

  if (p.field && p.table) {
    const e = p.table, f = p.field
    const rows = tables[e.id] ?? []
    const filled = rows.filter((r) => r[f.name])
    const parts: string[] = [`${f.name} («${labelOfField(f.name)}») — поле таблицы ${e.id}. ${f.desc.replace(/\.$/, '')}.`]
    parts.push(`Тип: ${TYPE_LABEL[f.type]}; ${f.required ? 'обязательное' : 'не обязательное: пусто — значит, в статье этого нет'}.`)
    if (f.ref) parts.push(`Ссылается на ${f.ref}.`)
    if (f.values?.length) parts.push(`Допустимые значения: ${f.values.map((v) => (ruValue(f.name, v) !== v ? `${v} (${ruValue(f.name, v)})` : v)).join(', ')}.`)
    if (!empty) {
      const cnt = new Map<string, number>()
      for (const r of filled) cnt.set(r[f.name]!, (cnt.get(r[f.name]!) ?? 0) + 1)
      const top = [...cnt].sort((a, b) => b[1] - a[1])
      if (f.values?.length || top.length <= 6) parts.push(`В этом разборе: ${top.slice(0, 5).map(([v, n]) => `${v} — ${fmtInt(n)}`).join(', ')}${rows.length - filled.length ? `, пусто — ${fmtInt(rows.length - filled.length)}` : ''}.`)
      else parts.push(`В этом разборе заполнено в ${fmtInt(filled.length)} из ${nRows(rows.length)}.`)
      const ex = pickRows(rows, f.name)
      if (ex.length) {
        const refs = ex.map((r) => `${r.publication_id}: ${e.id} · ${r[KEY_COL[e.id]!]} ${citeRow(e.id, r)}`).join('; ')
        parts.push(`Примеры: ${refs}.`)
        cards.push({ kind: 'tableRows', title: `Примеры из «${TAB_RU[e.id]}»`, table: e.id, cols: pickCols(e, ex, f.name), rows: ex.map((r) => ({ pid: r.publication_id!, id: r[KEY_COL[e.id]!]!, cells: pickCols(e, ex, f.name).map((c) => r[c] ?? '') })), domain })
      }
    } else parts.push(emptyNote.trim())
    return done(parts.join(' '), sug(e))
  }

  if (p.wantCount) {
    const e = p.table
    if (e) {
      const rows = tables[e.id] ?? []
      const ex = pickRows(rows)
      const refs = ex.map((r) => `${r.publication_id}: ${e.id} · ${r[KEY_COL[e.id]!]} ${citeRow(e.id, r)}`).join('; ')
      return done(`В таблице ${e.id} («${TAB_RU[e.id]}») ${nRows(rows.length)}${rows.length ? ` из ${nPapers(rows)} ${plural(nPapers(rows), 'статьи', 'статей', 'статей')}` : ''}. Одна строка — ${e.row}.${emptyNote}${ex.length ? ` Например: ${refs}.` : ''}`, sug(e))
    }
    return done(`Всего ${nRows(total)} в ${tabs.length} таблицах: ${tabs.map((t) => `${t} — ${fmtInt(tables[t]?.length ?? 0)}`).join(', ')}.${emptyNote}`, sug())
  }

  if (p.wantRequired) {
    const list = p.table ? [p.table] : PASSPORT[domain].entities
    const req = (e: PEntity) => e.fields.filter((f) => f.required)
    for (const e of list) cards.push({ kind: 'schema', title: `${TAB_RU[e.id]} (${e.id})`, table: e.id, fields: req(e).map((f) => ({ name: f.name, ru: labelOfField(f.name), required: true, desc: f.desc, ref: f.ref })) })
    const txt = p.table
      ? `В таблице ${p.table.id} обязательные поля: ${req(p.table).map((f) => f.name).join(', ')}. Остальные можно оставить пустыми: пустая ячейка значит, что в статье этого нет, значения по догадке не восстанавливаются.`
      : `Обязательные поля по таблицам: ${list.map((e) => `${e.id} — ${req(e).map((f) => f.name).join(', ')}`).join('; ')}. Остальные можно оставить пустыми: пустая ячейка значит, что в статье этого нет.`
    return done(txt + emptyNote, sug(p.table))
  }

  if (!p.table) {
    const ents = PASSPORT[domain].entities
    return done(`Набор для сдачи — ${ents.length} таблиц, каждая отдельный CSV: ${ents.map((e) => `${e.id} — ${fmtInt(tables[e.id]?.length ?? 0)}`).join(', ')}. Таблицы связаны через идентификаторы внутри статьи; вместе с ними в ZIP лежит паспорт.${emptyNote}`, sug())
  }

  const e = p.table
  const rows = tables[e.id] ?? []
  const req = e.fields.filter((f) => f.required).map((f) => f.name)
  const refs = e.fields.filter((f) => f.ref)
  const parts = [`Таблица ${e.id} («${TAB_RU[e.id]}»): одна строка — ${e.row}. Ключ: ${e.key}; полей ${e.fields.length}, обязательные: ${req.join(', ')}.`]
  if (refs.length) parts.push(`Ссылки: ${refs.map((f) => `${f.name} → ${f.ref}`).join(', ')}.`)
  cards.push({ kind: 'schema', title: `Поля таблицы ${e.id}`, table: e.id, fields: e.fields.map((f) => ({ name: f.name, ru: labelOfField(f.name), required: f.required, desc: f.desc, ref: f.ref })) })
  if (!empty) {
    const ex = pickRows(rows)
    parts.push(`В этом разборе ${nRows(rows.length)}${rows.length ? ` из ${nPapers(rows)} ${plural(nPapers(rows), 'статьи', 'статей', 'статей')}` : ''}.`)
    if (ex.length) {
      parts.push(`Примеры: ${ex.map((r) => `${r.publication_id}: ${e.id} · ${r[KEY_COL[e.id]!]} ${citeRow(e.id, r)}`).join('; ')}.`)
      const cols = pickCols(e, ex)
      cards.push({ kind: 'tableRows', title: `Примеры из «${TAB_RU[e.id]}»`, table: e.id, cols, rows: ex.map((r) => ({ pid: r.publication_id!, id: r[KEY_COL[e.id]!]!, cells: cols.map((c) => r[c] ?? '') })), domain })
    }
  } else parts.push(emptyNote.trim())
  return done(parts.join(' '), sug(e))
}

export const tableSuggestion = (domain: Domain) => (domain === 'rag' ? 'Что в таблице configurations' : 'Что в таблице devices')
