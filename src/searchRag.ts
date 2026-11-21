import { norm, plural, type CHit, type CScope, type CaseSearchOpts, type Cmd } from './search'
import { keyText } from './keys'
import { runs } from './case/runs'
import { isIssueOpen } from './case'
import { fmtInt } from './fmt'
import {
  ragCheckLabel, ragMetricCase, ragConfigName, ragConfigNameOf, ragConfigsOf, ragDatasetsOf, ragFmtValue, ragInScope, ragIssuesOf, ragLoaded, ragMetricName, ragPlaceOf,
  ragPublications, ragResultsOf, ragSummaryOf,
} from './case/rag'

type Out = Record<Exclude<CScope, 'all'>, CHit[]>

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)
function wordScore(n: string, w: string): number {
  let i = n.indexOf(w)
  if (i < 0) return 0
  if (n.length === w.length) return 5
  if (i === 0) return 3
  while (i >= 0) {
    if (!isWordChar(n[i - 1])) return 2
    i = n.indexOf(w, i + 1)
  }
  return 1
}
function score(fields: [string, number][], words: string[]): number {
  let total = 0
  for (const w of words) {
    let best = 0
    for (const [n, wt] of fields) best = Math.max(best, wordScore(n, w) * wt)
    if (!best) return 0
    total += best
  }
  return total
}

