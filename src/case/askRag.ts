import {
  RAG_CHECK_GROUPS, ragBestGroups, ragCheckGroup, ragCheckLabel, ragConfigNameOf, ragConfigsOf, ragDatasetsOf,
  ragDirection, ragDirectionText, ragFmtValue, ragHasData, ragInScope, ragIssuesOf, ragLoadAll, ragMetricName, ragPlaceOf,
  ragResultsOf, ragBestAmong, ragIsSim, ragSummaryOf, ragTopMetrics, ragTotals, ragValueOf, ragWhyNotComparable, ragIsBetter, ragExperiment, ragFromFigure, ragMetricCase,
  type RagCompareParts, type RagDirection, type RagGroup,
} from './rag'
import type { CaseAnswer, CaseCard, CaseCite, RagTableRow } from './ask'
import type { RagResultRow } from './types'
import { fmtInt } from '../fmt'

const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const plural = (n: number, one: string, few: string, many: string) => {
  const a = n % 10, b = n % 100
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many
}
const nStat = (n: number) => `${n} ${plural(n, 'статья', 'статьи', 'статей')}`
const nIss = (n: number) => `${n} ${plural(n, 'замечание', 'замечания', 'замечаний')}`
const baseOf = (name: string) => name.replace(/@\s*\d+.*$/, '').trim().toLowerCase()
const q1 = (s: string) => (s.length > 60 ? s.slice(0, 57) + '…' : s)

const topMetricOf = (pids: string[]) => ragTopMetrics(pids, 1)[0]?.metric
export function suggestionsForRag(pids: string[]): string[] {
  const data = pids.filter((p) => ragHasData(p) && ragInScope(p))
  if (!data.length) return []
  const m = topMetricOf(data)
  const out: string[] = []
  if (m) out.push(`Лучший ${m}`)
  const withM = data.filter((p) => ragSummaryOf(p).metrics.some(([n]) => n === m)).sort((a, b) => ragSummaryOf(b).results - ragSummaryOf(a).results)
  if (m && withM.length >= 2) out.push(`Сравни ${withM[0]} и ${withM[1]} по ${m}`)
  const iss = [...data].sort((a, b) => ragSummaryOf(b).issues - ragSummaryOf(a).issues)[0]
  if (iss && ragSummaryOf(iss).issues) out.push(`Замечания у ${iss}`)
  out.push('Какие датасеты')
  return out.slice(0, 3)
}
function followUps(pids: string[], skip: string): string[] {
  const m = topMetricOf(pids)
  const withM = pids.filter((p) => ragSummaryOf(p).metrics.some(([n]) => n === m)).sort((a, b) => ragSummaryOf(b).results - ragSummaryOf(a).results)
  const iss = [...pids].sort((a, b) => ragSummaryOf(b).issues - ragSummaryOf(a).issues)[0]
  const list: [string, string | null][] = [
    ['best', m ? `Лучший ${m}` : null],
    ['compare', m && withM.length >= 2 ? `Сравни ${withM[0]} и ${withM[1]} по ${m}` : null],
    ['issues', iss && ragSummaryOf(iss).issues ? `Замечания у ${iss}` : null],
    ['datasets', 'Какие датасеты'],
  ]
  return list.filter(([k, v]) => k !== skip && v).map(([, v]) => v!).slice(0, 3)
}

class Builder {
  cites: CaseCite[] = []
  cards: CaseCard[] = []
  cite(r: RagResultRow): string {
    const i = this.cites.findIndex((c) => c.pid === r.publication_id && c.rid === r.result_id)
    if (i >= 0) return `[${i + 1}]`
    this.cites.push({
      pid: r.publication_id, rid: r.result_id, page: r.source_page || undefined, domain: 'rag',
      label: [r.publication_id, ragConfigNameOf(r.publication_id, r.config_id), `${ragMetricName(r)} ${ragFmtValue(r)}`, 'results · ' + r.result_id, ragPlaceOf(r)].filter(Boolean).join(' · '),
    })
    return `[${this.cites.length}]`
  }
  citeIssue(pid: string, iid: string, check: string, page: string): string {
    this.cites.push({ pid, iid, page: page || undefined, domain: 'rag', label: [pid, ragCheckLabel(check), page && 'стр. ' + page].filter(Boolean).join(' · ') })
    return `[${this.cites.length}]`
  }
  done(text: string, suggestions: string[]): CaseAnswer {
    return { text, cards: this.cards, cites: this.cites, suggestions: suggestions.slice(0, 3) }
  }
}

