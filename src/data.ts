export type CollectionId = 'solar' | 'rag'

export type MaterialClass = 'perovskite' | 'CIGS' | 'CdTe' | 'kesterite' | 'Sb2Se3' | 'thin-film Si' | 'other'
export type DeviceRole = 'control' | 'target' | 'record'
export type DeviceType = 'cell' | 'minimodule' | 'module'
export type Architecture = 'n-i-p' | 'p-i-n' | 'substrate' | 'superstrate'
export type Aggregation = 'champion' | 'mean' | 'median'
export type ScanDirection = 'reverse' | 'forward' | 'average'
export type ExtractionStatus = 'extracted' | 'present_not_extractable' | 'absent'
export type ResultOrigin = 'primary' | 'cited'

export const MATERIAL_CLASSES: MaterialClass[] = ['perovskite', 'CIGS', 'CdTe', 'kesterite', 'Sb2Se3', 'thin-film Si', 'other']

export const CLASS_RU: Record<MaterialClass, string> = { perovskite: 'перовскит', CIGS: 'CIGS', CdTe: 'CdTe', kesterite: 'кестерит', Sb2Se3: 'Sb₂Se₃', 'thin-film Si': 'тонкоплёночный кремний', other: 'другой' }
export const ROLE_RU: Record<DeviceRole, string> = { control: 'контрольный', target: 'целевой', record: 'рекордный' }
export const TYPE_RU: Record<DeviceType, string> = { cell: 'элемент', minimodule: 'мини-модуль', module: 'модуль' }
export const AGG_RU: Record<Aggregation, string> = { champion: 'лучший прибор', mean: 'среднее', median: 'медиана' }
export const SCAN_RU: Record<ScanDirection, string> = { reverse: 'обратная', forward: 'прямая', average: 'усреднённая' }
export const STATUS_RU: Record<ExtractionStatus, string> = { extracted: 'извлечено', present_not_extractable: 'есть, но не извлекается', absent: 'нет в статье' }
export const ORIGIN_RU: Record<ResultOrigin, string> = { primary: 'своё', cited: 'цитата' }

export interface Param {
  key: string
  label: string
  unit: string
  units: Record<string, number>
  digits: number
  text?: boolean
  metric_name?: string
  metric_direction?: 'higher' | 'lower'
  metric_k?: number
  metric_family?: 'recall'
  optional?: boolean
}

export interface Collection {
  id: CollectionId
  name: string
  hint: string
  icon: string
  params: Param[]
  table: string[]
  best: string
  plot: { x: string; y: string }
  topics: [RegExp, string][]
  aliases: Record<string, RegExp>
}

const RU_OHM = { 'Ом·см²': 1, 'Ом·см2': 1, 'Ом см²': 1, 'Ом*см²': 1, 'Ohm·cm²': 1 }