export function searchRag(words: string[], commands: Cmd[], o: CaseSearchOpts = {}): Out {
  const any = words.length > 0
  const out: Out = { paper: [], run: [], value: [], cond: [], issue: [], command: [] }
  const pubs = ragPublications().filter((p) => !o.pids || o.pids.has(p.publication_id))
  const from = (pid: string) => (!o.here || o.here.has(pid) ? '' : ' · не из этого разбора')

  for (const p of pubs) {
    const pid = p.publication_id
    const sm = ragSummaryOf(pid)
    const s = score([[norm(pid), 6], [norm(p.title), 5], [norm(p.authors), 2], [p.year, 2], [norm(p.DOI), 1]], words)
    if (any && !s) continue
    const open = ragLoaded(pid) ? ragIssuesOf(pid).filter((i) => isIssueOpen(pid, i.issue_id, 'rag')).length : sm.issues
    out.paper.push({
      id: 'ra:' + pid, kind: 'paper', ref: pid, pid, domain: 'rag', title: `${pid} · ${p.title}`, icon: 'doc', score: s, dot: open > 0,
      meta: [p.year, !ragInScope(pid) ? 'не по теме' : open ? `${open} ${plural(open, ['замечание', 'замечания', 'замечаний'])}` : ''].filter(Boolean).join(' · ') + from(pid),
    })
  }
  for (const r of [...runs].filter((x) => x.domain === 'rag').sort((a, b) => b.createdAt - a.createdAt)) {
    const s = score([[norm(r.title), 5]], words)
    if (any && !s) continue
    const n = r.files.length
    out.run.push({ id: 'r:' + r.id, kind: 'run', ref: r.id, title: r.title, meta: `${n} ${plural(n, ['файл', 'файла', 'файлов'])}`, icon: 'folder', score: s })
  }

  if (any) {
    for (const p of pubs) {
      const pid = p.publication_id
      for (const [name, n] of ragSummaryOf(pid).metrics) {
        const s = score([[norm(name), 5], [norm(pid), 3]], words)
        if (!s) continue
        out.value.push({
          id: 'rm:' + pid + ':' + name, kind: 'value', ref: name, pid, domain: 'rag', query: { m: ragMetricCase(name) },
          title: `${ragMetricCase(name)} · ${pid}`, meta: `${fmtInt(n)} ${plural(n, ["значение", "значения", "значений"])}${from(pid)}`, icon: 'table', score: s,
        })
      }
    }
    const NUMW = /^\d+(?:\.\d+)?$/
    const numW = words.filter((w) => NUMW.test(w))
    const textW = words.filter((w) => !NUMW.test(w))
    if (numW.length) {
      let found = 0
      for (const p of pubs) {
        if (found > 60 || !ragLoaded(p.publication_id)) continue
        for (const r of ragResultsOf(p.publication_id)) {
          const toks = [...norm(`${r.normalized_value} ${r.raw_value}`).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
          let ns = 0
          for (const w of numW) {
            const b = toks.reduce((a, t) => (t === w ? 6 : t.startsWith(w) ? Math.max(a, 4) : a), 0)
            if (!b) { ns = 0; break }
            ns += b
          }
          if (!ns) continue
          let s = ns
          if (textW.length) {
            const t = score([[norm(ragMetricName(r)), 4], [norm(r.publication_id), 3]], textW)
            if (!t) continue
            s += t
          }
          found++
          out.value.push({
            id: 'rv:' + r.publication_id + ':' + r.result_id, kind: 'value', ref: r.result_id, pid: r.publication_id, domain: 'rag', query: { r: r.result_id },
            title: `${ragMetricName(r)} · ${r.publication_id}`, value: ragFmtValue(r),
            meta: [ragConfigNameOf(r.publication_id, r.config_id), ragPlaceOf(r)].filter(Boolean).join(' · ') + from(r.publication_id), icon: 'table', score: s,
          })
          if (found > 60) break
        }
      }
    }

    for (const p of pubs) {
      const pid = p.publication_id
      if (!ragLoaded(pid)) continue
      for (const d of ragDatasetsOf(pid)) {
        const s = score([[norm(d.dataset_name || d.dataset_id), 6], [norm(pid), 2], [norm(d.dataset_version), 1]], words)
        if (!s) continue
        out.cond.push({
          id: 'rd:' + pid + ':' + d.dataset_id, kind: 'cond', ref: d.dataset_id, pid, domain: 'rag', query: { ds: d.dataset_id },
          title: d.dataset_name || d.dataset_id, meta: `датасет · ${pid}${from(pid)}`, icon: 'table', score: s,
        })
      }
      for (const c of ragConfigsOf(pid)) {
        const name = ragConfigName(c)
        const s = score([[norm(name), 5], [norm(c.generator_model), 3], [norm(c.embedding_model), 3], [norm(c.retriever_model), 3], [norm(pid), 2]], words)
        if (!s) continue
        out.cond.push({
          id: 'rc:' + pid + ':' + c.config_id, kind: 'cond', ref: c.config_id, pid, domain: 'rag', query: { cfg: c.config_id },
          title: name, meta: `конфигурация · ${pid}${from(pid)}`, icon: 'layers', score: s,
        })
      }
    }
  }

  for (const p of pubs) {
    const pid = p.publication_id
    if (!ragLoaded(pid)) continue
    for (const i of ragIssuesOf(pid)) {
      const s = score([[norm(ragCheckLabel(i.check_name)), 4], [norm(i.description), 2], [norm(pid), 3]], words)
      if (any && !s) continue
      const open = isIssueOpen(pid, i.issue_id, 'rag')
      out.issue.push({
        id: 'ri:' + pid + ':' + i.issue_id, kind: 'issue', ref: i.issue_id, pid, domain: 'rag', title: ragCheckLabel(i.check_name),
        meta: `${pid}${i.source_page ? ' · стр. ' + i.source_page : ''}${open ? '' : ' · закрыто'}${from(pid)}`, icon: 'warn', dot: open, score: s,
      })
    }
  }

  for (const c of commands) {
    const s = score([[norm(c.title), 4], [norm(c.keywords), 2], [norm(c.desc), 1]], words)
    if (any && !s) continue
    out.command.push({ id: 'k:' + c.id, kind: 'command', ref: c.id, title: c.title, meta: c.keys ? keyText(c.keys) : '', icon: c.icon, score: s })
  }
  if (any) for (const k of Object.keys(out) as (keyof Out)[]) out[k].sort((a, b) => b.score - a.score)
  out.value = out.value.slice(0, 80)
  out.cond = out.cond.slice(0, 80)
  return out
}
