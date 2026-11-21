import { reactive } from 'vue'
import { COLLECTIONS, RECORDS, RECORD_SOURCE, fmt, paramOf, parseConditions, recordFor, rowLabel, unitText, type CollectionId, type Fact } from './data'
import { plural } from './search'
import { isResolved, openIssues, pinOf, state, valueOf, type Paper } from './store'

export { RECORDS, RECORD_SOURCE, parseConditions }

export type Level = 'error' | 'warn' | 'info'
export const LEVEL_ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2 }

export interface Finding {
  id: string
  ruleId: string
  level: Level
  paperId: string
  row: string
  rowLabel: string
  param: string
  paramLabel: string
  value: string
  text: string
  factId: string | null
  factIds: string[]
}

export interface RuleInfo {
  id: string
  title: string
  what: string
  level: Level
  unit: [string, string, string]
  collections: CollectionId[]
}

export interface RuleResult extends RuleInfo {
  total: number
  findings: Finding[]
  accepted: number
  status: Level | 'ok'
}

const KEY = 'gs:v1:checks-ok'
function loadAccepted(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
export const acceptedFindings = reactive(new Set<string>(loadAccepted()))
export function markAccepted(id: string, on = true) {
  if (on) acceptedFindings.add(id)
  else acceptedFindings.delete(id)
  try {
    localStorage.setItem(KEY, JSON.stringify([...acceptedFindings]))
  } catch {
  }
}

export const recordOf = (p: Paper) => recordFor(p)

const F: [string, string, string] = ['факта', 'фактов', 'фактов']
export const RULES: RuleInfo[] = [
  { id: 'jv_consistency', title: 'КПД не сходится с Voc × Jsc × FF / Pin', what: 'КПД ≈ Voc × Jsc × FF / Pin; Pin берётся из условий измерения, по умолчанию 100 мВт/см². Расхождение больше 3 % — замечание.', level: 'warn', unit: ['образца', 'образцов', 'образцов'], collections: ['solar'] },
  { id: 'voc_limit', title: 'Voc не меньше ширины зоны', what: 'Напряжение холостого хода меньше Eg/q. Если Voc ≥ Eg — ошибка в одном из двух значений.', level: 'error', unit: ['значения', 'значений', 'значений'], collections: ['solar'] },
  { id: 'range', title: 'Значение вне допустимого диапазона', what: 'FF не больше 100 %, КПД не выше рекорда для материала (NREL), Jsc не выше предела Шокли — Квайссера, Rsh больше Rs.', level: 'error', unit: F, collections: ['solar'] },
  { id: 'eqe_consistency', title: 'Jsc по EQE не сходится с Jsc по ВАХ', what: 'Интеграл EQE и Jsc по ВАХ отличаются не больше чем на 5 %. Больше — сомнение.', level: 'warn', unit: ['значения', 'значений', 'значений'], collections: ['solar'] },
  { id: 'champion_vs_mean', title: 'Лучший прибор и среднее не согласуются', what: 'КПД лучшего прибора не меньше среднего по той же партии и не выше его больше чем на 3 разброса.', level: 'warn', unit: ['партии', 'партий', 'партий'], collections: ['solar'] },
  { id: 'hysteresis_index', title: 'Гистерезис: прямая и обратная развёртки', what: 'Развёртки хранятся отдельными строками. Если есть обе, показываем индекс гистерезиса HI. Это справка, не ошибка.', level: 'info', unit: ['пары', 'пар', 'пар'], collections: ['solar'] },
  { id: 'comparability', title: 'Нельзя сравнивать как есть', what: 'В одной таблице рядом лучший прибор и среднее: «лучший» определяют только среди строк одного типа.', level: 'info', unit: ['утверждения', 'утверждений', 'утверждений'], collections: ['solar'] },
  { id: 'metric_at_k', title: 'Recall@k убывает с ростом k', what: 'В топ-k входят все документы из топ-(k−1), поэтому Recall@5 ≤ Recall@10 ≤ Recall@20.', level: 'error', unit: ['строки', 'строк', 'строк'], collections: ['rag'] },
  { id: 'metric_scale', title: 'Метрика вне шкалы', what: 'Метрики поиска лежат в долях 0…1 или в процентах 0…100 %. Значение вне шкалы — ошибка.', level: 'error', unit: F, collections: ['rag'] },
  { id: 'metric_definition', title: 'Не указано, как считали метрики', what: 'Нужен вариант метрики (Recall@k по документам) или протокол оценки — без них результаты нельзя сравнивать.', level: 'warn', unit: ['статьи', 'статей', 'статей'], collections: ['rag'] },
  { id: 'mrr', title: 'MRR больше Recall@10', what: 'MRR по топ-10 не превышает Recall@10 — иначе метрики считали по-разному.', level: 'warn', unit: ['строки', 'строк', 'строк'], collections: ['rag'] },
  { id: 'mixed', title: 'Метрики записаны в разном виде', what: 'Метрики поиска записаны либо долями (0,74), либо процентами (74 %), но не вперемешку.', level: 'info', unit: F, collections: ['rag'] },
  { id: 'outliers', title: 'Выбросы', what: 'Значение отличается от медианы коллекции больше чем на 2,5 MAD. Выброс — не обязательно ошибка: проверьте, нет ли опечатки или другого режима измерения.', level: 'info', unit: F, collections: ['solar', 'rag'] },
  { id: 'contradiction', title: 'Текст противоречит таблице', what: 'Утверждения в тексте («лучший», «достигает») и повторы значения в аннотации сверяются с таблицами статьи.', level: 'error', unit: ['утверждения', 'утверждений', 'утверждений'], collections: ['solar', 'rag'] },
  { id: 'missing_conditions', title: 'Условия измерения не указаны', what: 'Для каждой статьи есть спектр и мощность освещения (и температура) — без них КПД сравнивать нельзя.', level: 'warn', unit: ['статьи', 'статей', 'статей'], collections: ['solar'] },
  { id: 'unitsConv', title: 'Единицы пересчитаны', what: 'Факт был записан в другой единице (мВ, мкм, доля вместо %) и пересчитан. Справочно: проверьте, что пересчёт верен.', level: 'info', unit: F, collections: ['solar', 'rag'] },
  { id: 'unitsBad', title: 'Нераспознанные единицы', what: 'Единицу измерения не нашли в словаре нормализации — число не удалось привести к стандартной.', level: 'error', unit: F, collections: ['solar', 'rag'] },
]

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
const pct = (n: number) => n.toFixed(1).replace('.', ',')

export function runChecks(c: CollectionId): RuleResult[] {
  const papers = state.papers.filter((p) => p.collection === c && p.processing >= 100)
  const ids = new Set(papers.map((p) => p.id))
  const paper = (id: string) => papers.find((p) => p.id === id)!
  const facts = state.facts.filter((f) => ids.has(f.paperId) && f.status !== 'rejected')
  const numeric = facts.filter((f) => !paramOf(c, f.param).text)
  const get = (pid: string, row: string, key: string) => facts.find((f) => f.paperId === pid && f.row === row && f.param === key)

  const make = (rule: string, level: Level, f: Fact | null, text: string, o: Partial<Finding> = {}): Finding => {
    const p = paper(f?.paperId ?? o.paperId!)
    const row = f?.row ?? o.row ?? '*'
    const param = f?.param ?? o.param ?? ''
    return {
      id: `${rule}:${o.factIds?.join('+') || f?.id || p.id}`,
      ruleId: rule,
      level,
      paperId: p.id,
      row,
      rowLabel: rowLabel(p, row),
      param,
      paramLabel: param ? paramOf(c, param).label : '',
      value: f ? (f.edited != null ? fmt(f.edited, paramOf(c, f.param)) : f.raw) : '',
      text,
      factId: f?.id ?? null,
      factIds: f ? [f.id] : [],
      ...o,
    }
  }

  const out: Record<string, { total: number; list: Finding[] }> = {}
  const rule = (id: string, total: number, list: Finding[]) => (out[id] = { total, list })

  const fromIssues = (ruleId: string, total: number) => {
    const list: Finding[] = []
    for (const p of papers) {
      for (const i of openIssues(p).filter((x) => x.plugin === ruleId)) {
        const f = state.facts.find((x) => x.id === i.factIds[0]) ?? null
        const level: Level = i.level === 'conflict' ? 'error' : i.level === 'doubt' ? 'warn' : 'info'
        list.push(make(ruleId, level, f, `${i.title}. ${i.text}`, { paperId: p.id, factIds: i.factIds, id: `${ruleId}:${i.id}` }))
      }
    }
    rule(ruleId, total, list)
  }
  const rowsWith = (pred: (r: Paper['rows'][number]) => boolean) => papers.reduce((n, p) => n + p.rows.filter(pred).length, 0)

  if (c === 'solar') {
    const physList: Finding[] = []
    let physTotal = 0
    for (const p of papers) {
      for (const r of p.rows) {
        const [voc, jsc, ff, pce] = ['voc', 'jsc', 'ff', 'pce'].map((k) => get(p.id, r.id, k))
        if (!voc || !jsc || !ff || !pce) continue
        const [a, b, d, e] = [voc, jsc, ff, pce].map(valueOf)
        if (a == null || b == null || d == null || e == null) continue
        physTotal++
        if (isResolved(`${p.id}:phys:${r.id}`)) continue
        const pin = pinOf(p, r.id)
        const calc = ((a * b * (d / 100)) / pin.value) * 100
        const diff = (Math.abs(calc - e) / e) * 100
        if (diff > 3) {
          const fs = [voc, jsc, ff, pce]
          physList.push(make('jv_consistency', 'warn', pce, `Voc × Jsc × FF / Pin = ${fmt(a, paramOf(c, 'voc'))} × ${fmt(b, paramOf(c, 'jsc'))} × ${fmt(d, paramOf(c, 'ff'))} / ${pin.value} мВт/см² даёт ${fmt(calc, paramOf(c, 'pce'))}, в статье ${fmt(e, paramOf(c, 'pce'))}: расхождение ${pct(diff)} %. Проверьте мощность освещения, площадь и опечатки.`, { factIds: fs.map((f) => f.id) }))
        }
      }
    }
    rule('jv_consistency', physTotal, physList)

    fromIssues('voc_limit', facts.filter((f) => f.param === 'voc' && f.row !== '*').length)
    fromIssues('range', facts.filter((f) => ['pce', 'ff', 'jsc', 'rs'].includes(f.param)).length)
    fromIssues('eqe_consistency', facts.filter((f) => f.param === 'jsc_eqe').length)
    fromIssues('champion_vs_mean', rowsWith((r) => r.aggregation === 'mean' && !!r.batch))
    fromIssues('hysteresis_index', rowsWith((r) => r.scan_direction === 'forward' && !!r.batch))
    fromIssues('comparability', papers.reduce((n, p) => n + p.claims.filter((x) => x.kind === 'best').length, 0))
    fromIssues('missing_conditions', papers.length)
  } else {
    const mrr: Finding[] = []
    let rows = 0
    for (const p of papers) {
      for (const r of p.rows) {
        const [f10, fm] = ['r10', 'mrr'].map((k) => get(p.id, r.id, k))
        const [v10, vm] = [f10, fm].map((f) => (f ? valueOf(f) : null))
        if (get(p.id, r.id, 'r5') && f10 && v10 != null) rows++
        if (fm && f10 && vm != null && v10 != null && vm > v10) mrr.push(make('mrr', 'warn', fm, `MRR = ${fmt(vm, paramOf(c, 'mrr'))} выше Recall@10 = ${fmt(v10, paramOf(c, 'r10'))} (строка ${r.label}). Похоже, метрики считали на разных наборах.`, { factIds: [fm.id, f10.id] }))
      }
    }
    fromIssues('metric_at_k', rows)
    rule('mrr', rows, mrr)
    fromIssues('metric_scale', facts.filter((f) => !!paramOf(c, f.param).metric_direction && paramOf(c, f.param).unit === '').length)
    fromIssues('metric_definition', papers.length)

    const mixed: Finding[] = []
    const metric = numeric.filter((f) => ['r5', 'r10', 'mrr'].includes(f.param))
    const pctN = metric.filter((f) => f.raw.includes('%')).length
    if (pctN && pctN < metric.length) {
      const minority = pctN <= metric.length - pctN ? metric.filter((f) => f.raw.includes('%')) : metric.filter((f) => !f.raw.includes('%'))
      for (const f of minority) mixed.push(make('mixed', 'info', f, `В коллекции метрики в основном ${pctN <= metric.length - pctN ? 'долями' : 'в процентах'}, а здесь «${f.raw}». Значение приведено к долям: ${fmt(valueOf(f), paramOf(c, f.param))}.`))
    }
    rule('mixed', metric.length, mixed)
  }

  const outList: Finding[] = []
  for (const param of COLLECTIONS[c].params.filter((p) => !p.text && !['bandgap', 'thickness', 'chunk', 'rs', 'rsh', 'hi', 't80', 'retained_pce', 'latency_ms'].includes(p.key))) {
    const fs = numeric.filter((f) => f.param === param.key && valueOf(f) != null)
    if (fs.length < 5) continue
    const vals = fs.map((f) => valueOf(f)!)
    const med = median(vals)
    const mad = median(vals.map((v) => Math.abs(v - med)))
    if (!mad) continue
    for (const f of fs) {
      const k = Math.abs(valueOf(f)! - med) / mad
      const from = f.source.kind === 'figure' ? 'с рисунка' : f.source.kind === 'text' ? 'из текста' : 'из таблицы'
      if (k > 2.5) outList.push(make('outliers', 'info', f, `${param.label} ${from}: ${fmt(valueOf(f), param)}, медиана по коллекции ${fmt(med, param)}, отклонение ${pct(k)} MAD.`))
    }
  }
  rule('outliers', numeric.length, outList)

  fromIssues('contradiction', papers.reduce((n, p) => n + p.claims.length, 0) + facts.filter((f) => !!f.duplicate_of && f.source.kind !== 'figure').length)

  const conv: Finding[] = []
  const bad: Finding[] = []
  for (const f of numeric) {
    const param = paramOf(c, f.param)
    const unit = unitText(f.raw).trim()
    if (f.base == null) {
      bad.push(make('unitsBad', 'error', f, `Не удалось распознать «${f.raw}»${unit ? `: единицы «${unit}» нет в словаре для параметра «${param.label}»` : ''}. Добавьте синоним в словарь или исправьте значение.`))
    } else if (unit !== param.unit) {
      const k = param.units[unit]
      conv.push(make('unitsConv', 'info', f, `Записано «${f.raw}», пересчитано в ${fmt(f.base, param)}${k && k !== 1 ? ` (× ${String(k).replace('.', ',')})` : ''}.`))
    }
  }
  rule('unitsConv', numeric.length, conv)
  rule('unitsBad', numeric.length, bad)

  return RULES.filter((r) => r.collections.includes(c)).map((r) => {
    const { total, list } = out[r.id] ?? { total: 0, list: [] }
    const findings = list.filter((f) => !acceptedFindings.has(f.id)).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
    const worst = findings.reduce<Level | null>((w, f) => (w == null || LEVEL_ORDER[f.level] < LEVEL_ORDER[w] ? f.level : w), null)
    return { ...r, total, findings, accepted: list.length - findings.length, status: worst ?? 'ok' }
  })
}

export const unitWord = (r: RuleInfo, n: number) => plural(n, r.unit)

export function paperTag(p: Paper): string {
  return `${paperHead(p)} (${p.year})`
}
export function paperHead(p: Paper): string {
  const head = (p.title.split(/[:—,]| с КПД| при /)[0] ?? p.title).trim()
  return head.length > 30 ? head.slice(0, 30).replace(/\s+\S*$/, '') + '…' : head
}
export const shortName = (p: Paper) => `${p.authors.split(/[,\s]/)[0] || 'Статья'} (${p.year})`
