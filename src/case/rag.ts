import { DIRECTION_RU, FIELD_HINT_RU, STATUS_RU, ORIGIN_RU, num, ruPlace, reviewMark, reviewOf, type ReviewMark } from './index'
import { ragConfig, ragConfigsOf, ragDataset, ragExperiment, ragResultsOf, ragTask } from './ragData'
import type { RagConfigRow, RagResultRow } from './types'

export * from './ragData'
export { DIRECTION_RU, FIELD_HINT_RU, STATUS_RU, ORIGIN_RU }

export type RagDirection = 'higher' | 'lower' | 'target' | ''
export const ragDirection = (r: Pick<RagResultRow, 'metric_direction'>): RagDirection =>
  r.metric_direction === 'higher_is_better' ? 'higher' : r.metric_direction === 'lower_is_better' ? 'lower' : r.metric_direction === 'target' ? 'target' : ''
export const ragDirectionText = (r: Pick<RagResultRow, 'metric_direction'>) => DIRECTION_RU[r.metric_direction] ?? DIRECTION_RU['']!
export const ragDirectionShort = (r: Pick<RagResultRow, 'metric_direction'>) => {
  const d = ragDirection(r)
  return d === 'higher' ? '↑ больше лучше' : d === 'lower' ? '↓ меньше лучше' : d === 'target' ? 'целевое' : '—'
}

const RAG_UNIT_RU: Record<string, string> = {
  fraction: '', count: '', '%': '%', percentage_points: 'п. п.', relative_percent: '% (относительно)', ms: 'мс', s: 'с', sentences: 'предложений', score: 'баллов',
  index: '(индекс)', ratio: '(отношение)', rating_points: 'баллов', steps_per_query: 'шагов на запрос', relative_to_single_step: '× от одного шага',
  tokens: 'токенов', 'tokens/file': 'токенов на файл', MB: 'МБ', MiB: 'МиБ', characters: 'символов', files: 'файлов', hour: 'ч',
}
export const ragUnitRu = (u: string) => RAG_UNIT_RU[u] ?? u.replace(/_/g, ' ')
const GLUED: [RegExp, string][] = [
  [/maxgenerationtokens/gi, 'max generation tokens'], [/statisticaltest/gi, 'statistical test'], [/differentjudge/gi, 'different judge'],
  [/numberunspecified/gi, 'number unspecified'], [/versionnotgiven/gi, 'version not given'], [/reportedrandomseeds/gi, 'reported random seeds'],
  [/corepromptreturns/gi, 'core prompt returns'], [/buttablesreport/gi, 'but tables report'], [/greedytemperature/gi, 'greedy temperature'],
  [/modelscales/gi, 'model scales'], [/notassume/gi, 'not assume'], [/notspecified/gi, 'not specified'], [/notfullyspecified/gi, 'not fully specified'],
  [/notinterchangeable/gi, 'not interchangeable'], [/individualpvalues/gi, 'individual p-values'],
]
export function ragTidyText(t: string): string {
  if (!t) return t
  let s = t
  for (const [re, to] of GLUED) s = s.replace(re, to)
  s = s.replace(/(?<![A-Za-z])(on|of|over|from|across|at|to|and|for|in|by|with|per|every|than|top|fixed)(?=\d)/gi, '$1 ')
  s = s.replace(/(\d)(?=[a-z]{3,})/g, '$1 ')
  s = s.replace(/(?<![A-Za-z])(from|uses|generator|using|with|over|and|for|the|on|of)(?=[A-Z0-9])/g, '$1 ')
  s = s.replace(/,(?=[A-Za-z])/g, ', ')
  s = s.replace(/([A-Za-z]),(?=\d)/g, '$1, ')
  return s.replace(/ {2,}/g, ' ')
}

