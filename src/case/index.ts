import { reactive, readonly, ref, watch } from 'vue'
import GOLD from './goldTables'
import { ragIssue, ragIssuesOf, ragRefreshEdits, ragRescope, ragResult, setRagScope } from './ragData'
import type { DeviceRow, Domain, IssueRow, LayerRow, MaterialRow, MeasurementRow, PublicationRow, ResultRow, Review } from './types'
import { METRICS } from './types'
import { isReady, isRemoteScope, paperOf, pdfApiUrl, refreshPaper, setEditsHook, type ApiPaper, type ResultMeta } from '../api/papers'
import type { ServerIssueState, ServerReview } from '../api/edits'
import { toast } from '../store'
import { isApi } from '../config'
import { dropFixes } from '../api/fixes'

export * from './types'
export * from './ragData'

const by = <T, K extends string>(rows: T[], key: (r: T) => K) => {
  const m = new Map<K, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k)
    if (list) list.push(r)
    else m.set(k, [r])
  }
  return m
}
const RES = by(GOLD.results, (r) => r.publication_id)
const DEV = by(GOLD.devices, (r) => r.publication_id)
const LAY = by(GOLD.layers, (r) => r.publication_id)
const MEA = by(GOLD.measurements, (r) => r.publication_id)
const MAT = by(GOLD.materials, (r) => r.publication_id)
const ISS = by(GOLD.issues, (r) => r.publication_id)
const PUB = new Map(GOLD.publications.map((p) => [p.publication_id, p]))

const remote = () => isRemoteScope(scopeRef.value)
const ap = (pid: string): ApiPaper | undefined => paperOf(scopeRef.value, pid)
export const publications = (): PublicationRow[] => GOLD.publications
export const publication = (pid: string): PublicationRow | undefined => (remote() ? ap(pid)?.publication : PUB.get(pid))
export const hasData = (pid: string) => (remote() ? !!ap(pid)?.publication : PUB.has(pid))
export const inScope = (pid: string) => publication(pid)?.in_scope !== 'false'
export const resultMeta = (pid: string, rid: string): ResultMeta | undefined => (remote() ? ap(pid)?.meta?.results?.[rid] : undefined)

export const resultsOf = (pid: string): ResultRow[] => (remote() ? ap(pid)?.results : RES.get(pid)) ?? []
export const result = (pid: string, rid: string) => resultsOf(pid).find((r) => r.result_id === rid)
export const devicesOf = (pid: string): DeviceRow[] => (remote() ? ap(pid)?.devices : DEV.get(pid)) ?? []
export const device = (pid: string, id: string) => devicesOf(pid).find((d) => d.device_id === id)
export const layersOf = (pid: string, deviceId?: string): LayerRow[] =>
  [...((remote() ? ap(pid)?.layers : LAY.get(pid)) ?? [])].filter((l) => !deviceId || l.device_id === deviceId).sort((a, b) => +a.layer_order - +b.layer_order)
export const measurementsOf = (pid: string): MeasurementRow[] => (remote() ? ap(pid)?.measurements : MEA.get(pid)) ?? []
export const measurementsOfDevice = (pid: string, deviceId: string) =>
  measurementsOf(pid).filter((m) => m.device_id.split(';').map((s) => s.trim()).includes(deviceId))
export const measurement = (pid: string, id: string) => measurementsOf(pid).find((m) => m.measurement_id === id)
export const materialsOf = (pid: string): MaterialRow[] => (remote() ? ap(pid)?.materials : MAT.get(pid)) ?? []
export const material = (pid: string, id: string) => materialsOf(pid).find((m) => m.material_id === id)
export const issuesOf = (pid: string): IssueRow[] => (remote() ? ap(pid)?.issues : ISS.get(pid)) ?? []
export const issue = (pid: string, id: string) => issuesOf(pid).find((i) => i.issue_id === id)
export const issuesForResult = (pid: string, rid: string) =>
  issuesOf(pid).filter((i) => i.record_ids.split(';').map((s) => s.trim()).includes(rid))
export const recordIds = (i: IssueRow) => i.record_ids.split(';').map((s) => s.trim()).filter(Boolean)

export const allResults = (): ResultRow[] => GOLD.results
export const allIssues = (): IssueRow[] => GOLD.issues
export const isScored = (r: ResultRow) => (METRICS as readonly string[]).includes(r.metric_name)

const BLOBS = new Map<string, string>()
export function registerPdf(pid: string, file: Blob, domain: Domain = 'solar') {
  const k = domain === 'rag' ? 'rag:' + pid : pid
  const old = BLOBS.get(k)
  if (old) URL.revokeObjectURL(old)
  BLOBS.set(k, URL.createObjectURL(file))
}
export const pdfUrl = (pid: string, domain: Domain = 'solar') =>
  (remote() ? pdfApiUrl(pid, domain, scopeRef.value) : undefined) ?? BLOBS.get(domain === 'rag' ? 'rag:' + pid : pid) ?? (isApi ? '' : undefined) ?? `/corpus/${domain === 'rag' ? 'rag/' : ''}${pid.startsWith('P') ? 'test' : 'dev'}/${pid}.pdf`