interface Parsed {
  q: string; codes: string[]; names: string[]; metricBase: string; k: string; dataset: string
  intent: 'issues' | 'datasets' | 'compare' | 'best' | 'count' | 'models' | 'paper' | 'unknown'
  worst: boolean
}
function parse(question: string, pids: string[]): Parsed {
  const q = low(question)
  const codes = [...new Set((q.match(/(?<![a-z0-9])d\d{3}(?![0-9])/gi) ?? []).map((c) => c.toUpperCase()))]
  const k = /@\s*(\d+)/.exec(q)?.[1] ?? ''
  const stripped = q.replace(/(?<![a-z0-9])d\d{3}(?![0-9])/gi, ' ')
  const names = new Set<string>()
  for (const pid of pids) for (const r of ragResultsOf(pid)) names.add(r.metric_name)
  let metricBase = ''
  for (const n of names) {
    const b = baseOf(n)
    if (b.length < 2 || b.length <= metricBase.length) continue
    if (new RegExp(`(?<![a-zа-я0-9])${esc(b)}(?![a-zа-я0-9])`).test(stripped)) metricBase = b
  }
  const metricNames = [...names].filter((n) => metricBase && baseOf(n) === metricBase)
  let dataset = ''
  for (const pid of pids) for (const d of ragDatasetsOf(pid)) {
    const n = low(d.dataset_name)
    if (n.length >= 3 && n.length > dataset.length && new RegExp(`(?<![a-zа-я0-9])${esc(n)}(?![a-zа-я0-9])`).test(stripped)) dataset = n
  }
  const worst = /худш|миним|наименьш|самы[йе] (низк|мал)/.test(q)
  let intent: Parsed['intent'] = 'unknown'
  if (/замечан|ошибк|проблем|противореч|проверк|несоглас|нестыков/.test(q)) intent = 'issues'
  else if (/датасет|набор[а-я]* данных|бенчмарк/.test(q)) intent = 'datasets'
  else if (codes.length >= 2 || /сравн|сопостав|(?<![a-z])vs(?![a-z])|против|разниц|отлича/.test(q)) intent = 'compare'
  else if (/сколько|количеств/.test(q)) intent = 'count'
  else if (/генератор|эмбеддинг|ретривер|реранкер|какие модел|конфигурац/.test(q)) intent = 'models'
  else if (metricBase || /лучш|максим|рекорд|наибольш|наивысш|топ|худш|миним|best|top/.test(q)) intent = 'best'
  else if (codes.length) intent = 'paper'
  return { q, codes, names: metricNames, metricBase, k, dataset, intent, worst }
}

const crossKey = (p: RagCompareParts) => [p.task, p.dataset, p.metric, p.variant, p.k, p.unit].join('\u0001')
interface Entry { pid: string; row: RagResultRow; group: RagGroup }
interface Bucket { key: string; parts: RagCompareParts; entries: Entry[]; datasetName: string; taskName: string; groups: { pid: string; group: RagGroup }[] }

