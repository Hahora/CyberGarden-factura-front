import type { BackEntry } from './viewState'
import { DATA_HIDDEN, DATA_TABS } from './dataTabs'
import { chatOf, projectOf } from './store'
import { runOf } from './case/runs'
import { parsePaperPath } from './case'

export function backWhere(t: BackEntry): { short: string; full: string } {
  const p = t.path
  if (p.startsWith('/run/')) {
    const r = runOf(p.slice(5))
    return r ? { short: `К разбору «${r.title}»`, full: `К разбору «${r.title}»` } : { short: 'К разбору', full: 'К разбору' }
  }
  if (p.startsWith('/paper/')) {
    const pid = parsePaperPath(p)?.pid ?? decodeURIComponent(p.slice(7))
    return { short: `К статье ${pid}`, full: `К статье ${pid}` }
  }
  if (p.startsWith('/c/')) {
    const c = chatOf(p.slice(3))
    const isChat = !c || c.kind === 'ask' || t.fullPath.includes('view=chat')
    const what = isChat ? 'К чату' : 'К статье'
    if (!c) return { short: what, full: what }
    return { short: `${what} «${c.title}»`, full: `${what} «${c.title}»` }
  }
  if (p.startsWith('/p/')) {
    const n = projectOf(p.slice(3))?.name ?? ''
    return { short: `К проекту «${n}»`, full: `К проекту «${n}»` }
  }
  const hidden = DATA_HIDDEN.find((x) => p === x.to)
  if (hidden) return { short: hidden.label, full: `Вернуться: «${hidden.label}»` }
  const tab = DATA_TABS.find((x) => p === x.to)
  if (tab) return { short: tab.label, full: `Вернуться в «${tab.label}»` }
  if (p === '/app') return { short: 'На главную', full: 'На главную' }
  return { short: 'Назад', full: 'Назад' }
}