const SKEY = 'gs:case:scope'
const scopeRef = ref('')
try { scopeRef.value = localStorage.getItem(SKEY) ?? '' } catch { }
export const reviewScope = readonly(scopeRef)
setRagScope(() => (isRemoteScope(scopeRef.value) ? scopeRef.value : ''))
watch(() => (isRemoteScope(scopeRef.value) ? scopeRef.value : ''), (s) => { if (s) ragRescope((pid) => isReady(s, pid)) })
export function setReviewScope(id: string) {
  if (scopeRef.value === id) return
  scopeRef.value = id
  try { localStorage.setItem(SKEY, id) } catch { }
}

const RKEY = 'gs:case:reviews:v2'
const reviews = reactive<Record<string, Record<string, Review>>>({})
try { Object.assign(reviews, JSON.parse(localStorage.getItem(RKEY) ?? '{}')) } catch { }
watch(reviews, (v) => { try { localStorage.setItem(RKEY, JSON.stringify(v)) } catch { } }, { deep: true })

function rootOf(pid: string, rid: string, domain: Domain = 'solar'): string {
  const find = domain === 'rag' ? ragResult : result
  let id = rid
  for (let i = 0; i < 8; i++) {
    const up = find(pid, id)?.duplicate_of
    if (!up || up === id || !find(pid, up)) break
    id = up
  }
  return id
}
export const paperKey = (pid: string, domain: Domain = 'solar') => (domain === 'rag' ? 'rag:' + pid : pid)
const rkey = (pid: string, rid: string, domain: Domain = 'solar') => paperKey(pid, domain) + ':' + rootOf(pid, rid, domain)
const bucket = () => (reviews[scopeRef.value] ??= {})
export const reviewIn = (scope: string, pid: string, rid: string, domain: Domain = 'solar'): Review => reviews[scope]?.[rkey(pid, rid, domain)] ?? { status: 'new' }
export const reviewOf = (pid: string, rid: string, domain: Domain = 'solar'): Review => reviewIn(scopeRef.value, pid, rid, domain)
export function setReview(pid: string, rid: string, patch: Partial<Review>, domain: Domain = 'solar') {
  const prev = reviewOf(pid, rid, domain)
  const next = { ...prev, ...patch, at: Date.now() }
  if (next.status === 'new' && next.corrected == null) resetReview(pid, rid, domain)
  else {
    bucket()[rkey(pid, rid, domain)] = next
    queueReview(pid, rid, domain, prev)
  }
  return prev
}
export function resetReview(pid: string, rid: string, domain: Domain = 'solar') {
  const prev = reviewOf(pid, rid, domain)
  const b = reviews[scopeRef.value]
  if (b) delete b[rkey(pid, rid, domain)]
  if (prev.status !== 'new' || prev.corrected != null) queueReview(pid, rid, domain, prev)
}

type Pending = { scope: string; domain: Domain; pid: string; root: string; prev: Review }
const pendingReviews = new Map<string, Pending>()
let flushQueued = false
function queueReview(pid: string, rid: string, domain: Domain, prev: Review) {
  const scope = scopeRef.value
  if (!isRemoteScope(scope)) return
  const root = rootOf(pid, rid, domain)
  const k = scope + '|' + paperKey(pid, domain) + ':' + root
  if (!pendingReviews.has(k)) pendingReviews.set(k, { scope, domain, pid, root, prev })
  if (!flushQueued) { flushQueued = true; queueMicrotask(flushReviews) }
}
function restoreReview(x: Pending) {
  const k = paperKey(x.pid, x.domain) + ':' + x.root
  const b = (reviews[x.scope] ??= {})
  if (x.prev.status === 'new' && x.prev.corrected == null) delete b[k]
  else b[k] = x.prev
}
export const refreshEdits = (scope: string, domain: Domain, pid: string) => afterEdit(scope, domain, pid)
function afterEdit(scope: string, domain: Domain, pid: string) {
  dropFixes(scope, pid)
  if (domain === 'rag') ragRefreshEdits(pid, scope)
  else refreshPaper(scope, pid)
  void import('../api/runs').then((m) => m.dropSummary(scope))
}
async function flushReviews() {
  flushQueued = false
  const items = [...pendingReviews.values()]
  pendingReviews.clear()
  const api = await import('../api/edits')
  const byScope = new Map<string, Pending[]>()
  for (const x of items) byScope.set(x.scope, [...(byScope.get(x.scope) ?? []), x])
  for (const [scope, list] of byScope) {
    const cur = (x: Pending) => reviews[scope]?.[paperKey(x.pid, x.domain) + ':' + x.root] ?? ({ status: 'new' } as Review)
    const plain = list.filter((x) => cur(x).corrected == null && x.prev.corrected == null)
    const single = plain.length > 1 ? list.filter((x) => !plain.includes(x)) : list
    const jobs: Promise<unknown>[] = []
    if (plain.length > 1) {
      jobs.push(api.sendReviewBatch(scope, plain.map((x) => ({ domain: x.domain, pid: x.pid, rid: x.root, status: cur(x).status })))
        .catch((e) => { plain.forEach(restoreReview); toast(api.errText(e, 'Не удалось сохранить правки')) }))
    }
    for (const x of single) {
      const rv = cur(x)
      jobs.push(api.sendReview(scope, x.domain, x.pid, x.root, rv.status, rv.corrected ?? null)
        .catch((e) => { restoreReview(x); toast(api.errText(e, 'Не удалось сохранить правку')) }))
    }
    await Promise.all(jobs)
    for (const key of new Set(list.map((x) => x.domain + '|' + x.pid))) {
      const [d, pid] = key.split('|') as [Domain, string]
      afterEdit(scope, d, pid)
    }
  }
}

