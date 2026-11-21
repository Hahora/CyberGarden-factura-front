import { COLLECTIONS, chem, normConditions, paramOf, rowLabel, sampleWords, type Fact } from './data'
import { display, factsOf, openIssues, valueOf, type Paper } from './store'
import { materialBySynonym } from './dictionary'

export interface Cell {
  row: string
  param: string
  facts: Fact[]
  main: Fact | null
  level: 'conflict' | 'doubt' | null
  diverge: boolean
  figureOnly: boolean
}

const sameValue = (a: Fact, b: Fact) => {
  const x = valueOf(a)
  const y = valueOf(b)
  if (x != null && y != null) return Math.abs(x - y) <= Math.max(1e-9, Math.abs(x) * 0.005)
  return a.raw.trim().toLowerCase() === b.raw.trim().toLowerCase()
}

export function coverageOf(p: Paper) {
  const all = factsOf(p.id).filter((f) => f.status !== 'rejected')
  const level = new Map<string, 'conflict' | 'doubt'>()
  for (const i of openIssues(p)) for (const id of i.factIds) if (i.level === 'conflict' || !level.has(id)) level.set(id, i.level === 'conflict' ? 'conflict' : 'doubt')
  const known = COLLECTIONS[p.collection].params.filter((x) => !x.optional).map((x) => x.key)
  const extra = [...new Set(all.map((f) => f.param))].filter((k) => !known.includes(k))
  const params = [...known, ...extra]
  const cells: Cell[] = []
  for (const r of p.rows) {
    for (const k of params) {
      const facts = all.filter((f) => f.param === k && (f.row === r.id || f.row === '*'))
      const main = [...facts].sort((a, b) => Number(b.status === 'accepted') - Number(a.status === 'accepted') || b.confidence - a.confidence)[0] ?? null
      const lv = facts.some((f) => level.get(f.id) === 'conflict') ? 'conflict' : facts.some((f) => level.has(f.id)) ? 'doubt' : null
      cells.push({
        row: r.id,
        param: k,
        facts,
        main,
        level: lv,
        diverge: facts.length > 1 && facts.some((f) => !sameValue(f, facts[0]!)),
        figureOnly: facts.length > 0 && facts.every((f) => f.source.kind === 'figure'),
      })
    }
  }
  const filled = cells.filter((c) => c.main).length
  return {
    params,
    cells,
    total: cells.length,
    filled,
    conflicts: openIssues(p).filter((i) => i.level === 'conflict').length,
    figureOnly: cells.filter((c) => c.figureOnly).length,
    diverge: cells.filter((c) => c.diverge).length,
  }
}

export type Role = 'glass' | 'tco' | 'etl' | 'absorber' | 'htl' | 'contact' | 'extra'
export const ROLE_LABEL: Record<Role, string> = {
  glass: 'Подложка',
  tco: 'Прозрачный электрод',
  etl: 'Транспорт электронов',
  absorber: 'Поглотитель',
  htl: 'Транспорт дырок',
  contact: 'Тыльный контакт',
  extra: 'Дополнительный слой',
}

export interface Layer {
  role: Role
  raw: string
  name: string
  nm: number
  where: string
  page: number
  fact: Fact | null
}
export interface Variant {
  id: string
  label: string
  layers: Layer[]
}

interface L { role: Role; raw: string; nm: number; where: string; page: number }
const l = (role: Role, raw: string, nm: number, where: string, page: number): L => ({ role, raw, nm, where, page })