export const COLLECTIONS: Record<CollectionId, Collection> = {
  solar: {
    id: 'solar',
    name: 'Солнечные элементы',
    hint: 'Тонкоплёночные однопереходные приборы: слои, КПД, условия измерения',
    icon: 'sun',
    params: [
      { key: 'pce', label: 'КПД', unit: '%', units: { '%': 1 }, digits: 1, metric_name: 'PCE', metric_direction: 'higher' },
      { key: 'voc', label: 'Voc', unit: 'В', units: { 'В': 1, 'мВ': 0.001 }, digits: 2, metric_name: 'Voc', metric_direction: 'higher' },
      { key: 'jsc', label: 'Jsc', unit: 'мА/см²', units: { 'мА/см²': 1, 'А/м²': 0.1 }, digits: 1, metric_name: 'Jsc', metric_direction: 'higher' },
      { key: 'ff', label: 'FF', unit: '%', units: { '%': 1, '': 100 }, digits: 1, metric_name: 'FF', metric_direction: 'higher' },
      { key: 'bandgap', label: 'Ширина зоны', unit: 'эВ', units: { 'эВ': 1 }, digits: 2 },
      { key: 'thickness', label: 'Толщина поглотителя', unit: 'нм', units: { 'нм': 1, 'мкм': 1000 }, digits: 0 },
      { key: 'conditions', label: 'Условия измерения', unit: '', units: {}, digits: 0, text: true },
      { key: 'rs', label: 'Rs', unit: 'Ом·см²', units: RU_OHM, digits: 1, metric_name: 'Rs', metric_direction: 'lower', optional: true },
      { key: 'rsh', label: 'Rsh', unit: 'Ом·см²', units: RU_OHM, digits: 0, metric_name: 'Rsh', metric_direction: 'higher', optional: true },
      { key: 'hi', label: 'Индекс гистерезиса', unit: '%', units: { '%': 1, '': 100 }, digits: 1, metric_name: 'HI', metric_direction: 'lower', optional: true },
      { key: 'jsc_eqe', label: 'Jsc по EQE', unit: 'мА/см²', units: { 'мА/см²': 1, 'А/м²': 0.1 }, digits: 1, metric_name: 'Jsc_EQE', metric_direction: 'higher', optional: true },
      { key: 't80', label: 'T80', unit: 'ч', units: { 'ч': 1, h: 1, 'сут': 24, 'мин': 1 / 60 }, digits: 0, metric_name: 'T80', metric_direction: 'higher', optional: true },
      { key: 'retained_pce', label: 'Сохранение КПД', unit: '%', units: { '%': 1, '': 100 }, digits: 0, metric_name: 'retained_PCE', metric_direction: 'higher', optional: true },
    ],
    table: ['voc', 'jsc', 'ff', 'pce'],
    best: 'pce',
    plot: { x: 'voc', y: 'pce' },
    topics: [
      [/перовск|mapbi/i, 'перовскит'],
      [/cigs/i, 'CIGS'],
      [/cdte/i, 'CdTe'],
      [/кестерит|czts|cu2znsn/i, 'кестерит'],
      [/sb2se3|sb₂se₃|сурьм/i, 'Sb₂Se₃'],
      [/олов|бессвинц|sn/i, 'бессвинцовые'],
    ],
    aliases: {
      pce: /кпд|pce|эффективн/i,
      voc: /voc|напряжени/i,
      jsc_eqe: /jsc[\s_-]*eqe|по eqe|eqe/i,
      jsc: /jsc(?![\s_-]*eqe)|плотност[ьи] тока/i,
      ff: /\bff\b|фактор заполн/i,
      bandgap: /ширин[аы] зоны|bandgap|запрещ/i,
      rs: /\brs\b|последовательн\S* сопротивлен/i,
      rsh: /\brsh\b|шунт\S* сопротивлен/i,
      hi: /\bhi\b|гистерезис/i,
      t80: /\bt80\b|t₈₀/i,
      retained_pce: /сохранени\S* кпд|retained/i,
    },
  },
  rag: {
    id: 'rag',
    name: 'RAG и поиск',
    hint: 'Системы поиска по документам: ретриверы, чанки, метрики',
    icon: 'graph',
    params: [
      { key: 'r5', label: 'Recall@5', unit: '', units: { '': 1, '%': 0.01 }, digits: 2, metric_direction: 'higher', metric_k: 5, metric_family: 'recall' },
      { key: 'r10', label: 'Recall@10', unit: '', units: { '': 1, '%': 0.01 }, digits: 2, metric_direction: 'higher', metric_k: 10, metric_family: 'recall' },
      { key: 'mrr', label: 'MRR', unit: '', units: { '': 1, '%': 0.01 }, digits: 2, metric_direction: 'higher' },
      { key: 'chunk', label: 'Размер чанка', unit: 'ток.', units: { 'ток.': 1, 'токенов': 1 }, digits: 0 },
      { key: 'retriever', label: 'Ретривер', unit: '', units: {}, digits: 0, text: true },
      { key: 'r20', label: 'Recall@20', unit: '', units: { '': 1, '%': 0.01 }, digits: 2, metric_direction: 'higher', metric_k: 20, metric_family: 'recall', optional: true },
      { key: 'ndcg10', label: 'nDCG@10', unit: '', units: { '': 1, '%': 0.01 }, digits: 2, metric_direction: 'higher', metric_k: 10, optional: true },
      { key: 'latency_ms', label: 'Задержка', unit: 'мс', units: { 'мс': 1, 'с': 1000 }, digits: 0, metric_direction: 'lower', optional: true },
    ],
    table: ['chunk', 'r5', 'r10', 'mrr'],
    best: 'r5',
    plot: { x: 'chunk', y: 'r5' },
    topics: [
      [/гибрид|hybrid/i, 'гибридный поиск'],
      [/bm25/i, 'BM25'],
      [/rerank|переранж|кросс/i, 'переранжирование'],
      [/чанк|chunk/i, 'размер чанка'],
    ],
    aliases: {
      r5: /recall@?5\b|полнот/i,
      r10: /recall@?10/i,
      r20: /recall@?20/i,
      ndcg10: /ndcg/i,
      mrr: /mrr/i,
      chunk: /чанк|chunk/i,
      latency_ms: /задержк|latency/i,
    },
  },
}

export const paramOf = (c: CollectionId, key: string): Param =>
  COLLECTIONS[c].params.find((p) => p.key === key) ?? { key, label: key, unit: '', units: {}, digits: 2, text: true }

export interface Claim {
  id: string
  row: string
  param: string
  kind: 'best' | 'equals'
  value?: number
}

export interface Row {
  id: string
  label: string
  values: Record<string, string>
  device_role?: DeviceRole
  device_type?: DeviceType
  architecture?: Architecture
  active_area?: number
  aggregation?: Aggregation
  n_devices?: number
  spread_value?: number
  scan_direction?: ScanDirection
  certified?: boolean
  batch?: string
  light_intensity?: number
  spectrum?: string
  baseline?: boolean
  top_k?: number
  embedding_model?: string
  reranker_model?: string
  generator_model?: string
  metric_variant?: string
  sample_size?: number
}

export interface PaperSeed {
  id: string
  collection: CollectionId
  title: string
  authors: string
  year: number
  journal: string
  doi?: string
  in_scope?: boolean
  exclusion_reason?: string
  material_class?: MaterialClass
  task?: string
  dataset?: string
  eval_protocol?: string
  cited?: Record<string, string>
  pages: number
  page: number
  tags: string
  tableNo: number
  caption: string
  section: string
  rows: Row[]
  paragraphs: string[]
  claims: Claim[]
  figure: string
  addedDays: number
}

export interface Source {
  page: number
  kind: 'table' | 'text' | 'figure' | 'manual'
  ref: string
  where: string
  anchor: string
}

export interface Fact {
  id: string
  paperId: string
  row: string
  param: string
  raw: string
  base: number | null
  edited: number | null
  status: 'new' | 'accepted' | 'rejected'
  confidence: number
  source: Source
  quote?: string
  by?: 'auto' | 'manual'
  raw_value: string
  raw_unit: string
  normalized_value: number | null
  normalized_unit: string
  extraction_status: ExtractionStatus
  result_origin: ResultOrigin
  cited_publication_id?: string
  duplicate_of?: string
}