setEditsHook((scope, domain, pid, rv?: Record<string, ServerReview>, st?: Record<string, ServerIssueState>) => {
  const pre = paperKey(pid, domain) + ':'
  const b = (reviews[scope] ??= {})
  for (const k of Object.keys(b)) if (k.startsWith(pre)) delete b[k]
  for (const [rid, v] of Object.entries(rv ?? {})) {
    const c = v.corrected_value == null || v.corrected_value === '' ? undefined : Number(v.corrected_value)
    if (v.status === 'new' && c == null) continue
    b[pre + rid] = { status: v.status, ...(Number.isFinite(c) ? { corrected: c } : {}), at: Date.parse(v.at ?? '') || Date.now() }
  }
  const m = (issueMarks[scope] ??= {})
  for (const k of Object.keys(m)) if (k.startsWith(pre)) delete m[k]
  for (const [iid, v] of Object.entries(st ?? {})) {
    if (v.auto || v.state === 'open') continue
    m[pre + iid] = { state: v.state, at: Date.now() }
  }
})
export function reviewCountIn(scope: string, prefixes: string[], status: Review['status']): number {
  let n = 0
  for (const [k, v] of Object.entries(reviews[scope] ?? {})) if (v.status === status && prefixes.some((p) => k.startsWith(p))) n++
  return n
}
export function reviewInherited(pid: string, rid: string, domain: Domain = 'solar'): boolean {
  if (rootOf(pid, rid, domain) === rid) return false
  const rv = reviewOf(pid, rid, domain)
  return rv.status !== 'new' || rv.corrected != null
}
export const INHERITED_TEXT = 'как у основного значения'
export function correctedText(r: ResultRow): string {
  const rv = reviewOf(r.publication_id, r.result_id)
  const v = rv.corrected ?? parseFloat(r.normalized_value)
  if (!Number.isFinite(v)) return ''
  return (rv.corrected != null && rv.digits != null ? v.toFixed(Math.min(8, rv.digits)) : String(v)).replace('.', ',')
}
export function valueOf(r: ResultRow): number | null {
  const c = reviewOf(r.publication_id, r.result_id).corrected
  if (c != null) return c
  const v = parseFloat(r.normalized_value)
  return Number.isFinite(v) ? v : null
}

export const METRIC_RU: Record<string, string> = {
  PCE: 'КПД', Voc: 'Voc', Jsc: 'Jsc', FF: 'FF', Rs: 'Rs', Rsh: 'Rsh', HI: 'Индекс гистерезиса',
  Jsc_EQE: 'Jsc по EQE', stabilized_PCE: 'Стабилизированный КПД', T80: 'Время до 80 % КПД', retained_PCE: 'Сохранённый КПД',
}
export const metricLabel = (m: string) => METRIC_RU[m] ?? m.replace(/_/g, ' ')

const UNIT_RU: Record<string, string> = {
  '%': '%', V: 'В', mV: 'мВ', 'mA/cm2': 'мА/см²', 'A/m2': 'А/м²', 'Ohm*cm2': 'Ом·см²', 'Ohm cm2': 'Ом·см²',
  h: 'ч', min: 'мин', eV: 'эВ', nm: 'нм', um: 'мкм', 'μm': 'мкм', cm2: 'см²', 'mW/cm2': 'мВт/см²', fraction: 'доля',
}
export const unitRu = (u: string) => UNIT_RU[u] ?? u

export function num(v: number | string | null | undefined, digits = 3): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n == null || !Number.isFinite(n)) return '—'
  return String(+n.toFixed(digits)).replace('.', ',').replace('-', '−')
}
export const fmtValue = (r: ResultRow) => {
  const v = valueOf(r)
  const rv = reviewOf(r.publication_id, r.result_id)
  const txt = v == null ? '—' : rv.corrected != null && rv.digits != null ? v.toFixed(Math.min(8, rv.digits)).replace('.', ',').replace('-', '−') : num(v)
  return v == null ? '—' : `${txt}${r.normalized_unit ? ' ' + unitRu(r.normalized_unit) : ''}`
}
export const fmtRaw = (r: ResultRow) =>
  r.raw_value ? `${r.raw_value.replace('.', ',')}${r.raw_unit && r.raw_unit !== 'fraction' ? ' ' + unitRu(r.raw_unit) : r.raw_unit === 'fraction' ? ' (доля)' : ''}` : '—'

