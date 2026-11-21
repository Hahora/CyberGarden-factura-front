import { cellText, paramOf, rowLabel, unitText, type CollectionId, type Fact } from './data'
import { quoteOf } from './query'
import { conditionsOf, structureOf, type Role } from './structure'
import { factsOf, issuesFor, paperOf, state, valueOf, type Paper } from './store'
import { PASSPORT } from './passport'

export type Row = Record<string, string>
export interface Table {
  name: string
  cols: string[]
  rows: Row[]
}
export interface SubmissionOptions {
  paperIds: string[]
  onlyAccepted: boolean
}

const colsOf = (c: CollectionId, id: string) => PASSPORT[c].entities.find((e) => e.id === id)!.fields.map((x) => x.name)

const g = (o: unknown, k: string): unknown => (o as Record<string, unknown> | null | undefined)?.[k]
const str = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'boolean' ? String(v) : Array.isArray(v) ? v.join(';') : String(v))
const num = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '' : String(+v.toPrecision(10)))

const STATUS = new Set(['extracted', 'present_not_extractable', 'absent'])
const statusOf = (f: Fact, v: number | null) => (STATUS.has(str(g(f, 'extraction_status'))) ? str(g(f, 'extraction_status')) : v == null ? 'present_not_extractable' : 'extracted')

const SUBS = '₀₁₂₃₄₅₆₇₈₉'
const ascii = (s: string) => s.replace(/[₀-₉]/g, (d) => String(SUBS.indexOf(d))).replace(/ₓ/g, 'x')

const RAW_UNIT: Record<string, string> = { 'В': 'V', 'мВ': 'mV', 'мА/см²': 'mA/cm2', 'А/м²': 'A/m2', '%': '%', 'эВ': 'eV', 'нм': 'nm', 'мкм': 'um', 'мВт/см²': 'mW/cm2' }

const METRIC: Record<string, { name: string; unit: string }> = {
  pce: { name: 'PCE', unit: '%' },
  voc: { name: 'Voc', unit: 'V' },
  jsc: { name: 'Jsc', unit: 'mA/cm2' },
  ff: { name: 'FF', unit: '%' },
}
const LAYER_FN: Record<Role, string> = { glass: '', tco: 'front_contact', etl: 'ETL', absorber: 'absorber', htl: 'HTL', contact: 'back_contact', extra: 'interlayer' }

function materialClass(p: Paper): string {
  const t = `${p.tags} ${p.title}`
  if (/CIGS/i.test(t)) return 'CIGS'
  if (/CdTe/i.test(t)) return 'CdTe'
  if (/перовск|perovsk/i.test(t)) return 'perovskite'
  return ''
}

const authorsOf = (s: string) =>
  s.replace(/\s*и др\.?$/i, '').split(/(?<=\.),\s*|,\s*(?=[А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z]\.)/).map((x) => x.trim()).filter(Boolean).join(';')

const TIME_ROW = /^(\d+(?:[.,]\d+)?)\s*(ч|h)$/i

function fragmentOf(p: Paper, f: Fact): string {
  if (f.source.kind === 'table') return `Table ${p.tableNo}, строка ${rowLabel(p, f.row)}`
  return f.quote ?? quoteOf(f, p)
}