const STACKS: Record<string, { id: string; label: string; layers: L[] }[]> = {
  mapbi: [
    { id: 'all', label: 'A–C', layers: [
      l('glass', 'Стекло', 1_100_000, 'Эксперимент, абзац 1', 3),
      l('tco', 'FTO', 350, 'Эксперимент, абзац 1', 3),
      l('etl', 'SnO2', 30, 'Эксперимент, абзац 2', 3),
      l('absorber', 'MAPbI3', 450, 'Результаты, абзац 3', 4),
      l('htl', 'Spiro-MeOTAD', 150, 'Эксперимент, абзац 2', 3),
      l('contact', 'Au', 80, 'Эксперимент, абзац 3', 3),
    ] },
  ],
  cigs: ['Na', 'K', 'Rb'].map((m) => ({
    id: m, label: m, layers: [
      l('tco', 'ZnO:Al', 350, 'Эксперимент, абзац 1', 3),
      l('etl', 'CdS', 50, 'Эксперимент, абзац 1', 3),
      l('absorber', 'CIGS', 2100, 'Результаты, абзац 3', 5),
      l('extra', m + 'F (PDT)', 10, 'Табл. S1', 8),
      l('contact', 'Mo', 500, 'Эксперимент, абзац 2', 3),
      l('glass', 'Полиимид', 25_000, 'Эксперимент, абзац 1', 3),
    ],
  })),
  cdte: [
    { id: 'Ref', label: 'Без обработки', layers: [
      l('glass', 'Стекло', 3_200_000, 'Методика, абзац 1', 2),
      l('tco', 'FTO', 400, 'Методика, абзац 1', 2),
      l('etl', 'CdS', 80, 'Методика, абзац 1', 2),
      l('absorber', 'CdTe', 3500, 'Обсуждение, абзац 3', 3),
      l('htl', 'ZnTe:Cu', 50, 'Методика, абзац 2', 2),
      l('contact', 'Au', 100, 'Методика, абзац 2', 2),
    ] },
    { id: 'Cl', label: 'CdCl₂', layers: [
      l('glass', 'Стекло', 3_200_000, 'Методика, абзац 1', 2),
      l('tco', 'FTO', 400, 'Методика, абзац 1', 2),
      l('etl', 'CdS', 80, 'Методика, абзац 1', 2),
      l('absorber', 'CdTe', 3500, 'Обсуждение, абзац 3', 3),
      l('extra', 'CdCl2 (обработка)', 100, 'Методика, абзац 2', 2),
      l('htl', 'ZnTe:Cu', 50, 'Методика, абзац 2', 2),
      l('contact', 'Au', 100, 'Методика, абзац 2', 2),
    ] },
  ],
  czts: ['S0', 'Ge'].map((m) => ({
    id: m, label: m === 'Ge' ? 'С Ge' : 'Без Ge', layers: [
      l('glass', 'Стекло', 3_200_000, 'Методика, абзац 1', 3),
      l('contact', 'Mo', 600, 'Методика, абзац 1', 3),
      l('absorber', m === 'Ge' ? 'Cu2ZnSn(S,Se)4 + Ge' : 'Cu2ZnSn(S,Se)4', 1100, 'Результаты, абзац 3', 4),
      l('etl', 'CdS', 50, 'Методика, абзац 2', 3),
      l('tco', 'ZnO:Al', 350, 'Методика, абзац 2', 3),
    ],
  })),
  sbse: ['As', 'Se'].map((m) => ({
    id: m, label: m === 'Se' ? 'Отжиг в Se' : 'Без отжига', layers: [
      l('glass', 'Стекло', 3_200_000, 'Методика, абзац 1', 2),
      l('tco', 'FTO', 400, 'Методика, абзац 1', 2),
      l('etl', 'CdS', 60, 'Методика, абзац 1', 2),
      l('absorber', 'Sb2Se3', 1200, 'Результаты, абзац 3', 4),
      l('contact', 'Au', 80, 'Методика, абзац 2', 2),
    ],
  })),
  stab: [
    { id: 'all', label: '0 ч · 1000 ч', layers: [
      l('glass', 'Стекло', 1_100_000, 'Методика, абзац 1', 2),
      l('tco', 'FTO', 350, 'Методика, абзац 1', 2),
      l('etl', 'SnO2', 30, 'Методика, абзац 1', 2),
      l('absorber', 'MAPbI3', 500, 'Деградация, абзац 3', 7),
      l('htl', 'Spiro-MeOTAD', 150, 'Методика, абзац 2', 2),
      l('contact', 'Au', 80, 'Методика, абзац 2', 2),
    ] },
  ],
  leadfree: [
    { id: 'Sn', label: 'Sn', layers: [
      l('glass', 'Стекло', 1_100_000, 'Методика, абзац 1', 3),
      l('tco', 'ITO', 150, 'Методика, абзац 1', 3),
      l('htl', 'PEDOT:PSS', 40, 'Методика, абзац 1', 3),
      l('absorber', 'FASnI3', 350, 'Результаты, абзац 3', 4),
      l('etl', 'C60', 30, 'Методика, абзац 2', 3),
      l('extra', 'BCP', 8, 'Методика, абзац 2', 3),
      l('contact', 'Ag', 100, 'Методика, абзац 2', 3),
    ] },
    { id: 'SnGe', label: 'Sn–Ge', layers: [
      l('glass', 'Стекло', 1_100_000, 'Методика, абзац 1', 3),
      l('tco', 'ITO', 150, 'Методика, абзац 1', 3),
      l('htl', 'PEDOT:PSS', 40, 'Методика, абзац 1', 3),
      l('absorber', 'FASnI3 + GeI2 (10 %)', 350, 'Результаты, абзац 3', 4),
      l('etl', 'C60', 30, 'Методика, абзац 2', 3),
      l('extra', 'BCP', 8, 'Методика, абзац 2', 3),
      l('contact', 'Ag', 100, 'Методика, абзац 2', 3),
    ] },
  ],
}

const seedOf = (p: Paper) => p.seed ?? p.id