export const DIRECTION_RU: Record<string, string> = {
  higher_is_better: 'чем больше, тем лучше', lower_is_better: 'чем меньше, тем лучше', target: 'целевое', '': 'направление не указано',
}
export const AGG_RU: Record<string, string> = { champion: 'лучший прибор', mean: 'среднее', median: 'медиана' }
export const ORIGIN_RU: Record<string, string> = { primary: 'эта статья', cited: 'из цитаты' }
export const STATUS_RU: Record<string, string> = { extracted: 'найдено автоматически', present_not_extractable: 'есть в статье, но не извлечь', absent: 'нет в статье' }
export const ROLE_RU: Record<string, string> = { control: 'контрольный', target: 'целевой', record: 'рекордный' }
export const TYPE_RU: Record<string, string> = { cell: 'элемент (ячейка)', minimodule: 'мини-модуль', module: 'модуль' }
export const SCAN_RU: Record<string, string> = { reverse: 'обратное', forward: 'прямое', average: 'среднее по двум направлениям' }
export const CLASS_RU: Record<string, string> = {
  perovskite: 'перовскит', CIGS: 'CIGS', CdTe: 'CdTe', kesterite: 'кестерит', Sb2Se3: 'Sb₂Se₃', 'thin-film Si': 'тонкоплёночный Si', other: 'другое',
}
export const LAYER_RU: Record<string, string> = {
  front_contact: 'Передний электрод', ETL: 'Слой переноса электронов (ETL)', absorber: 'Поглотитель', passivation: 'Пассивация',
  HTL: 'Слой переноса дырок (HTL)', interlayer: 'Промежуточный слой', recombination: 'Рекомбинационный слой', back_contact: 'Задний электрод',
}
export const CHECK_RU: Record<string, string> = {
  jv_consistency: 'КПД не сходится с Voc·Jsc·FF',
  voc_limit: 'Voc выше ширины зоны',
  range: 'Значение вне допустимого диапазона',
  eqe_consistency: 'Jsc по EQE расходится с ВАХ',
  champion_vs_mean: 'Лучший прибор хуже среднего',
  hysteresis_index: 'Гистерезис прямого и обратного направления',
  contradiction: 'Противоречие в статье',
  ambiguity: 'Неясно из текста',
  unit_inconsistency: 'Ошибка в единицах',
  missing_conditions: 'Не указаны условия измерения',
  measurement_conditions: 'Условия измерения',
  comparability: 'Нестандартные условия измерения',
  derived_values: 'Пересчитанные значения',
  typo: 'Опечатка',
  figure_mismatch: 'Рисунок расходится с текстом',
  figure_only: 'Значение только на рисунке',
  cited_in_table: 'Цитируемое значение в таблице',
  dedup_trap: 'Повтор значения',
  possible_swap: 'Значения перепутаны',
  rounding: 'Округление',
  rounding_inconsistency: 'Несогласованное округление',
  plausibility: 'Подозрительное значение',
  text_mix: 'Смешанный текст',
  voc_deficit_consistency: 'Дефицит Voc не сходится',
}
export const checkLabel = (c: string) => CHECK_RU[c] ?? c.replace(/_/g, ' ')

export function placeOf(r: { source_page: string; source_table?: string; source_figure?: string; source_section?: string }) {
  return [r.source_page && 'стр. ' + r.source_page, r.source_table && ruPlace(r.source_table), r.source_figure && ruPlace(r.source_figure)].filter(Boolean).join(' · ')
}

const LOWER_BETTER = new Set(['Rs', 'HI'])
export const lowerIsBetter = (metric: string) => LOWER_BETTER.has(metric)
export const isBetter = (metric: string, a: number, b: number) => (lowerIsBetter(metric) ? a < b : a > b)