function solarTables(o: SubmissionOptions): Table[] {
  const T = Object.fromEntries(['publications', 'materials', 'devices', 'layers', 'measurements', 'results', 'issues'].map((n) => [n, { name: n, cols: colsOf('solar', n), rows: [] as Row[] }])) as Record<string, Table>
  const row = (t: Table, v: Record<string, unknown>) => t.rows.push(Object.fromEntries(t.cols.map((c) => [c, str(v[c])])))

  for (const id of o.paperIds) {
    const p = paperOf(id)
    if (!p || p.collection !== 'solar' || p.processing < 100) continue
    const inScope = g(p, 'in_scope') !== false
    row(T.publications!, {
      publication_id: p.id, title: p.title, year: p.year, DOI: g(p, 'doi') ?? g(p, 'DOI'), authors: authorsOf(p.authors),
      in_scope: String(inScope), exclusion_reason: inScope ? '' : g(p, 'exclusion_reason'),
    })
    if (!inScope) continue

    const variants = structureOf(p)
    const matOf = new Map<string, string>()
    const matIds = new Map<string, string>()
    const bandgap = factsOf(p.id).find((f) => f.param === 'bandgap' && f.status !== 'rejected' && valueOf(f) != null)
    for (const v of variants) {
      const abs = v.layers.find((l) => l.role === 'absorber')
      if (!abs) continue
      const name = ascii(abs.raw)
      let mid = matIds.get(name)
      if (!mid) {
        const isFirst = matIds.size === 0
        mid = `M${matIds.size + 1}`
        matIds.set(name, mid)
        row(T.materials!, {
          publication_id: p.id, material_id: mid, material_name_raw: name, material_class: g(p, 'material_class') ?? materialClass(p),
          bandgap_value: isFirst && bandgap ? num(valueOf(bandgap)) : '', bandgap_unit: isFirst && bandgap ? 'eV' : '',
          bandgap_method: isFirst && bandgap ? g(bandgap, 'bandgap_method') : '',
        })
      }
      matOf.set(v.id, mid)
    }
    const firstMat = [...matIds.values()][0] ?? ''

    const timeRows = p.rows.length > 1 && p.rows.every((r) => TIME_ROW.test(r.label.trim()))
    const devOf = new Map<string, string>()
    const devs: { id: string; rowId: string; label: string }[] = []
    if (timeRows) {
      devs.push({ id: 'DV1', rowId: p.rows[0]!.id, label: p.rows.map((r) => r.label).join(' · ') })
      for (const r of p.rows) devOf.set(r.id, 'DV1')
    } else {
      p.rows.forEach((r, i) => {
        devs.push({ id: `DV${i + 1}`, rowId: r.id, label: r.label })
        devOf.set(r.id, `DV${i + 1}`)
      })
    }
    const cond = conditionsOf(p)
    const pick = (k: string) => cond.find((c) => c.key === k)?.value ?? ''
    const area = pick('area').match(/^(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? ''
    const tags = p.tags
    for (const d of devs) {
      const r = p.rows.find((x) => x.id === d.rowId)
      const vr = variants.find((v) => v.id === d.rowId) ?? variants[0]
      row(T.devices!, {
        publication_id: p.id, device_id: d.id, absorber_material_id: (vr && matOf.get(vr.id)) || firstMat, device_label: d.label,
        device_role: g(r, 'device_role'), device_type: g(r, 'device_type'),
        architecture: g(r, 'architecture') ?? tags.match(/n-i-p|p-i-n/)?.[0] ?? '',
        substrate_type: g(r, 'substrate_type') ?? (/гибк/i.test(tags) ? 'flexible' : ''),
        active_area: g(r, 'active_area') ?? area, area_unit: g(r, 'active_area') != null || area ? 'cm2' : '', area_definition: g(r, 'area_definition'),
        encapsulation: g(r, 'encapsulation'),
      })
      let ls = (vr?.layers ?? []).slice()
      if (ls.length && ls[ls.length - 1]!.role === 'glass') ls = ls.reverse()
      ls = ls.filter((l) => l.role !== 'glass')
      ls.forEach((l, i) => {
        const fn = LAYER_FN[l.role]
        row(T.layers!, {
          publication_id: p.id, layer_id: `L${T.layers!.rows.filter((x) => x.publication_id === p.id).length + 1}`, device_id: d.id, layer_order: i + 1,
          layer_function: fn, layer_material: ascii(l.raw), layer_thickness: num(l.nm), thickness_unit: 'nm',
          note: l.role === 'extra' ? `Исходное название: ${ascii(l.raw)}` : '',
        })
      })
    }

    const intensity = pick('power').match(/^(\d+(?:[.,]\d+)?)/)?.[1]?.replace(',', '.') ?? ''
    const spectrum = pick('spectrum').replace(/\s/g, '').replace(',', '.').toUpperCase().replace(/^AM1\.5$/, 'AM1.5G')
    const temp = pick('temp').replace(/\s/g, ' ')
    const scan = pick('scan').replace('мВ/с', 'mV/s')
    const stress = timeRows ? p.title.match(/\d+\s*°C/)?.[0]?.replace(/\s/g, ' ') ?? '' : ''
    const msOf = new Map<string, string>()
    const addMs = (rows: string[], devIds: string[], label?: string) => {
      const mid = `MS${T.measurements!.rows.filter((x) => x.publication_id === p.id).length + 1}`
      const fk = factsOf(p.id).find((f) => rows.includes(f.row))
      row(T.measurements!, {
        publication_id: p.id, measurement_id: mid, device_id: devIds.join(';'), measurement_type: timeRows ? 'stability' : 'J-V',
        spectrum, light_intensity: intensity, intensity_unit: intensity ? 'mW/cm2' : '', scan_direction: g(fk, 'scan_direction'), scan_rate: scan,
        mask_used: g(fk, 'mask_used'), certified: g(fk, 'certified'), temperature: timeRows ? '' : temp,
        stability_protocol: timeRows ? 'other' : '', stress_conditions: stress, note: label ? `Момент: ${label}` : '',
      })
      for (const r of rows) msOf.set(r, mid)
    }
    if (timeRows) for (const r of p.rows) addMs([r.id], ['DV1'], r.label)
    else addMs(p.rows.map((r) => r.id), devs.map((d) => d.id))
    if (!msOf.has('*')) msOf.set('*', [...msOf.values()][0] ?? '')

    const resOf = new Map<string, string>()
    const first = new Map<string, { id: string; v: number | null }>()
    const facts = factsOf(p.id).filter((f) => f.status !== 'rejected' && (!o.onlyAccepted || f.status === 'accepted') && METRIC[f.param])
    const order = (f: Fact) => (f.source.kind === 'table' ? 0 : f.source.kind === 'text' ? 1 : 2)
    facts.sort((a, b) => order(a) - order(b))
    let n = 0
    for (const f of facts) {
      const m = METRIC[f.param]!
      const prm = paramOf('solar', f.param)
      const rid = `R${String(++n).padStart(3, '0')}`
      resOf.set(f.id, rid)
      let v = g(f, 'normalized_unit') ? (g(f, 'normalized_value') as number | null) : valueOf(f)
      if (!g(f, 'normalized_unit') && v != null && f.param === 'ff' && prm.unit !== '%') v *= 100
      const nUnit = str(g(f, 'normalized_unit')) || m.unit
      const rawUnit = unitText(f.raw)
      const k = `${f.row}|${f.param}`
      const prev = first.get(k)
      const dup = prev && v != null && prev.v != null && Math.abs(prev.v - v) <= 1e-6 * Math.max(1, Math.abs(v)) ? prev.id : ''
      if (!prev) first.set(k, { id: rid, v })
      const t = timeRows ? p.rows.find((r) => r.id === f.row)?.label.match(TIME_ROW) : null
      const fig = f.source.kind === 'figure'
      row(T.results!, {
        publication_id: p.id, result_id: rid, device_id: f.row === '*' ? '' : devOf.get(f.row), measurement_id: msOf.get(f.row) ?? msOf.get('*'),
        material_id: (() => { const vr = variants.find((x) => x.id === f.row) ?? variants[0]; return (vr && matOf.get(vr.id)) || firstMat })(),
        metric_name: m.name, metric_value: num(v), metric_unit: v == null ? '' : nUnit, aggregation: g(f, 'aggregation'),
        spread_value: g(f, 'spread_value'), n_devices: g(f, 'n_devices'),
        time_point: t ? t[1]!.replace(',', '.') : '', time_unit: t ? 'h' : '',
        raw_value: str(g(f, 'raw_value')) || cellText(f.raw).replace(',', '.'), raw_unit: str(g(f, 'raw_unit')) || (RAW_UNIT[rawUnit] ?? (rawUnit || (f.param === 'ff' || f.param === 'pce' ? 'fraction' : ''))),
        normalized_value: num(v), normalized_unit: v == null ? '' : nUnit,
        result_origin: g(f, 'result_origin') ?? 'primary', cited_publication_id: g(f, 'cited_publication_id'),
        source_page: f.source.page, source_section: p.section, source_table: f.source.kind === 'table' ? `Table ${p.tableNo}` : '', source_figure: fig ? f.source.ref : '',
        source_fragment: fragmentOf(p, f), extraction_status: statusOf(f, v), duplicate_of: g(f, 'duplicate_of') ? `@${g(f, 'duplicate_of')}` : dup,
        note: [fig ? 'Значение снято с графика' : '', f.edited != null ? `Исправлено вручную, в статье: ${f.raw}` : ''].filter(Boolean).join('; '),
      })
    }

    for (const r of T.results!.rows) if (r.publication_id === p.id && r.duplicate_of.startsWith('@')) r.duplicate_of = resOf.get(r.duplicate_of.slice(1)) ?? ''

    const CHECK: Record<string, string> = { physics: 'jv_consistency', claims: 'contradiction', conditions: 'missing_conditions', units: 'unit_inconsistency' }
    let ni = 0
    for (const i of issuesFor(p)) {
      if (state.resolved[i.id] === 'ok') continue
      const fs = i.factIds.map((fid) => factsOf(p.id).find((x) => x.id === fid)).filter((x): x is Fact => !!x)
      const recs = i.factIds.map((fid) => resOf.get(fid)).filter((x): x is string => !!x)
      const main = fs[0]
      row(T.issues!, {
        publication_id: p.id, issue_id: `I${++ni}`, record_ids: recs.join(';'), check_name: CHECK[i.plugin] ?? i.plugin,
        description: `${i.title}. ${i.text}`.replace(/ /g, ' '), source_page: main?.source.page ?? p.page, source_fragment: main ? fragmentOf(p, main) : '',
      })
    }
  }
  return Object.values(T)
}

const METHOD: [RegExp, string][] = [[/bm25|sparse|разреж/i, 'sparse'], [/hybrid|гибрид/i, 'hybrid'], [/colbert|late/i, 'late-interaction'], [/dense|dpr|эмбед|e5|векторн/i, 'dense']]

function ragTables(o: SubmissionOptions): Table[] {
  const T = Object.fromEntries(['publications', 'datasets_tasks', 'experiments', 'rag_configs', 'metric_results', 'issues'].map((n) => [n, { name: n, cols: colsOf('rag', n), rows: [] as Row[] }])) as Record<string, Table>
  const row = (t: Table, v: Record<string, unknown>) => t.rows.push(Object.fromEntries(t.cols.map((c) => [c, str(v[c])])))
  const MET: Record<string, { name: string; k: string }> = { r5: { name: 'Recall', k: '5' }, r10: { name: 'Recall', k: '10' }, mrr: { name: 'MRR', k: '' } }

  for (const id of o.paperIds) {
    const p = paperOf(id)
    if (!p || p.collection !== 'rag' || p.processing < 100) continue
    const inScope = g(p, 'in_scope') !== false
    row(T.publications!, { publication_id: p.id, title: p.title, year: p.year, DOI: g(p, 'doi') ?? g(p, 'DOI'), authors: authorsOf(p.authors) })
    if (!inScope) continue
    const hasDs = !!(g(p, 'dataset_name') || g(p, 'task_type'))
    if (hasDs) row(T.datasets_tasks!, { publication_id: p.id, dataset_id: 'DS1', dataset_name: g(p, 'dataset_name'), task_id: 'T1', task_type: g(p, 'task_type'), language: g(p, 'language'), data_split: g(p, 'data_split') })
    row(T.experiments!, { publication_id: p.id, experiment_id: 'E1', dataset_id: hasDs ? 'DS1' : '', task_id: hasDs ? 'T1' : '', evaluation_protocol: g(p, 'evaluation_protocol'), baseline_name: g(p, 'baseline_name') })
    const all = factsOf(p.id).filter((f) => f.status !== 'rejected' && (!o.onlyAccepted || f.status === 'accepted'))
    const cfgOf = new Map<string, string>()
    p.rows.forEach((r, i) => {
      const cid = `C${i + 1}`
      cfgOf.set(r.id, cid)
      const get = (k: string) => all.find((f) => f.param === k && (f.row === r.id || f.row === '*'))
      const ch = get('chunk')
      const ret = get('retriever')
      const chRaw = ch ? cellText(ch.raw).replace(',', '.') : ''
      const chUnit = ch ? unitText(ch.raw) : ''
      row(T.rag_configs!, {
        publication_id: p.id, config_id: cid, rag_variant: r.label, retrieval_method: g(r, 'retrieval_method') ?? METHOD.find(([re]) => re.test(r.label))?.[1] ?? '',
        retriever_model: ret?.raw ?? '', chunk_size: /^\d+$/.test(chRaw) ? chRaw : '', chunk_unit: /^(ток\.|токенов|tokens)$/i.test(chUnit) ? 'tokens' : '',
      })
    })
    const resOf = new Map<string, string>()
    let n = 0
    for (const f of all.filter((x) => MET[x.param])) {
      const m = MET[f.param]!
      const prm = paramOf('rag', f.param)
      let v = g(f, 'normalized_unit') ? (g(f, 'normalized_value') as number | null) : valueOf(f)
      if (!g(f, 'normalized_unit') && v != null && prm.unit === '%') v /= 100
      const rid = `R${String(++n).padStart(3, '0')}`
      resOf.set(f.id, rid)
      const ru = unitText(f.raw)
      row(T.metric_results!, {
        publication_id: p.id, result_id: rid, experiment_id: 'E1', config_id: cfgOf.get(f.row) ?? '', dataset_id: hasDs ? 'DS1' : '', task_id: hasDs ? 'T1' : '',
        metric_group: 'retrieval', metric_name: m.name, metric_direction: 'higher_is_better', metric_k: m.k,
        metric_value: num(v), metric_unit: 'fraction', aggregation: g(f, 'aggregation'), sample_size: g(f, 'sample_size'),
        result_origin: g(f, 'result_origin') ?? 'primary', cited_publication_id: g(f, 'cited_publication_id'),
        source_page: f.source.page, source_section: p.section, source_table: f.source.kind === 'table' ? `Table ${p.tableNo}` : '', source_figure: f.source.kind === 'figure' ? f.source.ref : '',
        source_fragment: fragmentOf(p, f), raw_value: str(g(f, 'raw_value')) || cellText(f.raw).replace(',', '.'), raw_unit: str(g(f, 'raw_unit')) || (ru === '%' ? '%' : 'fraction'),
        normalized_value: num(v), normalized_unit: 'fraction', extraction_status: statusOf(f, v),
      })
    }
    const CHECK: Record<string, string> = { metrics: 'recall_k', claims: 'contradiction' }
    let ni = 0
    for (const i of issuesFor(p)) {
      if (state.resolved[i.id] === 'ok') continue
      const fs = i.factIds.map((fid) => factsOf(p.id).find((x) => x.id === fid)).filter((x): x is Fact => !!x)
      const main = fs[0]
      row(T.issues!, {
        publication_id: p.id, issue_id: `I${++ni}`, record_ids: i.factIds.map((fid) => resOf.get(fid)).filter(Boolean).join(';'), check_name: CHECK[i.plugin] ?? i.plugin,
        description: `${i.title}. ${i.text}`.replace(/ /g, ' '), source_page: main?.source.page ?? p.page, source_fragment: main ? fragmentOf(p, main) : '',
      })
    }
  }
  return Object.values(T)
}

export function buildTables(c: CollectionId, o: SubmissionOptions): Table[] {
  return c === 'rag' ? ragTables(o) : solarTables(o)
}

const q = (s: string) => (/[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
export const tableCSV = (t: Table) => '﻿' + [t.cols, ...t.rows.map((r) => t.cols.map((c) => r[c] ?? ''))].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'

export function linkedJSON(c: CollectionId, tables: Table[]) {
  const d = PASSPORT[c]
  const typed = (t: Table) => {
    const ent = d.entities.find((e) => e.id === t.name)!
    return t.rows.map((r) =>
      Object.fromEntries(
        t.cols.map((col) => {
          const v = r[col] ?? ''
          if (v === '') return [col, null]
          const ty = ent.fields.find((x) => x.name === col)?.type
          if (ty === 'int' || ty === 'number') return [col, Number.isFinite(Number(v)) ? Number(v) : v]
          if (ty === 'bool') return [col, v === 'true']
          if (ty === 'list') return [col, v.split(';')]
          return [col, v]
        }),
      ),
    )
  }
  const out: Record<string, unknown> = { meta: { collection: c, generated_by: 'Фактура AI', tables: Object.fromEntries(tables.map((t) => [t.name, t.rows.length])) } }
  for (const t of tables) out[t.name] = typed(t)
  const res = tables.find((t) => t.name === (c === 'rag' ? 'metric_results' : 'results'))
  if (res) {
    const keys = ['publication_id', 'result_id', 'result_origin', 'cited_publication_id', 'source_page', 'source_section', 'source_table', 'source_figure', 'source_fragment', 'raw_value', 'raw_unit', 'normalized_value', 'normalized_unit', 'extraction_status', 'duplicate_of']
    out.provenance = res.rows.map((r) => Object.fromEntries(keys.filter((k) => k in r || k === 'duplicate_of').map((k) => [k, r[k] === '' || r[k] == null ? null : /^(source_page|normalized_value)$/.test(k) ? Number(r[k]) : r[k]])))
  }
  return out
}