export function structureOf(p: Paper): Variant[] {
  const facts = factsOf(p.id).filter((f) => f.status !== 'rejected' && f.param === 'thickness')
  const stacks = STACKS[seedOf(p)] ?? STACKS.mapbi!.map((s) => ({ ...s, label: p.rows.map((r) => r.label).join(', ') }))
  return stacks.map((s) => {
    const rows = p.rows.some((r) => r.id === s.id) ? [s.id] : p.rows.map((r) => r.id)
    const fact = facts.find((f) => rows.includes(f.row)) ?? facts.find((f) => f.row === '*') ?? null
    return {
      id: s.id,
      label: s.label,
      layers: s.layers.map((x) => {
        const abs = x.role === 'absorber' && fact
        const v = abs ? valueOf(fact) : null
        return {
          role: x.role,
          raw: chem(x.raw),
          name: chem(materialBySynonym(x.raw)?.canon ?? x.raw),
          nm: v != null ? v : x.nm,
          where: abs ? `${fact.source.ref}, ${fact.source.where}` : x.where,
          page: abs ? fact.source.page : x.page,
          fact: abs ? fact : null,
        }
      }),
    }
  })
}

export function fmtThickness(nm: number): string {
  const n = (v: number, d: number) => String(+v.toFixed(d)).replace('.', ',')
  if (nm >= 1e6) return `${n(nm / 1e6, 1)} мм`
  if (nm >= 1000) return `${n(nm / 1000, 1)} мкм`
  return `${n(nm, 0)} нм`
}

export interface Cond {
  key: string
  label: string
  value: string | null
  fact: Fact | null
}

const COND_EXTRA: Record<string, { area?: string; scan?: string }> = {
  cigs: { area: '0,5 см²' },
  czts: { area: '0,2 см²' },
  sbse: { area: '0,09 см²' },
}

export function conditionsOf(p: Paper): Cond[] {
  const f = factsOf(p.id).find((x) => x.param === 'conditions' && x.status !== 'rejected') ?? null
  const raw = normConditions(f?.raw ?? '')
  const extra = f ? COND_EXTRA[seedOf(p)] ?? {} : {}
  const pick = (re: RegExp) => raw.match(re)?.[0]?.replace(/\s+/g, ' ') ?? null
  const mk = (key: string, label: string, value: string | null): Cond => ({ key, label, value, fact: value ? f : null })
  return [
    mk('spectrum', 'Спектр', pick(/AM\s?1[.,]5G?/i)),
    mk('power', 'Мощность освещения', pick(/\d+(?:[.,]\d+)?\s*(?:мВт\/см²|Вт\/м²)/)),
    mk('temp', 'Температура', pick(/\d+\s*°C/)),
    mk('area', 'Площадь', extra.area ?? null),
    mk('scan', 'Скорость развёртки', extra.scan ?? null),
  ]
}

export interface PipeNode {
  key: string
  title: string
  value: string | null
  sub?: string
  fact: Fact | null
  items?: { label: string; value: string; fact: Fact }[]
}

export function pipelineOf(p: Paper, rowId: string): PipeNode[] {
  const facts = factsOf(p.id).filter((f) => f.status !== 'rejected')
  const get = (param: string) => facts.find((f) => f.param === param && (f.row === rowId || f.row === '*')) ?? null
  const seed = seedOf(p)
  const chunk = get('chunk')
  const ret = get('retriever')
  const rowName = rowLabel(p, rowId)
  const corpus = p.caption.match(/(?:на корпусе из|корпус)\s+(.+)$/i)?.[1]
  const metrics = ['r5', 'r10', 'mrr']
    .map((k) => ({ k, f: get(k) }))
    .filter((x): x is { k: string; f: Fact } => !!x.f)
    .map((x) => ({ label: paramOf(p.collection, x.k).label, value: display(x.f), fact: x.f }))
  const isRerankPaper = seed === 'rerank'
  return [
    { key: 'data', title: 'Датасет', value: corpus ? `корпус ${corpus}` : null, sub: corpus ? `подпись к табл. ${p.tableNo}` : undefined, fact: null },
    { key: 'chunk', title: 'Разбиение на чанки', value: chunk ? display(chunk) : null, sub: chunk ? chunk.source.ref : undefined, fact: chunk },
    isRerankPaper
      ? { key: 'ret', title: 'Ретривер', value: null, fact: null }
      : { key: 'ret', title: 'Ретривер', value: ret ? display(ret) : seed === 'hybrid' ? rowName : null, sub: ret ? ret.source.ref : seed === 'hybrid' ? `${sampleWords(p.collection).one} из таблицы` : undefined, fact: ret },
    isRerankPaper
      ? { key: 'rr', title: 'Переранжирование', value: ret ? display(ret) : 'нет', sub: ret ? ret.source.ref : `${sampleWords(p.collection).one} без reranker`, fact: ret }
      : { key: 'rr', title: 'Переранжирование', value: null, fact: null },
    { key: 'gen', title: 'Генератор', value: null, fact: null },
    { key: 'met', title: 'Метрики', value: metrics.length ? '' : null, fact: null, items: metrics },
  ]
}