export interface BestOpts {
  device?: string
  origin?: 'primary' | 'cited' | 'any'
  withRejected?: boolean
}
export const isRejected = (r: ResultRow) => reviewOf(r.publication_id, r.result_id).status === 'rejected'
export function usableResults(pid: string, opts: BestOpts = {}): ResultRow[] {
  const origin = opts.origin ?? 'primary'
  return resultsOf(pid).filter((r) =>
    isScored(r) &&
    r.extraction_status === 'extracted' &&
    !r.duplicate_of &&
    (origin === 'any' || r.result_origin === origin) &&
    (!opts.device || r.device_id === opts.device) &&
    (opts.withRejected || !isRejected(r)) &&
    valueOf(r) != null,
  )
}
export function bestAmong(rows: ResultRow[], metric: string): ResultRow | undefined {
  const own = rows.filter((r) => r.metric_name === metric && valueOf(r) != null)
  const champ = own.filter((r) => r.aggregation === 'champion')
  let best: ResultRow | undefined
  for (const r of champ.length ? champ : own) if (!best || isBetter(metric, valueOf(r)!, valueOf(best)!)) best = r
  return best
}
export function bestOf(pid: string, metric: string, opts: BestOpts = {}): ResultRow | undefined {
  return bestAmong(usableResults(pid, opts), metric)
}
export interface BestRow {
  pid: string
  device?: DeviceRow
  deviceName: string
  pce?: ResultRow
  cells: Record<string, ResultRow | undefined>
}
export function bestRowOf(pid: string, metrics: readonly string[]): BestRow {
  const pce = bestOf(pid, 'PCE')
  const dev = pce?.device_id ? device(pid, pce.device_id) : undefined
  const cells: Record<string, ResultRow | undefined> = {}
  for (const m of metrics) {
    if (m === 'PCE') { cells[m] = pce; continue }
    if (!pce) { cells[m] = bestOf(pid, m); continue }
    const list = usableResults(pid, { device: pce.device_id }).filter((r) => r.metric_name === m)
    const score = (r: ResultRow) => (r.measurement_id === pce.measurement_id ? 2 : 0) + (r.aggregation === pce.aggregation ? 1 : 0)
    const top = Math.max(-1, ...list.map(score))
    cells[m] = bestAmong(list.filter((r) => score(r) === top), m)
  }
  return { pid, device: dev, deviceName: dev ? deviceName(pid, dev.device_id) : '', pce, cells }
}
export function bestIndex(values: (number | null | undefined)[], metric: string): number {
  const have = values.filter((v): v is number => v != null)
  if (have.length < 2 || new Set(have).size < 2) return -1
  let bi = -1
  values.forEach((v, i) => { if (v != null && (bi < 0 || isBetter(metric, v, values[bi]!))) bi = i })
  return bi
}

export interface ReviewMark {
  kind: 'fixed' | 'rejected' | 'accepted'; text: string; tip: string
  inherited?: boolean
}
export function reviewMark(pid: string, rid: string, domain: Domain = 'solar'): ReviewMark | null {
  const rv = reviewOf(pid, rid, domain)
  const rag = domain === 'rag'
  const r = rag ? undefined : result(pid, rid)
  const inherited = reviewInherited(pid, rid, domain)
  const main = inherited ? (rag ? ragResult : result)(pid, rootOf(pid, rid, domain)) : undefined
  const from = inherited ? ` Как у основного значения${main?.source_page ? ` на стр. ${main.source_page}` : ''}` : ''
  let m: ReviewMark | null = null
  if (rv.status === 'rejected') m = { kind: 'rejected', text: 'отклонено вами', tip: 'Отклонено вами: не попадёт в выгрузку и сравнение.' + from }
  else if (rv.corrected != null) m = { kind: 'fixed', text: 'исправлено вами', tip: (r ? `Исправлено вами. В статье: ${fmtRaw(r)}.` : 'Исправлено вами.') + from }
  else if (rv.status === 'accepted') m = { kind: 'accepted', text: 'принято вами', tip: 'Проверено и принято вами.' + from }
  if (m && inherited) m.inherited = true
  return m
}
export function valueClass(r: ResultRow): string[] {
  const m = reviewMark(r.publication_id, r.result_id)
  return ['val', m?.kind === 'fixed' ? 'val--fixed' : m?.kind === 'rejected' ? 'val--rejected' : '']
}
export const markClass = (m: ReviewMark) => (m.kind === 'fixed' ? 'mark--fixed' : m.kind === 'accepted' ? 'mark--ok' : 'mark--off')

export function deviceName(pid: string, deviceId: string): string {
  const d = device(pid, deviceId)
  const label = d?.device_label?.trim()
  if (label) return /^pristine$/i.test(label) ? 'без добавки (pristine)' : label
  const n = deviceId.replace(/^\D+/, '')
  return n ? `Прибор ${n}` : deviceId
}
export const resultName = (r: ResultRow) => `${metricLabel(r.metric_name)} ${fmtValue(r)}`
export const resultText = (r: ResultRow) => resultName(r) + (r.device_id ? ' · ' + deviceName(r.publication_id, r.device_id) : '')
export const paperPath = (pid: string, domain: Domain = 'solar') => (domain === 'rag' ? '/paper/rag/' : '/paper/') + encodeURIComponent(pid)
export function parsePaperPath(path: string): { domain: Domain; pid: string } | null {
  const m = /^\/paper\/(?:(solar|rag)\/)?([^/]+)\/?$/.exec(path)
  return m ? { domain: (m[1] as Domain | undefined) ?? 'solar', pid: decodeURIComponent(m[2]!) } : null
}
export const resultLink = (pid: string, rid: string, domain: Domain = 'solar') => ({ path: paperPath(pid, domain), query: { r: rid } })
export function dupLabel(r: ResultRow): string {
  if (!r.duplicate_of) return ''
  const o = result(r.publication_id, r.duplicate_of)
  return o?.source_page ? `то же число на стр. ${o.source_page}` : 'повтор значения'
}

