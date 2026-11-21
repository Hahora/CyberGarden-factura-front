import { isRejected, resultsOf } from './index'
import { ragIsRejected, ragResultsOf } from './rag'
import { TABLE_NAMES, buildSubmission, downloadJson, downloadRunSubmission, downloadXlsx, downloadZip, submissionToast } from './export'
import { download } from '../exporters'
import { runOf, runPapers } from './runs'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { toast } from '../store'

const fileStem = (title: string) => title.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'разбор'

export async function downloadRunPassport(runId: string, fmt: 'md' | 'json') {
  const r = runOf(runId)
  if (!r) return
  const name = `Паспорт набора — ${fileStem(r.title)}.${fmt}`
  const mime = fmt === 'md' ? 'text/markdown;charset=utf-8' : 'application/json'
  if (r.remote) {
    const { request, ApiError } = await import('../api/client')
    try {
      const res = await request<Response>(`/runs/${encodeURIComponent(runId)}/passport.${fmt}`, { raw: true, silent: true })
      download(name, await res.blob(), mime)
      toast(fmt === 'md' ? 'Скачан паспорт набора (Markdown)' : 'Скачан паспорт набора (JSON)')
    } catch (e) { toast(e instanceof ApiError && e.code !== 'network' ? e.message : 'Не удалось скачать паспорт') }
    return
  }
  const p = await import('../passport')
  download(name, fmt === 'md' ? p.passportMD([r.domain]) : JSON.stringify(p.passportJSON([r.domain]), null, 2), mime)
  toast(fmt === 'md' ? 'Скачан паспорт набора (Markdown)' : 'Скачан паспорт набора (JSON)')
}

export async function downloadRunData(runId: string, fmt: 'json' | 'xlsx'): Promise<boolean> {
  const r = runOf(runId)
  if (!r) return false
  if (r.remote) { await (await import('../api/runs')).downloadServerData(runId, fmt); return true }
  if (r.domain === 'rag') return false
  const t = buildSubmission(runPapers(r.id), { scope: r.id })
  if (fmt === 'json') downloadJson(t, `submission-${r.id}.json`)
  else downloadXlsx(t, `results-${r.id}.xlsx`)
  toast(`Скачан файл ${fmt === 'json' ? 'JSON' : 'Excel'}: ${fmtInt(t.results.length)} ${plural(t.results.length, ['значение', 'значения', 'значений'])}`)
  return true
}

export async function downloadRunSet(runId: string) {
  const r = runOf(runId)
  if (!r) return
  if (r.remote) { await (await import('../api/runs')).downloadServerSet(runId); return }
  const ps = runPapers(r.id)
  const name = fileStem(r.title)
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