const RAG_UNIT_FORMS: Record<string, [string, string, string]> = {
  score: ['балл', 'балла', 'баллов'], rating_points: ['балл', 'балла', 'баллов'], sentences: ['предложение', 'предложения', 'предложений'],
  tokens: ['токен', 'токена', 'токенов'], files: ['файл', 'файла', 'файлов'], characters: ['символ', 'символа', 'символов'],
}
export function ragUnitFor(u: string, v: number): string {
  const f = RAG_UNIT_FORMS[u]
  if (!f) return ragUnitRu(u)
  if (!Number.isInteger(v)) return f[1]
  const m = Math.abs(v) % 100
  const d = Math.abs(v) % 10
  return m >= 11 && m <= 14 ? f[2] : d === 1 ? f[0] : d >= 2 && d <= 4 ? f[1] : f[2]
}

export const ragMetricName = (r: Pick<RagResultRow, 'metric_name' | 'metric_k'>) =>
  ragMetricCase(r.metric_k && !/@\s*\d/.test(r.metric_name) ? `${r.metric_name}@${r.metric_k}` : r.metric_name)
export const ragMetricCase = (n: string) => (/^[a-zа-яё][a-zа-яё0-9 ._@/-]*$/.test(n) ? n.charAt(0).toUpperCase() + n.slice(1) : n)
export const RAG_K_HINT = FIELD_HINT_RU.metric_k!
export const RAG_TOPK_HINT = FIELD_HINT_RU.top_k!

export function ragValueOf(r: RagResultRow): number | null {
  const c = reviewOf(r.publication_id, r.result_id, 'rag').corrected
  if (c != null) return c
  const v = parseFloat(r.normalized_value)
  return Number.isFinite(v) ? v : null
}
export function ragFmtValue(r: RagResultRow): string {
  const v = ragValueOf(r)
  if (v == null) return '—'
  const u = ragUnitFor(r.normalized_unit, v)
  return u ? `${num(v, 4)} ${u}` : num(v, 4)
}
export const ragFmtRaw = (r: RagResultRow) => {
  if (!r.raw_value) return '—'
  const n = parseFloat(r.raw_value)
  const u = r.raw_unit ? (Number.isFinite(n) ? ragUnitFor(r.raw_unit, n) : ragUnitRu(r.raw_unit)) : ''
  const t = r.raw_value.trim().replace(/^(-?)\.(?=\d)/, '$10.').replace('.', ',')
  return `${t}${u && !t.trim().endsWith(u) ? ' ' + u : ''}`
}
export const ragFromFigure = (r: RagResultRow): boolean =>
  (!!r.source_figure && !r.source_table) || /digiti[sz]|vector path|plot[- ]read|read from (the )?(plot|figure|chart)|graph[- ]read/i.test(r.note)
export const RAG_FIGURE_TEXT = 'считано с графика'
export const ragPlaceOf = (r: Pick<RagResultRow, 'source_page' | 'source_table' | 'source_figure'>) =>
  [r.source_page && 'стр. ' + r.source_page, r.source_table && ruPlace(r.source_table), r.source_figure && ruPlace(r.source_figure)].filter(Boolean).join(' · ')

export function ragConfigName(c: RagConfigRow | undefined): string {
  if (!c) return 'конфигурация не указана'
  const parts = [c.rag_variant, c.generator_model, c.retriever_model || c.retrieval_method, c.embedding_model].filter(Boolean)
  return parts.length ? ragTidyText(parts.slice(0, 3).join(' · ')) : c.config_id
}
export const ragConfigNameOf = (pid: string, configId: string) => (configId ? ragConfigName(ragConfig(pid, configId)) : 'конфигурация не указана')
export const ragDatasetNameOf = (pid: string, datasetId: string) => (datasetId ? ragTidyText(ragDataset(pid, datasetId)?.dataset_name || datasetId) : 'датасет не указан')
export const ragTaskNameOf = (pid: string, taskId: string) => (taskId ? ragTidyText(ragTask(pid, taskId)?.task_type || taskId) : 'задача не указана')