export interface IssueRecord {
  rid: string
  row?: ResultRow
  name: string
  text: string
  device: string
  page: string
  rejected: boolean
  mark: ReviewMark | null
  to: ReturnType<typeof resultLink>
}
export function issueRecords(pid: string, iid: string): IssueRecord[] {
  const i = issue(pid, iid)
  if (!i) return []
  return recordIds(i).map((rid) => {
    const row = result(pid, rid)
    return {
      rid, row,
      name: row ? resultName(row) : 'значение',
      text: row ? resultText(row) : 'значение',
      device: row?.device_id ? deviceName(pid, row.device_id) : '',
      page: row?.source_page ?? '',
      rejected: row ? isRejected(row) : false,
      mark: row ? reviewMark(pid, rid) : null,
      to: resultLink(pid, rid),
    }
  })
}
export function issueTodo(i: IssueRow): string {
  const n = recordIds(i).length
  const where = i.source_page ? ` на стр. ${i.source_page}` : ''
  if (!n) return `Проверьте место${where} в PDF. Если всё верно, нажмите «Это не ошибка».`
  return `Проверьте ${n > 1 ? 'значения' : 'значение'}${where} и исправьте при необходимости. Если всё верно, нажмите «Это не ошибка».`
}

export type IssueState = 'open' | 'fixed' | 'ok'
export const ISSUE_STATE_RU: Record<IssueState, string> = { open: 'Нужно проверить', fixed: 'Исправлено', ok: 'Не ошибка' }
const IKEY = 'gs:case:issues:v2'
type IssueMark = { state: Exclude<IssueState, 'open'>; at: number }
const issueMarks = reactive<Record<string, Record<string, IssueMark>>>({})
try { Object.assign(issueMarks, JSON.parse(localStorage.getItem(IKEY) ?? '{}')) } catch { }
watch(issueMarks, (v) => { try { localStorage.setItem(IKEY, JSON.stringify(v)) } catch { } }, { deep: true })
const marksOf = () => (issueMarks[scopeRef.value] ??= {})

export function issueState(pid: string, iid: string, domain: Domain = 'solar'): IssueState {
  return issueStateIn(scopeRef.value, pid, iid, domain)
}
export function issueStateIn(scope: string, pid: string, iid: string, domain: Domain = 'solar'): IssueState {
  const m = issueMarks[scope]?.[paperKey(pid, domain) + ':' + iid]
  if (m) return m.state
  const i = domain === 'rag' ? ragIssue(pid, iid) : issue(pid, iid)
  const ids = i ? recordIds(i) : []
  if (ids.length && ids.every((rid) => { const rv = reviewIn(scope, pid, rid, domain); return rv.status === 'rejected' || rv.corrected != null })) return 'fixed'
  return 'open'
}
export const isIssueOpen = (pid: string, iid: string, domain: Domain = 'solar') => issueState(pid, iid, domain) === 'open'
export function resolveIssue(pid: string, iid: string, how: 'fixed' | 'ok', domain: Domain = 'solar'): IssueState {
  const prev = issueState(pid, iid, domain)
  const k = paperKey(pid, domain) + ':' + iid
  const was = marksOf()[k]
  marksOf()[k] = { state: how, at: Date.now() }
  syncIssue(pid, iid, domain, how, was)
  return prev
}
export function reopenIssue(pid: string, iid: string, domain: Domain = 'solar') {
  const k = paperKey(pid, domain) + ':' + iid
  const b = issueMarks[scopeRef.value]
  const was = b?.[k]
  if (b) delete b[k]
  syncIssue(pid, iid, domain, 'open', was)
}
function syncIssue(pid: string, iid: string, domain: Domain, state: IssueState, was: IssueMark | undefined) {
  const scope = scopeRef.value
  if (!isRemoteScope(scope)) return
  const k = paperKey(pid, domain) + ':' + iid
  void import('../api/edits').then((api) => api.sendIssueState(scope, domain, pid, iid, state)
    .then(() => afterEdit(scope, domain, pid))
    .catch((e) => {
      const b = (issueMarks[scope] ??= {})
      if (was) b[k] = was
      else delete b[k]
      toast(api.errText(e, 'Не удалось сохранить отметку замечания'))
    }))
}
export const openIssuesOf = (pid: string, domain: Domain = 'solar') =>
  (domain === 'rag' ? ragIssuesOf(pid) : issuesOf(pid)).filter((i) => isIssueOpen(pid, i.issue_id, domain))

