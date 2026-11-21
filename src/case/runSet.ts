import { isRejected, resultsOf } from './index'
import { ragIsRejected, ragResultsOf } from './rag'
import { TABLE_NAMES, buildSubmission, downloadRunSubmission, downloadZip, submissionToast } from './export'
import { runOf, runPapers } from './runs'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { toast } from '../store'

export async function downloadRunSet(runId: string) {
  const r = runOf(runId)
  if (!r) return
  if (r.remote) { await (await import('../api/runs')).downloadServerSet(runId); return }
  const ps = runPapers(r.id)
  const name = r.title.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'разбор'
  if (r.domain === 'rag') {
    const sm = await downloadRunSubmission(r.id, ps, `Набор для сдачи — ${name}.zip`)
    const rejected = ps.reduce((n, p) => n + ragResultsOf(p).filter(ragIsRejected).length, 0)
    toast(`${submissionToast(sm)}${rejected ? ` · отклонённые вами (${rejected}) не вошли` : ''}`)
    return
  }
  const t = buildSubmission(ps, { scope: r.id })
  const rejected = ps.reduce((s, p) => s + resultsOf(p).filter(isRejected).length, 0)
  downloadZip(t, `Набор для сдачи — ${name}.zip`)
  const n = TABLE_NAMES.length
  toast(`Скачано: ${n} ${plural(n, ['таблица', 'таблицы', 'таблиц'])}, ${fmtInt(t.results.length)} ${plural(t.results.length, ['значение', 'значения', 'значений'])}${rejected ? ` · отклонённые вами (${rejected}) не вошли` : ''}`)
}