const UNIT_ASCII: Record<string, string> = {
  '%': '%', 'В': 'V', 'мВ': 'mV', 'мА/см²': 'mA/cm2', 'А/м²': 'A/m2', 'эВ': 'eV', 'нм': 'nm', 'мкм': 'um',
  'Ом·см²': 'Ohm*cm2', 'Ом·см2': 'Ohm*cm2', 'Ом см²': 'Ohm*cm2', 'Ом*см²': 'Ohm*cm2', 'Ohm·cm²': 'Ohm*cm2',
  'ч': 'h', h: 'h', 'сут': 'd', 'мин': 'min', 'мВт/см²': 'mW/cm2', 'Вт/м²': 'W/m2', 'мс': 'ms', 'с': 's', 'ток.': 'tokens', 'токенов': 'tokens',
}
const UNIT_RU: Record<string, string> = {
  V: 'В', mV: 'мВ', 'mA/cm2': 'мА/см²', 'A/m2': 'А/м²', eV: 'эВ', nm: 'нм', um: 'мкм', 'Ohm*cm2': 'Ом·см²', h: 'ч', d: 'сут',
  min: 'мин', 'mW/cm2': 'мВт/см²', 'W/m2': 'Вт/м²', ms: 'мс', s: 'с', tokens: 'ток.', '%': '%', fraction: '',
}
export const asciiUnit = (u: string): string => (u.trim() === '' ? 'fraction' : UNIT_ASCII[u.trim()] ?? u.trim())
export const ruUnit = (u: string): string => UNIT_RU[u] ?? u
export const normUnitOf = (p: Param): string => (p.text ? '' : p.unit === '' ? 'fraction' : asciiUnit(p.unit))
export function formatNormalized(value: number | null | undefined, unit: string, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  const s = roundTo(value, digits).toFixed(digits).replace('.', ',')
  const u = ruUnit(unit)
  return u ? `${s} ${u}` : s
}

export function splitRaw(raw: string): { value: string; unit: string } {
  const m = raw.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/)
  return m ? { value: m[1]!.replace(',', '.'), unit: m[2]!.trim() } : { value: raw.trim(), unit: '' }
}

export function finishFact(f: Omit<Fact, 'raw_value' | 'raw_unit' | 'normalized_value' | 'normalized_unit' | 'extraction_status' | 'result_origin'> & Partial<Fact>, p: Param): Fact {
  const s = p.text ? { value: f.raw, unit: '' } : splitRaw(f.raw)
  const fact = f as Fact
  fact.raw_value = s.value
  fact.raw_unit = p.text ? '' : asciiUnit(s.unit)
  fact.normalized_value = f.edited != null ? f.edited : f.base
  fact.normalized_unit = normUnitOf(p)
  fact.extraction_status = p.text || f.base != null ? 'extracted' : 'present_not_extractable'
  fact.result_origin ??= 'primary'
  return fact
}

export function parseRaw(raw: string, p: Param): number | null {
  if (p.text) return null
  const m = raw.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (!m) return null
  const n = parseFloat(m[1]!.replace(',', '.'))
  const unit = m[2]!.trim()
  let k = p.units[unit] ?? (unit === p.unit ? 1 : undefined)
  if (unit === '' && p.unit !== '' && p.units[''] !== undefined && p.units[''] !== 1 && n > 1) k = 1
  return k === undefined ? null : n * k
}

export function roundTo(v: number, d: number): number {
  const m = 10 ** d
  return Math.round(Number((v * m).toPrecision(12))) / m
}

export function fmt(v: number | null | undefined, p: Param, withUnit = true): string {
  if (v == null || Number.isNaN(v)) return '—'
  const s = roundTo(v, p.digits).toFixed(p.digits).replace('.', ',')
  return withUnit && p.unit ? `${s} ${p.unit}` : s
}
export function fmtFull(v: number | null | undefined, p: Param, withUnit = true): string {
  if (v == null || Number.isNaN(v)) return '—'
  const eps = 1e-9 * Math.max(1, Math.abs(v))
  const base = roundTo(v, p.digits)
  const more = roundTo(v, p.digits + 1)
  const exact = Math.abs(v - base) > eps && Math.abs(v - more) <= eps
  const s = (exact ? more : base).toFixed(exact ? p.digits + 1 : p.digits).replace('.', ',')
  return withUnit && p.unit ? `${s} ${p.unit}` : s
}

export function sampleWords(c: CollectionId) {
  return c === 'rag'
    ? { one: 'конфигурация', gen: 'конфигурации', cap: 'Конфигурация', all: 'все конфигурации', allCap: 'Все конфигурации', byRows: 'По конфигурациям' }
    : { one: 'образец', gen: 'образца', cap: 'Образец', all: 'все образцы', allCap: 'Все образцы', byRows: 'По образцам' }
}

export const softLabel = (l: string) => (/^[А-ЯЁ][а-яё]/.test(l) ? l[0]!.toLowerCase() + l.slice(1) : l)

export function rowTitle(p: { collection: CollectionId; rows: Row[] }, row: string, form: 'cap' | 'nom' | 'gen' = 'cap'): string {
  const w = sampleWords(p.collection)
  if (row === '*') return form === 'cap' ? w.allCap : w.all
  const label = p.rows.find((r) => r.id === row)?.label ?? row
  return `${form === 'cap' ? w.cap : form === 'gen' ? w.gen : w.one} ${softLabel(label)}`
}