export const TABLE_RU: Record<string, string> = {
  publications: 'Статьи', materials: 'Материалы', devices: 'Приборы', layers: 'Слои',
  measurements: 'Измерения', results: 'Результаты', issues: 'Замечания',
  configurations: 'Конфигурации', datasets: 'Датасеты', tasks: 'Задачи', experiments: 'Эксперименты',
}
export const FIELD_RU: Record<string, string> = {
  publication_id: 'Статья', title: 'Название', year: 'Год', DOI: 'DOI', authors: 'Авторы', in_scope: 'По теме', exclusion_reason: 'Почему не по теме',
  material_id: 'Материал', material_name_raw: 'Материал, как в статье', formula_normalized: 'Формула', material_class: 'Класс материала',
  dimensionality: 'Размерность', additives: 'Добавки', bandgap_value: 'Ширина запрещённой зоны', bandgap_unit: 'Единица ширины зоны', bandgap_method: 'Как определена ширина зоны', note: 'Примечание',
  device_id: 'Прибор', absorber_material_id: 'Материал поглотителя', device_label: 'Название прибора', device_role: 'Роль прибора', device_type: 'Тип прибора',
  architecture: 'Структура', substrate_type: 'Подложка', active_area: 'Активная площадь', area_unit: 'Единица площади', area_definition: 'Как задана площадь', encapsulation: 'Герметизация',
  layer_id: 'Слой', layer_order: 'Порядок слоя', layer_function: 'Назначение слоя', layer_material: 'Материал слоя', layer_thickness: 'Толщина', thickness_unit: 'Единица толщины',
  deposition_method: 'Способ нанесения', annealing_temperature: 'Температура отжига', annealing_time: 'Время отжига', atmosphere: 'Атмосфера',
  measurement_id: 'Измерение', measurement_type: 'Вид измерения', spectrum: 'Спектр', light_intensity: 'Интенсивность света', intensity_unit: 'Единица интенсивности',
  scan_direction: 'Направление измерения ВАХ', scan_rate: 'Скорость развёртки', mask_used: 'Маска', certified: 'Сертифицировано', certification_lab: 'Лаборатория сертификации',
  temperature: 'Температура', stability_protocol: 'Протокол стабильности', stress_conditions: 'Условия старения',
  result_id: 'ID значения', metric_name: 'Показатель', metric_value: 'Значение в статье', metric_unit: 'Единица в статье', aggregation: 'Тип значения',
  spread_value: 'Разброс', n_devices: 'Число приборов', time_point: 'Момент времени', time_unit: 'Единица времени',
  raw_value: 'Как в статье', raw_unit: 'Единица, как в статье', normalized_value: 'Приведённое значение', normalized_unit: 'Приведённая единица',
  result_origin: 'Источник', cited_publication_id: 'Ссылка на цитируемую статью', source_page: 'Страница', source_section: 'Раздел', source_table: 'Таблица',
  source_figure: 'Рисунок', source_fragment: 'Фрагмент текста', extraction_status: 'Статус', duplicate_of: 'Повтор значения',
  issue_id: 'Замечание', record_ids: 'Значения', check_name: 'Проверка', description: 'Описание',
  config_id: 'Конфигурация', rag_variant: 'Вариант RAG', retrieval_method: 'Способ поиска', retriever_model: 'Ретривер', embedding_model: 'Модель эмбеддингов',
  embedding_version: 'Версия эмбеддингов', chunking_method: 'Как режут на фрагменты', chunk_size: 'Размер фрагмента', chunk_overlap: 'Перекрытие фрагментов',
  chunk_unit: 'Единица фрагмента', index_type: 'Тип индекса', vector_store: 'Векторная база',
  top_k: 'Сколько документов извлекается', reranker_model: 'Реранкер', generator_model: 'Генератор', generator_version: 'Версия генератора',
  prompt_strategy: 'Промпт', context_strategy: 'Как подаётся контекст',
  dataset_id: 'Датасет', dataset_name: 'Название датасета', dataset_version: 'Версия датасета', language: 'Язык', data_split: 'Часть данных',
  scientific_domain: 'Научная область', task_id: 'Задача', task_type: 'Тип задачи',
  experiment_id: 'Эксперимент', evaluation_protocol: 'Протокол оценки', baseline_name: 'С чем сравнивают (baseline)', hardware: 'Железо',
  latency_ms: 'Задержка, мс', tokens_per_query: 'Токенов на запрос', sample_size: 'Размер выборки',
  metric_group: 'Группа метрик', metric_variant: 'Вариант метрики', metric_direction: 'Что лучше', metric_k: 'k метрики', baseline_value: 'Значение baseline',
}
export const FIELD_HINT_RU: Record<string, string> = {
  top_k: 'Сколько документов система достаёт из базы перед ответом. Это настройка конфигурации.',
  metric_k: 'k в самой метрике, например Recall@5 или nDCG@10: сколько первых результатов учитывается при подсчёте. Это не top_k конфигурации.',
}
export const labelOfField = (column: string) => FIELD_RU[column] ?? column.replace(/_/g, ' ')
export const labelOfTable = (table: string) => TABLE_RU[table] ?? table