function buckets(pids: string[], names: string[], k: string, dataset: string, noSim = false): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const pid of pids) {
    for (const name of names) {
      if (k && name.includes('@') && !new RegExp(`@\\s*${k}(?!\\d)`).test(name)) continue
      for (let g of ragBestGroups(pid, name, k && !name.includes('@') ? { k } : {})) {
        if (noSim) {
          const rows = g.rows.filter((r) => !ragIsSim(pid, r))
          if (!rows.length) continue
          if (rows.length !== g.rows.length) g = { ...g, rows, best: ragBestAmong(rows) }
        }
        if (dataset && !g.datasetName.toLowerCase().includes(dataset)) continue
        if (!g.best) {
          if (!g.rows[0]) continue
        }
        const key = crossKey(g.parts)
        let b = map.get(key)
        if (!b) map.set(key, (b = { key, parts: g.parts, entries: [], datasetName: g.datasetName, taskName: g.taskName, groups: [] }))
        b.groups.push({ pid, group: g })
        const row = g.best ?? g.rows[0]!
        const have = b.entries.find((e) => e.pid === pid)
        if (!have) b.entries.push({ pid, row, group: g })
        else if (g.best && have.group.best) {
          const d = ragDirection(g.best)
          if (ragIsBetter(d, ragValueOf(g.best)!, ragValueOf(have.row)!)) { have.row = g.best; have.group = g }
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.entries.length - a.entries.length || b.entries.reduce((s, e) => s + e.group.rows.length, 0) - a.entries.reduce((s, e) => s + e.group.rows.length, 0))
}
function topEntry(main: Bucket, dir: RagDirection, worst: boolean): Entry | undefined {
  if (dir !== 'higher' && dir !== 'lower') return undefined
  const all: Entry[] = []
  for (const { pid, group } of main.groups) for (const row of group.rows) if (ragValueOf(row) != null) all.push({ pid, row, group })
  return sortEntries(all, dir, worst)[0]
}
const sortEntries = (es: Entry[], dir: RagDirection, worst = false) => {
  const s = [...es].sort((a, b) => (ragValueOf(b.row) ?? 0) - (ragValueOf(a.row) ?? 0))
  if (dir === 'lower') s.reverse()
  if (worst) s.reverse()
  return s
}
const tableRow = (e: Entry, best: boolean): RagTableRow => ({
  cells: [e.pid, ragFmtValue(e.row), ragConfigNameOf(e.pid, e.row.config_id), ragPlaceOf(e.row) || '—'], pid: e.pid, rid: e.row.result_id, best,
})
const COLS = ['Статья', 'Значение', 'Конфигурация', 'Место в статье']

const condText = (b: Bucket) => {
  const p = b.parts
  const parts = [`датасет «${b.datasetName}»`, b.taskName && `задача «${b.taskName}»`, p.variant && `вариант метрики «${p.variant}»`, p.k && `k = ${p.k}`].filter(Boolean)
  return parts.join(', ')
}

export async function answerRag(question: string, pids: string[]): Promise<CaseAnswer> {
  const all = [...new Set(pids)].filter(ragHasData)
  await ragLoadAll(all)
  return answerRagNow(question, pids)
}

export function answerRagNow(question: string, pids: string[]): CaseAnswer {
  const b = new Builder()
  const all = [...new Set(pids)]
  const data = all.filter(ragHasData)
  const scope = data.filter(ragInScope)
  const help = suggestionsForRag(all)
  if (!data.length) return b.done('В этом разборе пока нет данных. Результаты для этих статей пока недоступны.', [])
  const p = parse(question, scope)
  const missing = p.codes.filter((c) => !all.includes(c))
  if (p.codes.length && missing.length === p.codes.length) return b.done(`${missing.length > 1 ? 'Статей' : 'Статьи'} ${missing.join(', ')} нет в этом разборе.`, help)
  const codes = p.codes.filter((c) => all.includes(c))
  const target = codes.length ? codes.filter((c) => data.includes(c)) : scope
  const note = missing.length ? ` Статей ${missing.join(', ')} в разборе нет.` : ''

  switch (p.intent) {
    case 'issues': {
      const pool = codes.length ? target : data
      const items = pool.flatMap((pid) => ragIssuesOf(pid))
      if (!items.length) return b.done(`Замечаний${codes.length ? ' у ' + codes.join(', ') : ''} нет.${note}`, followUps(all, 'issues'))
      const by = new Map<string, number>()
      for (const i of items) { const g = ragCheckGroup(i.check_name, i.description); by.set(g, (by.get(g) ?? 0) + 1) }
      const parts = RAG_CHECK_GROUPS.filter((g) => by.has(g)).map((g) => `${g.toLowerCase()} — ${by.get(g)}`)
      const first = items[0]!
      const papers = new Set(items.map((i) => i.publication_id))
      b.cards.push({ kind: 'issues', title: 'Замечания', domain: 'rag', items: items.map((i) => ({ pid: i.publication_id, iid: i.issue_id })) })
      const who = codes.length === 1 ? `У ${codes[0]}` : `В ${papers.size} ${plural(papers.size, 'статье', 'статьях', 'статьях')}`
      return b.done(
        `${who} ${nIss(items.length)}: ${parts.join(', ')}. Например, стр. ${first.source_page || '—'}: ${q1(first.description.replace(/\.$/, ''))} ${b.citeIssue(first.publication_id, first.issue_id, first.check_name, first.source_page)}.${note}`,
        followUps(all, 'issues'),
      )
    }

    case 'datasets': {
      const m = new Map<string, { name: string; pids: Set<string> }>()
      for (const pid of target) for (const d of ragDatasetsOf(pid)) {
        const key = low(d.dataset_name || d.dataset_id)
        const e = m.get(key) ?? { name: d.dataset_name || d.dataset_id, pids: new Set<string>() }
        e.pids.add(pid)
        m.set(key, e)
      }
      const list = [...m.values()].sort((a, c) => c.pids.size - a.pids.size || a.name.localeCompare(c.name))
      if (!list.length) return b.done(`Датасеты не описаны.${note}`, followUps(all, 'datasets'))
      const rows: RagTableRow[] = list.slice(0, 15).map((e) => ({ cells: [e.name, String(e.pids.size), [...e.pids].slice(0, 6).join(', ') + (e.pids.size > 6 ? '…' : '')], pid: [...e.pids][0] }))
      b.cards.push({ kind: 'ragTable', title: 'Датасеты', cols: ['Датасет', 'Статей', 'Какие'], rows, note: list.length > 15 ? `Показаны 15 из ${list.length}` : undefined })
      const top = list.slice(0, 3).map((e) => `«${e.name}» (${nStat(e.pids.size)})`)
      return b.done(
        `${codes.length === 1 ? 'В ' + codes[0] : 'В ' + target.length + ' ' + plural(target.length, 'статье', 'статьях', 'статьях')} описано ${list.length} ${plural(list.length, 'датасет', 'датасета', 'датасетов')}. Чаще всего: ${top.join(', ')}.${note}`,
        followUps(all, 'datasets'),
      )
    }

    case 'models': {
      const kind = /эмбеддинг/.test(p.q) ? 'embedding_model' : /ретривер/.test(p.q) ? 'retriever_model' : /реранкер/.test(p.q) ? 'reranker_model' : 'generator_model'
      const ru = { embedding_model: 'модели эмбеддингов', retriever_model: 'ретриверы', reranker_model: 'реранкеры', generator_model: 'генераторы' }[kind]
      const m = new Map<string, { name: string; pids: Set<string> }>()
      for (const pid of target) for (const c of ragConfigsOf(pid)) {
        const v = c[kind]
        if (!v.trim()) continue
        const e = m.get(low(v)) ?? { name: v, pids: new Set<string>() }
        e.pids.add(pid)
        m.set(low(v), e)
      }
      const list = [...m.values()].sort((a, c) => c.pids.size - a.pids.size || a.name.localeCompare(c.name))
      if (!list.length) return b.done(`${ru[0]!.toUpperCase() + ru.slice(1)} в этих статьях не указаны.${note}`, followUps(all, 'models'))
      b.cards.push({
        kind: 'ragTable', title: ru[0]!.toUpperCase() + ru.slice(1), cols: ['Название', 'Статей', 'Какие'],
        rows: list.slice(0, 15).map((e) => ({ cells: [e.name, String(e.pids.size), [...e.pids].slice(0, 6).join(', ') + (e.pids.size > 6 ? '…' : '')], pid: [...e.pids][0] })),
        note: list.length > 15 ? `Показаны 15 из ${list.length}` : undefined,
      })
      return b.done(`Нашлось: ${list.length}. Чаще всего (${ru}): ${list.slice(0, 3).map((e) => `${e.name} (${nStat(e.pids.size)})`).join(', ')}.${note}`, followUps(all, 'models'))
    }

    case 'count': {
      const t = ragTotals(target)
      return b.done(
        `${codes.length === 1 ? codes[0] : nStat(t.papers)}: ${fmtInt(t.results)} ${plural(t.results, 'значение', 'значения', 'значений')}, ${fmtInt(t.configurations)} ${plural(t.configurations, 'конфигурация', 'конфигурации', 'конфигураций')}, ${t.datasets} ${plural(t.datasets, 'датасет', 'датасета', 'датасетов')}, ${t.experiments} ${plural(t.experiments, 'эксперимент', 'эксперимента', 'экспериментов')}, ${nIss(t.issues)}.${note}`,
        followUps(all, 'count'),
      )
    }

    case 'compare': {
      const cmp = codes.length >= 2 ? target : []
      if (cmp.length < 2) {
        return b.done(`Для сравнения назовите две статьи, например «${help.find((h) => h.startsWith('Сравни')) ?? 'Сравни D001 и D003 по Answer F1'}».${note}`, help)
      }
      return best(b, p, cmp, true, note, all)
    }

    case 'best':
      return best(b, p, target, false, note, all)

    case 'paper': {
      for (const pid of target.slice(0, 3)) b.cards.push({ kind: 'ragPaper', pid })
      const lines = target.slice(0, 3).map((pid) => { const s = ragSummaryOf(pid); return `${pid}: ${fmtInt(s.results)} значений, ${fmtInt(s.configurations)} конфигураций, ${nIss(s.issues)}` })
      return b.done(`${lines.join('; ')}.${note}`, followUps(all, ''))
    }
  }
  return b.done(
    'Не удалось понять вопрос. Отвечаю по данным разбора: лучшее значение метрики, сравнение статей, замечания, датасеты, модели. Например: «Лучший Answer F1», «Сравни D001 и D003 по EM», «Замечания у D005», «Какие датасеты».',
    help,
  )
}

function best(b: Builder, p: Parsed, pids: string[], compare: boolean, note: string, all: string[]): CaseAnswer {
  const skip = compare ? 'compare' : 'best'
  let names = p.names
  let metricNote = ''
  if (!names.length) {
    const counts = new Map<string, Set<string>>()
    for (const pid of pids) for (const r of ragResultsOf(pid)) { const s = counts.get(r.metric_name) ?? new Set(); s.add(pid); counts.set(r.metric_name, s) }
    const top = [...counts].sort((a, c) => c[1].size - a[1].size)[0]
    if (p.metricBase === '' && /лучш|максим|худш|топ|best|сравн|сопостав|против|vs|разниц|отлича/.test(p.q) && top) {
      const base = baseOf(top[0])
      names = [...counts.keys()].filter((n) => baseOf(n) === base)
      metricNote = ` Метрика не названа, взял самую частую: ${top[0]}.`
    }
  }
  if (!names.length) {
    const tm = ragTopMetrics(pids, 5).map((m) => m.metric)
    return b.done(`Такой метрики в ${pids.length === 1 ? 'статье' : 'этих статьях'} не нашлось.${tm.length ? ' Самые частые: ' + tm.join(', ') + '.' : ''}${note}`, followUps(all, skip))
  }
  const bsAll = buckets(pids, names, p.k, p.dataset)
  const bsClean = buckets(pids, names, p.k, p.dataset, true)
  const bs = bsClean.length ? bsClean : bsAll
  if (!bsClean.length && bsAll.length) metricNote += ' Все найденные значения получены в симуляциях.'
  else if (bsClean.length && bsAll.length) {
    const dirA = ragDirection(bsAll[0]!.entries[0]!.row)
    const a = topEntry(bsAll[0]!, dirA, p.worst), c = topEntry(bsClean[0]!, dirA, p.worst)
    if (a && c && (a.row !== c.row) && ragValueOf(a.row) !== ragValueOf(c.row)) {
      metricNote += ` Без симуляций; с ними — ${ragFmtValue(a.row)}, «${q1(ragConfigNameOf(a.pid, a.row.config_id))}» (${a.pid}).`
    }
  }
  const metricTitle = ragMetricCase(p.metricBase ? names.find((n) => n.includes('@')) ?? names[0]! : names[0]!)
  if (!bs.length) return b.done(`${metricTitle}: подходящих значений в ${pids.length === 1 ? 'статье' : 'этих статьях'} нет${p.dataset ? ' на этом датасете' : ''}.${note}`, followUps(all, skip))
  const dir = ragDirection(bs[0]!.entries[0]!.row)
  const dirText = ragDirectionText(bs[0]!.entries[0]!.row)

  let main = bs[0]!
  if (compare) {
    const shared = bs.filter((x) => pids.every((pid) => x.entries.some((e) => e.pid === pid)))
    if (shared.length) main = shared[0]!
    else {
      const per = pids.map((pid) => bs.find((x) => x.entries.some((e) => e.pid === pid))?.entries.find((e) => e.pid === pid)).filter((e): e is Entry => !!e)
      if (per.length < 2) {
        const miss = pids.filter((pid) => !per.some((e) => e.pid === pid))
        return b.done(`${metricTitle} ${per.length ? 'найден только у ' + per[0]!.pid + '; у ' + miss.join(', ') + ' такого значения нет' : 'не нашёлся ни у ' + pids.join(', ') + ''}, сравнивать нечего.${note}`, followUps(all, skip))
      }
      const why = ragWhyNotComparable(per[0]!.row, per[1]!.row, { ignoreProtocol: true })
      b.cards.push({
        kind: 'ragTable', title: `${metricTitle}: значения без сравнения`, cols: ['Статья', 'Значение', 'Датасет и задача', 'Место в статье'],
        rows: per.map((e) => ({ cells: [e.pid, ragFmtValue(e.row), `${e.group.datasetName} · ${e.group.taskName}`, ragPlaceOf(e.row) || '—'], pid: e.pid, rid: e.row.result_id })),
        note: 'Лучшее не отмечено: условия измерения разные',
      })
      return b.done(
        `${per.map((e) => e.pid).join(' и ')} нельзя сравнивать по ${metricTitle} напрямую${why.length ? ': ' + why.join(', ') : ''}. ` +
        `Значения: ${per.map((e) => `${ragFmtValue(e.row)} у ${e.pid} ${b.cite(e.row)}`).join('; ')}.${metricNote}${note}`,
        followUps(all, skip),
      )
    }
  }
  if (!compare && (dir === 'higher' || dir === 'lower')) return bestTop(b, p, main, dir, dirText, metricTitle, bs.length - 1, metricNote, note, all, pids.length > 1, bs[1]?.datasetName ?? '')
  const es = main.entries.filter((e) => !compare || pids.includes(e.pid))
  const sorted = sortEntries(es, dir, p.worst)
  const hasDir = dir === 'higher' || dir === 'lower'
  const bestRow = hasDir ? sorted[0] : undefined
  const marks = hasDir && es.length > 1 && new Set(es.map((e) => ragValueOf(e.row))).size > 1
  b.cards.push({
    kind: 'ragTable', title: `${metricTitle}: ${main.datasetName}`, cols: COLS, rows: sorted.map((e) => tableRow(e, marks && e === sorted[0])),
    note: marks ? `${dirText[0]!.toUpperCase() + dirText.slice(1)}` : undefined,
  })
  const cond = condText(main)
  const others = bs.length - 1
  const protocols = new Set(es.map((e) => ragCompareProtocol(e.row)))
  const proto = es.length > 1 && protocols.size > 1 ? ' Протоколы оценки в статьях описаны по-разному — прочитайте их во вкладке «Эксперименты» перед выводами.' : ''
  const more = !p.dataset && others > 0 && !compare ? ` Есть ещё ${others} ${plural(others, 'набор условий', 'набора условий', 'наборов условий')}: уточните датасет, например «${bs[1]!.datasetName}».` : ''
  let text: string
  if (!hasDir) {
    text = `У метрики ${metricTitle} в данных не указано, что считать лучшим, поэтому «лучшее» не выбираю. Значения (${cond}): ${sorted.slice(0, 3).map((e) => `${ragFmtValue(e.row)} у ${e.pid} ${b.cite(e.row)}`).join('; ')}.`
  } else if (es.length === 1) {
    const e = sorted[0]!
    text = `${p.worst ? 'Худший' : 'Лучший'} ${metricTitle}${pids.length > 1 || compare ? ' у ' + e.pid : ''}: ${ragFmtValue(e.row)} (${cond}), конфигурация «${ragConfigNameOf(e.pid, e.row.config_id)}» ${b.cite(e.row)}. ${dirText[0]!.toUpperCase() + dirText.slice(1)}.${pids.length > 1 ? ' В этих условиях значения есть только у этой статьи, сравнивать не с чем.' : ''}`
  } else {
    const e = bestRow!
    text = `${p.worst ? 'Худший' : compare ? 'Выше всех' : 'Лучший'} ${metricTitle} — ${ragFmtValue(e.row)} у ${e.pid} ${b.cite(e.row)}, конфигурация «${ragConfigNameOf(e.pid, e.row.config_id)}». Сравнивал только значения в одинаковых условиях: ${cond}; ${dirText}. Сравнимы ${nStat(es.length)}.`
  }
  return b.done(`${text}${proto}${more}${metricNote}${note}`, followUps(all, skip))
}
const ragCompareProtocol = (r: RagResultRow) => low(ragExperiment(r.publication_id, r.experiment_id)?.evaluation_protocol ?? '')

const FIG_TEXT = 'считано с графика'
function bestTop(b: Builder, p: Parsed, main: Bucket, dir: RagDirection, dirText: string, metricTitle: string, others: number, metricNote: string, note: string, all: string[], manyPapers: boolean, otherDataset: string): CaseAnswer {
  const all0: Entry[] = []
  for (const { pid, group } of main.groups) for (const row of group.rows) if (ragValueOf(row) != null) all0.push({ pid, row, group })
  const seen = new Set<string>()
  const cands = sortEntries(all0, dir, p.worst).filter((e) => {
    const k = `${e.pid}|${ragConfigNameOf(e.pid, e.row.config_id)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const rank: Entry[] = []
  for (const e of cands) if (!rank.some((x) => x.pid === e.pid)) rank.push(e)
  const fig = (e: Entry) => ragFromFigure(e.row)
  const rowText = (e: Entry) => `${ragFmtValue(e.row)}${fig(e) ? ` (${FIG_TEXT})` : ''}`
  const cfg = (e: Entry) => ragConfigNameOf(e.pid, e.row.config_id)
  const cell = (e: Entry, lead: boolean, marks: boolean) => ({ ...tableRow(e, marks && lead), cells: [e.pid, rowText(e), cfg(e), ragPlaceOf(e.row) || '—'] })
  const word = p.worst ? 'Худший' : 'Лучший'
  const dirCap = dirText[0]!.toUpperCase() + dirText.slice(1)
  const sum = ` Сравнивал только значения в одинаковых условиях: ${condText(main)}; ${dirText}. Значений: ${fmtInt(all0.length)}, конфигураций: ${fmtInt(cands.length)}, статей: ${rank.length}.`
  const more = !p.dataset && others > 0 && otherDataset ? ` Есть ещё ${others} ${plural(others, 'набор условий', 'набора условий', 'наборов условий')}: уточните датасет, например «${otherDataset}».` : ''

  if (rank.length < 2) {
    const top = cands.slice(0, 3)
    const lead = top[0]!
    const marks = top.length > 1 && new Set(top.map((e) => ragValueOf(e.row))).size > 1
    b.cards.push({
      kind: 'ragTable', title: `${metricTitle}: лучшие конфигурации ${lead.pid}`, cols: COLS, rows: top.map((e) => cell(e, e === lead, marks)),
      note: `${dirCap}${top.some(fig) ? `; «${FIG_TEXT}» — значение приблизительное` : ''}`,
    })
    const next = top.slice(1).map((e) => `${rowText(e)} — «${q1(cfg(e))}» ${b.cite(e.row)}`)
    const head = `${metricTitle} на этом датасете есть только в статье ${lead.pid}, поэтому сравнивать статьи не с чем. ${word} результат в ней — ${ragFmtValue(lead.row)}${fig(lead) ? ` (${FIG_TEXT}, приблизительное значение)` : ''}: конфигурация «${q1(cfg(lead))}» ${b.cite(lead.row)}.`
    const tail = next.length ? ` Следом конфигурации этой же статьи: ${next.join('; ')}.` : ' Других конфигураций в этих условиях нет.'
    return b.done(`${head}${tail}${sum}${more}${metricNote}${note}`, followUps(all, 'best'))
  }

  const top = rank.slice(0, 5)
  const lead = top[0]!
  const marks = new Set(top.map((e) => ragValueOf(e.row))).size > 1
  b.cards.push({
    kind: 'ragTable', title: `${metricTitle}: ${main.datasetName}`, cols: COLS, rows: top.map((e) => cell(e, e === lead, marks)),
    note: `Рейтинг статей: по одному лучшему значению на статью. ${dirCap}${top.some(fig) ? `; «${FIG_TEXT}» — значение приблизительное` : ''}`,
  })
  const next = top.slice(1, 4).map((e) => `${e.pid} — ${rowText(e)}, «${q1(cfg(e))}» ${b.cite(e.row)}`)
  const leadText = `${word} ${metricTitle}${manyPapers ? ' у ' + lead.pid : ''} — ${ragFmtValue(lead.row)}: конфигурация «${q1(cfg(lead))}», статья ${lead.pid} ${b.cite(lead.row)}`
  const figNote = fig(lead) ? ` Это значение ${FIG_TEXT}, оно приблизительное.` : ''
  return b.done(`${leadText}.${figNote} Следом по статьям: ${next.join('; ')}.${sum}${more}${metricNote}${note}`, followUps(all, 'best'))
}