const SUB = '₀₁₂₃₄₅₆₇₈₉'
const FORMULAS = ['FA0.8Cs0.2Pb(I,Br)3', 'Cu2ZnSn(S,Se)4', 'Cu2ZnSnSe4', 'Cu2ZnSnS4', 'Sb2Se3', 'CH3NH3PbI3', 'Cu(In,Ga)Se2', 'HC(NH2)2PbI3', 'HC(NH2)2SnI3', 'MAPbI3', 'FAPbI3', 'CsPbI3', 'FASnI3', 'CdCl2', 'SnO2', 'TiO2', 'NiOx']
const FORMULA_RE = new RegExp(`(?<![A-Za-z0-9])(${FORMULAS.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`, 'g')
const subOf = (f: string) => f.replace(/\d/g, (d) => SUB[+d]!).replace(/(?<=O)x$/, 'ₓ')
export const chem = (s: string): string => s.replace(FORMULA_RE, (m) => subOf(m))

export function normConditions(raw: string): string {
  return raw
    .replace(/(\d+(?:[.,]\d+)?)\s*Вт\/м²/g, (_m, n: string) => `${String(Math.round((parseFloat(n.replace(',', '.')) / 10) * 100) / 100).replace('.', ',')} мВт/см²`)
    .replace(/(\d+)\s*°\s*C/g, '$1 °C')
}

export function parseConditions(raw: string) {
  const spectrum = raw.match(/AM\s?\d(?:[.,]\d)?\s?[GD]?/i)?.[0].replace(/\s/g, '').toUpperCase() ?? null
  const mw = raw.match(/(\d+(?:[.,]\d+)?)\s*мВт\s*\/\s*см²/i)
  const w = raw.match(/(\d+(?:[.,]\d+)?)\s*Вт\s*\/\s*м²/i)
  const power = mw ? parseFloat(mw[1]!.replace(',', '.')) : w ? parseFloat(w[1]!.replace(',', '.')) / 10 : null
  const t = raw.match(/(-?\d+(?:[.,]\d+)?)\s*°\s*C/i)
  const temp = t ? parseFloat(t[1]!.replace(',', '.')) : null
  return { spectrum, power, temp }
}

export const RECORD_SOURCE = 'NREL Best Research-Cell Efficiency Chart'
export const RECORDS: { id: string; name: string; re: RegExp; value: number }[] = [
  { id: 'kesterite', name: 'кестерит CZTSSe', re: /кестерит|czts|cu2znsn/i, value: 15.8 },
  { id: 'sbse', name: 'Sb₂Se₃', re: /sb2se3|sb₂se₃|сурьм/i, value: 10.7 },
  { id: 'leadfree', name: 'бессвинцовый Sn-перовскит', re: /бессвинц|олов|\bSn\b/i, value: 15 },
  { id: 'cigs', name: 'CIGS', re: /cigs/i, value: 23.6 },
  { id: 'cdte', name: 'CdTe', re: /cdte/i, value: 22.6 },
  { id: 'perov', name: 'перовскит', re: /перовск|mapbi/i, value: 26.7 },
]
export const recordFor = (p: { title: string; tags: string }) => RECORDS.find((r) => r.re.test(`${p.title} ${p.tags}`))

export const cellText = (raw: string) => raw.match(/^-?\d+(?:[.,]\d+)?/)?.[0] ?? raw
export const unitText = (raw: string) => raw.replace(/^-?\d+(?:[.,]\d+)?\s*/, '')

export const TOKEN = /\[\[([^|\]]+)\|([^\]]+)\]\]/g