const RAG_CHECK_RU: Record<string, string> = {
  percentage_vs_percentage_point: 'Проценты и процентные пункты', plot_precision: 'Точность чтения графика',
  strict_bound_vs_plot_rounding: 'Граница и округление на графике', unspecified_generator: 'Не указан генератор',
  example_parameter_mismatch: 'Параметры примера не совпадают', sample_count_conflict: 'Расхождение числа примеров',
  retriever_threshold_conflict: 'Расхождение порога ретривера', embedding_model_conflict: 'Расхождение модели эмбеддингов',
  ner_model_conflict: 'Расхождение модели NER', joint_probability_assumption: 'Допущение о совместной вероятности',
  comparison_definition: 'Как определено сравнение', clipped_plot_geometry: 'Обрезанный график', legend_curve_disagreement: 'Легенда и кривая расходятся',
  caption_curve_disagreement: 'Подпись и кривая расходятся', cross_figure_disagreement: 'Рисунки расходятся между собой',
  learning_rate_grid_conflict: 'Расхождение сетки learning rate', reported_model_size_limit_conflict: 'Расхождение размера модели',
  sample_entity_count_conflict: 'Расхождение числа сущностей', reversed_relative_percentage: 'Перевёрнутый относительный процент',
  significance_marker_scope: 'К чему относится отметка значимости', human_preference_aggregation_unspecified: 'Не указано, как усреднены оценки людей',
  raw_metric_model_dependency: 'Метрика зависит от модели',
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const ragCheckLabel = (c: string) => RAG_CHECK_RU[c] ?? cap(c.replace(/_/g, ' '))

export const RAG_CHECK_GROUPS = ['Шкала и нормализация', 'Протокол и сопоставимость', 'Противоречия', 'Графики и чтение', 'Прочее'] as const
export type RagCheckGroup = (typeof RAG_CHECK_GROUPS)[number]
const has = (s: string, re: RegExp) => re.test(s)
export function ragCheckGroup(checkName: string, description = ''): RagCheckGroup {
  const n = checkName.toLowerCase().replace(/_/g, ' ')
  if (has(n, /percent|unit|scale|rounding|rounded|normaliz|denominator|ratio|order-of-magnitude|relative|arithmetic/)) return 'Шкала и нормализация'
  if (has(n, /plot|figure|digitiz|contour|clipped|legend|caption|graphical|graph versus|curve|bubble|screenshot|axis/)) return 'Графики и чтение'
  if (has(n, /conflict|contradict|inconsisten|mismatch|disagree|discrepanc|differs|overstate/)) return 'Противоречия'
  if (has(n, /protocol|scope|comparison|comparab|baseline|split|sampl|judge|generator|model|provenance|hardware|uncertaint|significance|aggregation|ambigu|leakage|reproducib|retriev|hyperparameter|latency|claim|missing|threshold/)) return 'Протокол и сопоставимость'
  if (!n.trim() && description) return ragCheckGroup(description.slice(0, 80))
  return 'Прочее'
}

export const ragIsRejected = (r: RagResultRow) => reviewOf(r.publication_id, r.result_id, 'rag').status === 'rejected'
export const ragReviewMark = (r: RagResultRow): ReviewMark | null => reviewMark(r.publication_id, r.result_id, 'rag')
export function ragValueClass(r: RagResultRow): string[] {
  const m = ragReviewMark(r)
  return ['val', m?.kind === 'fixed' ? 'val--fixed' : m?.kind === 'rejected' ? 'val--rejected' : '']
}

export interface RagCompareParts { task: string; dataset: string; metric: string; variant: string; k: string; unit: string; protocol: string }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
export function ragCompareParts(r: RagResultRow): RagCompareParts {
  const pid = r.publication_id
  return {
    task: norm(ragTask(pid, r.task_id)?.task_type ?? r.task_id),
    dataset: norm(ragDataset(pid, r.dataset_id)?.dataset_name ?? r.dataset_id),
    metric: norm(r.metric_name),
    variant: norm(r.metric_variant),
    k: r.metric_k.trim(),
    unit: norm(r.normalized_unit),
    protocol: norm(ragExperiment(pid, r.experiment_id)?.evaluation_protocol ?? r.experiment_id),
  }
}
export function ragCompareKey(r: RagResultRow, o: { protocol?: boolean } = {}): string {
  const p = ragCompareParts(r)
  return [p.task, p.dataset, p.metric, p.variant, p.k, p.unit, o.protocol === false ? '' : p.protocol].join('\u0001')
}
const PART_RU: [keyof RagCompareParts, string][] = [
  ['task', 'разные задачи'], ['dataset', 'разные датасеты'], ['metric', 'разные метрики'], ['variant', 'разные варианты метрики'],
  ['k', 'разное k метрики'], ['unit', 'разные единицы'], ['protocol', 'разные протоколы оценки'],
]
export function ragWhyNotComparable(a: RagResultRow, b: RagResultRow, o: { ignoreProtocol?: boolean } = {}): string[] {
  const pa = ragCompareParts(a)
  const pb = ragCompareParts(b)
  return PART_RU.filter(([k]) => !(o.ignoreProtocol && k === 'protocol') && pa[k] !== pb[k]).map(([, t]) => t)
}

export interface RagBestOpts {
  dataset?: string; task?: string; experiment?: string
  variant?: string; k?: string
  origin?: 'primary' | 'cited' | 'any'
  withRejected?: boolean
}
export function ragUsableResults(pid: string, opts: RagBestOpts = {}): RagResultRow[] {
  const origin = opts.origin ?? 'primary'
  return ragResultsOf(pid).filter((r) =>
    r.extraction_status === 'extracted' && !r.duplicate_of &&
    (origin === 'any' || r.result_origin === origin) &&
    (opts.dataset == null || r.dataset_id === opts.dataset) && (opts.task == null || r.task_id === opts.task) &&
    (opts.experiment == null || r.experiment_id === opts.experiment) &&
    (opts.variant == null || r.metric_variant === opts.variant) && (opts.k == null || r.metric_k === opts.k) &&
    (opts.withRejected || !ragIsRejected(r)) && ragValueOf(r) != null,
  )
}
export function ragIsBetter(dir: RagDirection, a: number, b: number): boolean {
  return dir === 'higher' ? a > b : dir === 'lower' ? a < b : false
}
export function ragBestAmong(rows: RagResultRow[]): RagResultRow | undefined {
  let best: RagResultRow | undefined
  for (const r of rows) {
    const d = ragDirection(r)
    if (d !== 'higher' && d !== 'lower') continue
    const v = ragValueOf(r)
    if (v == null) continue
    if (!best || ragIsBetter(d, v, ragValueOf(best)!)) best = r
  }
  return best
}
export interface RagGroup {
  key: string
  parts: RagCompareParts
  rows: RagResultRow[]
  best?: RagResultRow
  datasetName: string; taskName: string
}
export function ragBestGroups(pid: string, metric: string, opts: RagBestOpts = {}): RagGroup[] {
  const m = norm(metric)
  const g = new Map<string, RagResultRow[]>()
  for (const r of ragUsableResults(pid, opts)) {
    if (norm(r.metric_name) !== m) continue
    const k = ragCompareKey(r)
    const list = g.get(k)
    if (list) list.push(r)
    else g.set(k, [r])
  }
  return [...g].map(([key, rows]) => ({
    key, rows, parts: ragCompareParts(rows[0]!), best: ragBestAmong(rows),
    datasetName: ragDatasetNameOf(pid, rows[0]!.dataset_id), taskName: ragTaskNameOf(pid, rows[0]!.task_id),
  })).sort((a, b) => b.rows.length - a.rows.length)
}
export function ragBestOf(pid: string, metric: string, opts: RagBestOpts = {}): RagResultRow | undefined {
  for (const g of ragBestGroups(pid, metric, opts)) if (g.best) return g.best
  return undefined
}
export function ragBestIndex(values: (number | null | undefined)[], dir: RagDirection): number {
  if (dir !== 'higher' && dir !== 'lower') return -1
  const have = values.filter((v): v is number => v != null)
  if (have.length < 2 || new Set(have).size < 2) return -1
  let bi = -1
  values.forEach((v, i) => { if (v != null && (bi < 0 || ragIsBetter(dir, v, values[bi]!))) bi = i })
  return bi
}

const SIM_RE = /simulat|симуляц/i
export function ragIsSim(pid: string, r: RagResultRow): boolean {
  const c = ragConfigsOf(pid).find((x) => x.config_id === r.config_id)
  return SIM_RE.test(`${ragConfigNameOf(pid, r.config_id)} ${c?.note ?? ''} ${r.note ?? ''}`)
}