const TERM_RU: Record<string, string> = {
  dev: 'учебный набор', 'эталон': 'ручная разметка', in_scope: 'по теме', 'в области': 'по теме', 'вне области': 'не по теме',
  pristine: 'без добавки (pristine)', control: 'контрольный', ETL: 'слой переноса электронов (ETL)', HTL: 'слой переноса дырок (HTL)',
  'n-i-p': 'структура n-i-p', 'p-i-n': 'структура p-i-n', cell: 'элемент (ячейка)', RAG: 'Поиск по статьям',
  null: 'пусто', true: 'да', false: 'нет', 'пустое — null': 'пустые поля помечены как null',
  'Обяз.': 'Обязательное', 'Нормализация': 'Приведение единиц', 'JSON со связями': 'Один файл JSON (для программ)',
  champion: 'лучший прибор', mean: 'среднее', median: 'медиана', primary: 'эта статья', cited: 'из цитаты',
  extracted: 'найдено автоматически', present_not_extractable: 'есть в статье, но не извлечь', absent: 'нет в статье',
}
export function ruTerm(term: string): string {
  const t = term.trim()
  if (!t) return t
  return METRIC_RU[t] ?? FIELD_RU[t] ?? TERM_RU[t] ?? CHECK_RU[t] ?? ruPlace(t)
}
export function ruPlace(s: string): string {
  return s
    .replace(/\bsupplementary\s+/gi, 'доп. ')
    .replace(/\btable\s*/gi, 'табл. ')
    .replace(/\b(?:figure|fig\.?)\s*/gi, 'рис. ')
    .replace(/(рис\. )(S?[0-9]+)([a-z])\b/g, (_m, a: string, n: string, l: string) => a + n + l.toUpperCase())
    .replace(/\s{2,}/g, ' ')
    .trim()
}
export function ruValue(column: string, value: string): string {
  if (value === '') return '—'
  if (value === 'true') return 'да'
  if (value === 'false') return 'нет'
  const dict: Record<string, Record<string, string>> = {
    metric_name: METRIC_RU, aggregation: AGG_RU, result_origin: ORIGIN_RU, extraction_status: STATUS_RU, device_role: ROLE_RU,
    device_type: TYPE_RU, scan_direction: SCAN_RU, material_class: CLASS_RU, layer_function: LAYER_RU, check_name: CHECK_RU,
    metric_direction: DIRECTION_RU,
  }
  const d = dict[column]?.[value]
  if (d) return d
  if (column.endsWith('_unit')) return unitRu(value)
  if (column === 'source_table' || column === 'source_figure') return ruPlace(value)
  if (column === 'device_label' && /^pristine$/i.test(value)) return 'без добавки (pristine)'
  return value
}

export const DOMAIN_RU: Record<Domain, string> = { solar: 'Солнечные элементы', rag: 'Поиск и RAG' }
export const NODATA_TEXT = 'Результаты для этой статьи пока недоступны'

export function scopeEditCount(scope: string = scopeRef.value): number {
  return Object.keys(reviews[scope] ?? {}).length + Object.keys(issueMarks[scope] ?? {}).length
}
export function resetScopeEdits(scope: string = scopeRef.value): () => void {
  const r = reviews[scope] ? { ...reviews[scope] } : undefined
  const m = issueMarks[scope] ? { ...issueMarks[scope] } : undefined
  delete reviews[scope]
  delete issueMarks[scope]
  if (isRemoteScope(scope)) {
    void import('../api/edits').then((api) => api.resetRunEdits(scope)
      .then(() => import('../api/runs').then((m) => m.reloadRunPapers(scope)))
      .catch((e) => {
        if (r) reviews[scope] = r
        if (m) issueMarks[scope] = m
        toast(api.errText(e, 'Не удалось сбросить правки'))
      }))
    return () => toast('Правки на сервере сброшены — вернуть их нельзя')
  }
  return () => {
    if (r) reviews[scope] = { ...r, ...(reviews[scope] ?? {}) }
    if (m) issueMarks[scope] = { ...m, ...(issueMarks[scope] ?? {}) }
  }
}
export function pruneScopes(alive: string[]) {
  const keep = new Set(alive)
  for (const k of Object.keys(reviews)) if (!keep.has(k)) delete reviews[k]
  for (const k of Object.keys(issueMarks)) if (!keep.has(k)) delete issueMarks[k]
}
export function adoptLegacyEdits(scopesFor: (pid: string) => string[]) {
  const move = <T>(key: string, into: Record<string, Record<string, T>>, canon: (pid: string, id: string) => string) => {
    let old: Record<string, T> | null = null
    try { old = JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, T> | null } catch { }
    if (!old || typeof old !== 'object') return
    for (const [k, v] of Object.entries(old)) {
      const i = k.indexOf(':')
      if (i < 1) continue
      const pid = k.slice(0, i)
      const nk = pid + ':' + canon(pid, k.slice(i + 1))
      for (const sc of scopesFor(pid)) {
        const b = (into[sc] ??= {})
        if (!(nk in b)) b[nk] = v
      }
    }
    try { localStorage.removeItem(key) } catch { }
  }
  move<Review>('gs:case:reviews', reviews, rootOf)
  move<IssueMark>('gs:case:issues', issueMarks, (_p, id) => id)
}