function hash(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

export const anchorOf = (paperId: string, kind: 'c' | 't', row: string, param: string) => `${paperId}:${kind}:${row}:${param}`

export function buildFacts(p: PaperSeed & { id: string }): Fact[] {
  const c = COLLECTIONS[p.collection]
  const out: Fact[] = []
  for (const r of p.rows) {
    for (const key of c.table) {
      const raw = r.values[key]
      if (!raw) continue
      const anchor = anchorOf(p.id, 'c', r.id, key)
      const pr = paramOf(p.collection, key)
      const base = parseRaw(raw, pr)
      out.push(finishFact({
        id: anchor,
        paperId: p.id,
        row: r.id,
        param: key,
        raw,
        base,
        edited: null,
        status: 'new',
        confidence: 0.9 + (hash(anchor) % 90) / 1000,
        source: { page: p.page, kind: 'table', ref: `Табл. ${p.tableNo}`, where: `строка ${r.label}`, anchor },
      }, pr))
    }
  }
  p.paragraphs.forEach((para, i) => {
    for (const m of para.matchAll(TOKEN)) {
      const key = m[1]!
      if (key.startsWith('@')) continue
      const [row, param] = key.split('.') as [string, string]
      const anchor = anchorOf(p.id, 't', row, param)
      const pr = paramOf(p.collection, param)
      const base = parseRaw(m[2]!, pr)
      const f = finishFact({
        id: anchor,
        paperId: p.id,
        row,
        param,
        raw: m[2]!,
        base,
        edited: null,
        status: 'new',
        confidence: 0.78 + (hash(anchor) % 140) / 1000,
        source: { page: p.page, kind: 'text', ref: 'текст', where: `абзац ${i + 1}`, anchor },
      }, pr)
      const main = out.find((x) => x.source.kind === 'table' && x.row === row && x.param === param)
      if (main) f.duplicate_of = main.id
      const ref = p.cited?.[key]
      if (ref) {
        f.result_origin = 'cited'
        f.cited_publication_id = ref
      }
      out.push(f)
    }
  })
  return out
}

export const rowLabel = (p: PaperSeed, row: string) => (row === '*' ? sampleWords(p.collection).all : p.rows.find((r) => r.id === row)?.label ?? row)

const r = (id: string, label: string, values: Record<string, string>, meta: Omit<Row, 'id' | 'label' | 'values'> = {}): Row => ({ id, label, values, ...meta })

export const SEEDS: PaperSeed[] = [
  {
    id: 'mapbi',
    collection: 'solar',
    title: 'Перовскитный солнечный элемент с КПД 18,6 %: стабильность и интерфейсы',
    authors: 'Иванов А. В., Котова Е. С. и др.',
    year: 2024,
    journal: 'Физика и химия материалов, 2024, т. 16, № 2',
    doi: '10.5555/fhm.2024.16.2.118',
    material_class: 'perovskite',
    pages: 12,
    page: 4,
    tags: 'перовскит MAPbI3 n-i-p',
    tableNo: 2,
    caption: 'Фотоэлектрические параметры исследованных образцов',
    section: '3. Результаты и обсуждение',
    rows: [
      r('A', 'A', { voc: '1,08 В', jsc: '22,9 мА/см²', ff: '0,77', pce: '19,0 %' }, { device_role: 'control', architecture: 'n-i-p', active_area: 0.1, scan_direction: 'reverse' }),
      r('B', 'B', { voc: '1,10 В', jsc: '23,4 мА/см²', ff: '0,79', pce: '18,6 %' }, { device_role: 'record', architecture: 'n-i-p', active_area: 0.1, aggregation: 'champion', scan_direction: 'reverse' }),
      r('C', 'C', { voc: '1,05 В', jsc: '22,1 мА/см²', ff: '0,75', pce: '17,4 %' }, { device_role: 'target', architecture: 'n-i-p', active_area: 0.1, scan_direction: 'reverse' }),
      r('Bf', 'B, прямой ход', { voc: '1,07 В', jsc: '23,2 мА/см²', ff: '0,69', pce: '17,1 %' }, { device_role: 'record', architecture: 'n-i-p', active_area: 0.1, aggregation: 'champion', scan_direction: 'forward', batch: 'B' }),
    ],
    paragraphs: [
      'Фотоэлектрические характеристики изготовленных элементов измеряли при [[*.conditions|AM1.5G, 100 мВт/см², 25 °C]]. На рис. 3 представлены вольт-амперные характеристики образцов A–C, основные параметры приведены в табл. 2.',
      '[[@best|Наилучшие характеристики демонстрирует образец B]]: высокое значение Voc связано с пассивацией поверхностных дефектов, а рост FF — со снижением последовательного сопротивления.',
      'Ширина запрещённой зоны перовскита, определённая по спектрам поглощения, составила [[*.bandgap|1,59 эВ]]. Толщина активного слоя во всех образцах — [[*.thickness|450 нм]].',
      'Для образца B кривые при обратном и прямом ходе развёртки различаются; индекс гистерезиса — [[B.hi|8,1 %]].',
      'В аннотации приведён КПД лучшего образца B: [[B.pce|18,6 %]].',
    ],
    claims: [{ id: 'best', row: 'B', param: 'pce', kind: 'best' }],
    figure: 'Рис. 3. Вольт-амперные характеристики образцов A–C',
    addedDays: 0,
  },
  {
    id: 'cigs',
    collection: 'solar',
    title: 'CIGS на гибкой подложке: влияние щелочного легирования',
    authors: 'Смирнова О. П., Гусев Д. А.',
    year: 2023,
    journal: 'Журнал технической физики, 2023, т. 93, № 7',
    doi: '10.5555/jtf.2023.93.7.052',
    material_class: 'CIGS',
    pages: 9,
    page: 5,
    tags: 'CIGS Cu(In,Ga)Se2 гибкий',
    tableNo: 1,
    caption: 'Параметры элементов с разными щелочными добавками',
    section: '4. Результаты',
    rows: [
      r('Na', 'Na', { voc: '690 мВ', jsc: '33,1 мА/см²', ff: '74,5 %', pce: '17,0 %' }, { device_role: 'control', architecture: 'substrate', active_area: 0.5 }),
      r('K', 'K', { voc: '712 мВ', jsc: '34,0 мА/см²', ff: '76,2 %', pce: '18,5 %' }, { device_role: 'record', architecture: 'substrate', active_area: 0.5, aggregation: 'champion', certified: true }),
      r('Rb', 'Rb', { voc: '705 мВ', jsc: '33,6 мА/см²', ff: '75,1 %', pce: '17,8 %' }, { device_role: 'target', architecture: 'substrate', active_area: 0.5 }),
    ],
    paragraphs: [
      'Образцы с разными щелочными добавками измеряли при [[*.conditions|AM1.5G, 1000 Вт/м², 25 °C]] на площади 0,5 см².',
      'Легирование калием дало [[@best|наибольший КПД среди образцов — 18,5 %]], что согласуется с ростом Voc до 712 мВ.',
      'Ширина запрещённой зоны поглотителя с калием — [[K.bandgap|1,15 эВ]], толщина слоя CIGS — [[K.thickness|2,1 мкм]].',
      'Последовательное сопротивление образца K — [[K.rs|1,2 Ом·см²]], шунтирующее — [[K.rsh|480 Ом·см²]]; интегральный ток по спектру EQE — [[K.jsc_eqe|33,3 мА/см²]].',
      'В аннотации заявлен КПД калиевого образца [[K.pce|18,9 %]].',
    ],
    claims: [{ id: 'best', row: 'K', param: 'pce', kind: 'best' }],
    figure: 'Рис. 2. J–V характеристики элементов с добавками Na, K, Rb',
    addedDays: 0,
  },
  {
    id: 'cdte',
    collection: 'solar',
    title: 'CdTe: пассивация границ зёрен хлоридом кадмия',
    authors: 'Петров И. Н., Лаптева М. Ю.',
    year: 2022,
    journal: 'Письма в ЖТФ, 2022, т. 48, № 11',
    doi: '10.5555/pjtf.2022.48.11.031',
    material_class: 'CdTe',
    cited: { 'Cl.bandgap': '[3]' },
    pages: 6,
    page: 3,
    tags: 'CdTe CdCl2 пассивация',
    tableNo: 1,
    caption: 'Параметры элементов до и после обработки',
    section: '3. Обсуждение',
    rows: [
      r('Ref', 'Без обработки', { voc: '0,82 В', jsc: '26,1 мА/см²', ff: '0,72', pce: '15,4 %' }, { device_role: 'control', architecture: 'superstrate', active_area: 0.25 }),
      r('Cl', 'CdCl₂', { voc: '0,86 В', jsc: '26,9 мА/см²', ff: '0,78', pce: '18,0 %' }, { device_role: 'record', architecture: 'superstrate', active_area: 0.25, aggregation: 'champion' }),
      r('Clm', 'CdCl₂, среднее', { voc: '0,85 В', jsc: '26,5 мА/см²', ff: '0,75', pce: '16,9 %' }, { device_role: 'target', architecture: 'superstrate', active_area: 0.25, aggregation: 'mean', n_devices: 15, spread_value: 0.7, batch: 'Cl' }),
    ],
    paragraphs: [
      'Обработка хлоридом кадмия пассивирует границы зёрен и уменьшает рекомбинацию. Параметры элементов до и после обработки приведены в табл. 1.',
      '[[@best|После обработки КПД вырос до 18,0 %]] за счёт одновременного роста Voc и FF.',
      'Ширина запрещённой зоны CdTe — [[Cl.bandgap|1,45 эВ]] [3], толщина поглотителя — [[Cl.thickness|3,5 мкм]].',
      'Интегрирование спектра внешней квантовой эффективности даёт ток [[Cl.jsc_eqe|24,8 мА/см²]].',
    ],
    claims: [{ id: 'best', row: 'Cl', param: 'pce', kind: 'best' }],
    figure: 'Рис. 4. J–V характеристики до и после обработки CdCl₂',
    addedDays: 1,
  },
  {
    id: 'czts',
    collection: 'solar',
    title: 'CZTSSe: легирование германием и тыльный контакт',
    authors: 'Фёдоров А. С., Назарова Л. И.',
    year: 2024,
    journal: 'Физика и техника полупроводников, 2024, т. 58, № 5',
    doi: '10.5555/ftp.2024.58.5.087',
    material_class: 'kesterite',
    pages: 8,
    page: 4,
    tags: 'кестерит CZTSSe Cu2ZnSn(S,Se)4 германий',
    tableNo: 2,
    caption: 'Параметры кестеритных элементов без Ge и с Ge',
    section: '3. Результаты',
    rows: [
      r('S0', 'Без Ge', { voc: '0,49 В', jsc: '33,8 мА/см²', ff: '66,2 %', pce: '11,0 %' }, { device_role: 'control', architecture: 'substrate', active_area: 0.2, aggregation: 'champion' }),
      r('S0m', 'Без Ge, среднее', { voc: '0,50 В', jsc: '34,1 мА/см²', ff: '67,0 %', pce: '11,4 %' }, { device_role: 'control', architecture: 'substrate', active_area: 0.2, aggregation: 'mean', n_devices: 12, spread_value: 0.4, batch: 'S0' }),
      r('Ge', 'С Ge', { voc: '0,53 В', jsc: '35,2 мА/см²', ff: '69,0 %', pce: '12,9 %' }, { device_role: 'record', architecture: 'substrate', active_area: 0.2, aggregation: 'champion' }),
    ],
    paragraphs: [
      'Элементы измеряли при [[*.conditions|AM1.5G, 25 °C]] на площади 0,2 см², площадь задана маской.',
      '[[@best|Наибольший КПД получен при легировании германием: образец Ge — 12,9 %]], Ge повышает Voc и FF.',
      'Ширина запрещённой зоны CZTSSe по спектрам EQE составила [[*.bandgap|0,52 эВ]], толщина поглотителя — [[*.thickness|1,1 мкм]].',
      'Последовательное сопротивление снижается с [[S0.rs|2,9 Ом·см²]] до [[Ge.rs|1,6 Ом·см²]].',
    ],
    claims: [{ id: 'best', row: 'Ge', param: 'pce', kind: 'best' }],
    figure: 'Рис. 4. J–V характеристики образцов без Ge и с Ge',
    addedDays: 3,
  },
  {
    id: 'sbse',
    collection: 'solar',
    title: 'Тонкоплёночные элементы Sb₂Se₃: отжиг в парах селена',
    authors: 'Громова Т. В., Ахмедов Р. Ш.',
    year: 2023,
    journal: 'Журнал технической физики, 2023, т. 93, № 11',
    doi: '10.5555/jtf.2023.93.11.146',
    material_class: 'Sb2Se3',
    cited: { '*.bandgap': '[15]' },
    pages: 7,
    page: 4,
    tags: 'Sb2Se3 селенид сурьмы отжиг',
    tableNo: 1,
    caption: 'Параметры элементов Sb₂Se₃ при разной обработке',
    section: '3. Результаты',
    rows: [
      r('As', 'Без отжига', { voc: '0,40 В', jsc: '25,6 мА/см²', ff: '52,1 %', pce: '5,3 %' }, { device_role: 'control', architecture: 'superstrate', active_area: 0.09 }),
      r('Se', 'Отжиг в Se', { voc: '0,46 В', jsc: '28,2 мА/см²', ff: '56,4 %', pce: '7,3 %' }, { device_role: 'record', architecture: 'superstrate', active_area: 0.09, aggregation: 'champion' }),
    ],
    paragraphs: [
      'Измерения проведены при [[*.conditions|AM1.5G, 100 мВт/см², 25 °C]] на площади 0,09 см².',
      '[[@best|Отжиг в парах селена даёт наибольший КПД — 7,3 %]] за счёт роста Voc и Jsc.',
      'Ширина запрещённой зоны Sb₂Se₃ — [[*.bandgap|1,18 эВ]] [15], толщина поглотителя — [[*.thickness|1,2 мкм]].',
      'В аннотации указан КПД лучшего образца — [[Se.pce|17,3 %]].',
    ],
    claims: [{ id: 'best', row: 'Se', param: 'pce', kind: 'best' }],
    figure: 'Рис. 3. J–V характеристики Sb₂Se₃ до и после отжига',
    addedDays: 4,
  },
  {
    id: 'stab',
    collection: 'solar',
    title: 'Стабильность перовскитных элементов при 85 °C',
    authors: 'Ким Д., Орлов В. В.',
    year: 2023,
    journal: 'Неорганические материалы, 2023, т. 59, № 4',
    doi: '10.5555/nm.2023.59.4.077',
    material_class: 'perovskite',
    pages: 8,
    page: 7,
    tags: 'перовскит стабильность деградация',
    tableNo: 2,
    caption: 'Параметры до и после 1000 ч при 85 °C',
    section: '4. Деградация',
    rows: [
      r('h0', '0 ч', { voc: '1,12 В', jsc: '23,8 мА/см²', ff: '0,80', pce: '21,3 %' }, { device_role: 'target', architecture: 'n-i-p', active_area: 0.16 }),
      r('h1000', '1000 ч', { voc: '1,06 В', jsc: '22,7 мА/см²', ff: '0,71', pce: '17,1 %' }, { device_role: 'target', architecture: 'n-i-p', active_area: 0.16 }),
    ],
    paragraphs: [
      'Элементы выдерживали при 85 °C в азоте и периодически измеряли при [[*.conditions|AM1.5G, 100 мВт/см²]].',
      'Через 1000 ч КПД снизился с 21,3 до 17,1 %, в основном из-за падения FF. Время потери 20 % КПД (T80) — [[*.t80|1000 ч]], сохранение КПД — [[h1000.retained_pce|80 %]].',
      'Ширина запрещённой зоны — [[h0.bandgap|1,62 эВ]], толщина слоя — [[h0.thickness|0,5 мкм]].',
    ],
    claims: [],
    figure: 'Рис. 6. J–V характеристики до и после старения',
    addedDays: 6,
  },
  {
    id: 'leadfree',
    collection: 'solar',
    title: 'Бессвинцовые перовскиты на основе олова и германия',
    authors: 'Орлова Т. А., Беляев К. С.',
    year: 2024,
    journal: 'Журнал неорганической химии, 2024, т. 69, № 1',
    doi: '10.5555/zhnx.2024.69.1.014',
    material_class: 'perovskite',
    pages: 10,
    page: 4,
    tags: 'бессвинцовые олово Sn Ge перовскит',
    tableNo: 2,
    caption: 'Параметры элементов на основе Sn и Sn–Ge',
    section: '3. Результаты',
    rows: [
      r('Sn', 'Sn', { voc: '0,64 В', jsc: '24,2 мА/см²', ff: '0,68', pce: '10,5 %' }, { device_role: 'control', architecture: 'p-i-n', active_area: 0.12 }),
      r('SnGe', 'Sn–Ge', { voc: '0,71 В', jsc: '25,0 мА/см²', ff: '0,70', pce: '12,4 %' }, { device_role: 'record', architecture: 'p-i-n', active_area: 0.12, aggregation: 'champion' }),
    ],
    paragraphs: [
      'Олово-германиевые перовскиты исследовали как замену свинцовым. Измерения проведены при [[*.conditions|AM1.5G, 100 мВт/см², 25 °C]].',
      '[[@best|Добавка германия повысила КПД до 12,4 %]] и улучшила стабильность на воздухе.',
      'Ширина запрещённой зоны — [[SnGe.bandgap|1,30 эВ]], толщина поглотителя — [[SnGe.thickness|350 нм]].',
      'Последовательное сопротивление образца Sn — [[Sn.rs|35 Ом·см²]], шунтирующее — [[Sn.rsh|28 Ом·см²]].',
    ],
    claims: [{ id: 'best', row: 'SnGe', param: 'pce', kind: 'best' }],
    figure: 'Рис. 3. J–V характеристики Sn и Sn–Ge элементов',
    addedDays: 12,
  },
  {
    id: 'hybrid',
    collection: 'rag',
    title: 'Гибридный поиск BM25 + плотные эмбеддинги для RAG',
    authors: 'Соколов М. И., Дьячкова А. Р.',
    year: 2024,
    journal: 'Труды конференции «Диалог», 2024',
    doi: '10.5555/dialog.2024.211',
    task: 'Поиск документов по вопросу',
    dataset: 'Внутренний корпус, 12 тыс. документов',
    eval_protocol: '1200 вопросов, один размеченный документ на вопрос',
    pages: 11,
    page: 5,
    tags: 'гибридный BM25 dense RRF',
    tableNo: 2,
    caption: 'Качество поиска на корпусе из 12 тыс. документов',
    section: '4. Эксперименты',
    rows: [
      r('bm25', 'BM25', { chunk: '512 ток.', r5: '0,61', r10: '0,72', mrr: '0,48' }, { baseline: true, top_k: 10, aggregation: 'mean', sample_size: 1200, metric_variant: 'Recall@k по документам' }),
      r('dense', 'Dense', { chunk: '512 ток.', r5: '0,68', r10: '0,79', mrr: '0,55' }, { top_k: 10, embedding_model: 'e5-large', aggregation: 'mean', sample_size: 1200, metric_variant: 'Recall@k по документам' }),
      r('hybrid', 'Hybrid', { chunk: '512 ток.', r5: '0,74', r10: '0,85', mrr: '0,61' }, { top_k: 10, embedding_model: 'e5-large', aggregation: 'mean', sample_size: 1200, metric_variant: 'Recall@k по документам' }),
    ],
    paragraphs: [
      'Сравнивали три способа поиска. Гибридный вариант объединяет [[hybrid.retriever|BM25 + e5-large, слияние RRF]].',
      '[[@best|Гибридный поиск оказался лучшим по всем метрикам]], прирост особенно заметен на длинных вопросах.',
      'В аннотации указано, что [[@eq|Recall@5 гибридного поиска достигает 0,76]].',
      'Дополнительно для гибридного поиска: Recall@20 — [[hybrid.r20|0,91]], nDCG@10 — [[hybrid.ndcg10|0,66]], задержка запроса — [[hybrid.latency_ms|35 мс]].',
    ],
    claims: [
      { id: 'best', row: 'hybrid', param: 'r5', kind: 'best' },
      { id: 'eq', row: 'hybrid', param: 'r5', kind: 'equals', value: 0.76 },
    ],
    figure: 'Рис. 2. Recall@5 для трёх ретриверов',
    addedDays: 0,
  },
  {
    id: 'chunks',
    collection: 'rag',
    title: 'Размер чанка и качество ответов RAG-систем',
    authors: 'Захарова Н. В.',
    year: 2023,
    journal: 'Информатика и её применения, 2023, т. 17, № 2',
    doi: '10.5555/ipi.2023.17.2.093',
    task: 'Ответы на вопросы по документам',
    dataset: 'SberQuAD',
    pages: 9,
    page: 6,
    tags: 'размер чанка chunk',
    tableNo: 1,
    caption: 'Метрики поиска при разном размере чанка',
    section: '3. Результаты',
    rows: [
      r('c256', '256', { chunk: '256 ток.', r5: '0,66', r10: '0,78', mrr: '0,52' }, { baseline: true, top_k: 10, embedding_model: 'e5-base' }),
      r('c512', '512', { chunk: '512 ток.', r5: '0,71', r10: '0,83', mrr: '0,57' }, { top_k: 10, embedding_model: 'e5-base' }),
      r('c1024', '1024', { chunk: '1024 ток.', r5: '0,64', r10: '0,61', mrr: '0,50' }, { top_k: 10, embedding_model: 'e5-base' }),
    ],
    paragraphs: [
      'Оценивали влияние размера фрагмента на качество поиска с ретривером [[*.retriever|e5-base]].',
      '[[@best|Оптимальный размер чанка — 512 токенов]]: меньшие фрагменты теряют контекст, большие размывают релевантность.',
      'Для чанка 512 токенов nDCG@10 составил [[c512.ndcg10|1,12]].',
    ],
    claims: [{ id: 'best', row: 'c512', param: 'r5', kind: 'best' }],
    figure: 'Рис. 1. Recall@5 в зависимости от размера чанка',
    addedDays: 2,
  },
  {
    id: 'rerank',
    collection: 'rag',
    title: 'Переранжирование кросс-энкодером в поиске по документам',
    authors: 'Ву Т., Головин П. С.',
    year: 2024,
    journal: 'Программирование, 2024, № 5',
    doi: '10.5555/prog.2024.5.060',
    task: 'Переранжирование кандидатов',
    dataset: 'MIRACL (ru)',
    eval_protocol: 'отложенная выборка, 500 запросов, 100 кандидатов на запрос',
    pages: 7,
    page: 4,
    tags: 'reranker переранжирование кросс-энкодер',
    tableNo: 2,
    caption: 'Качество поиска с переранжированием и без',
    section: '4. Результаты',
    rows: [
      r('base', 'Без reranker', { chunk: '384 ток.', r5: '0,63', r10: '0,75', mrr: '0,51' }, { baseline: true, top_k: 5, embedding_model: 'bge-m3', aggregation: 'mean', sample_size: 500, metric_variant: 'Recall@k, доля запросов с релевантным документом в топ-k' }),
      r('rr', 'С reranker', { chunk: '384 ток.', r5: '0,77', r10: '0,84', mrr: '0,66' }, { top_k: 5, embedding_model: 'bge-m3', reranker_model: 'bge-reranker-large', aggregation: 'mean', sample_size: 500, metric_variant: 'Recall@k, доля запросов с релевантным документом в топ-k' }),
    ],
    paragraphs: [
      'Кандидатов первого этапа переранжировали кросс-энкодером [[rr.retriever|bge-reranker-large]].',
      '[[@best|Переранжирование повышает Recall@5 до 0,77]] при росте задержки на 40 мс.',
      'nDCG@10 вырос с [[base.ndcg10|0,58]] до [[rr.ndcg10|0,71]]; задержка запроса — [[base.latency_ms|78 мс]] и [[rr.latency_ms|118 мс]].',
    ],
    claims: [{ id: 'best', row: 'rr', param: 'r5', kind: 'best' }],
    figure: 'Рис. 3. Recall@k с переранжированием и без',
    addedDays: 9,
  },
]
