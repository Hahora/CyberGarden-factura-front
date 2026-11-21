import { FEATURES } from './features'
import { computed, reactive, ref, watch, type Ref } from 'vue'
import type { LocationQueryRaw, RouteLocationNormalized } from 'vue-router'
import { parsePaperPath, ragLoadAll, ragLoaded, reviewScope, setReviewScope, type Domain } from './case'
import { runOf, runPapers, sortedRuns } from './case/runs'
import { isRemoteScope, paperLoaded, paperOf } from './api/papers'
import { isApi } from './config'

export const DATA_TABS = [
  { to: '/facts', label: 'Таблица', icon: 'table' },
  { to: '/checks', label: 'Проверки', icon: 'shield' },
  ...(FEATURES.compare ? [{ to: '/compare', label: 'Сравнение', icon: 'columns' }] : []),
  ...(FEATURES.graph ? [{ to: '/graph', label: 'Связи', icon: 'graph' }] : []),
  { to: '/passport', label: 'Паспорт', icon: 'book' },
  ...(isApi ? [{ to: '/citations', label: 'Цитирования', icon: 'quote' }] : []),
  { to: '/export', label: 'Экспорт', icon: 'export' },
] as const
export const DATA_HIDDEN = [
  { to: '/history', label: 'Журнал правок', icon: 'history' },
] as const
export const DATA_PATHS: string[] = [...DATA_TABS, ...DATA_HIDDEN].map((t) => t.to)

const KEY = 'gs:dataRun'
let saved = ''
try { saved = sessionStorage.getItem(KEY) ?? '' } catch { }
export const dataRun = ref(saved)
export function setDataRun(id: string) {
  dataRun.value = id
  try { sessionStorage.setItem(KEY, id) } catch { }
  if (id && runOf(id)) setReviewScope(id)
}
export function ensureDataRun(): string {
  if (dataRun.value && runOf(dataRun.value)) return dataRun.value
  const id = sortedRuns()[0]?.id ?? ''
  setDataRun(id)
  return id
}
ensureDataRun()
export const dataDomain = computed<Domain>(() => (dataRun.value ? runOf(dataRun.value)?.domain ?? 'solar' : 'solar'))
export const dataPids = computed<string[]>(() => (dataRun.value && runOf(dataRun.value) ? runPapers(dataRun.value) : []))

export function useDataReady(pids: Ref<string[]>, domain: Ref<Domain> = dataDomain) {
  const ragReady = useRagReady(pids, domain)
  return computed(() => {
    if (domain.value === 'rag') return ragReady.value
    const run = reviewScope.value
    if (!isApi || !isRemoteScope(run)) return true
    return pids.value.every((p) => (paperOf(run, p), paperLoaded(run, p)))
  })
}
function useRagReady(pids: Ref<string[]>, domain: Ref<Domain>) {
  const ready = ref(domain.value !== 'rag' || pids.value.every(ragLoaded))
  watch([pids, domain, reviewScope], async ([ps, d, sc]) => {
    if (d !== 'rag') { ready.value = true; return }
    ready.value = ps.every(ragLoaded)
    if (ready.value) return
    if (isApi && !isRemoteScope(sc)) return
    await ragLoadAll(ps)
    if (pids.value === ps && reviewScope.value === sc) ready.value = true
  }, { immediate: true })
  return ready
}

const runHas = (id: string, pid: string, domain: Domain = 'solar') => { const r = runOf(id); return !!r && (r.domain ?? 'solar') === domain && r.files.some((f) => f.id === pid) }

export function runForPaper(pid: string, domain: Domain = 'solar'): string {
  return [reviewScope.value, dataRun.value, ...sortedRuns().sort((a, b) => b.createdAt - a.createdAt).map((r) => r.id)].find((x) => x && runHas(x, pid, domain)) ?? ''
}
export function followRun(to: Pick<RouteLocationNormalized, 'path' | 'query'>) {
  const q = to.query.run
  const fromQuery = typeof q === 'string' ? q : Array.isArray(q) ? q[0] ?? '' : ''
  if (fromQuery === 'all') { ensureDataRun(); return }
  if (fromQuery && runOf(fromQuery)) return setDataRun(fromQuery)
  if (to.path.startsWith('/run/')) {
    const id = decodeURIComponent(to.path.slice(5))
    if (runOf(id)) {
      if (dataRun.value !== id) setDataRun(id)
      setReviewScope(id)
    }
    return
  }
  if (to.path.startsWith('/paper/')) {
    const { pid, domain } = parsePaperPath(to.path) ?? { pid: decodeURIComponent(to.path.slice(7)), domain: 'solar' as Domain }
    if (runHas(reviewScope.value, pid, domain)) return
    const id = [dataRun.value, ...sortedRuns().sort((a, b) => b.createdAt - a.createdAt).map((r) => r.id)].find((x) => x && runHas(x, pid, domain))
    if (id) setReviewScope(id)
    return
  }
  if (DATA_PATHS.includes(to.path) && dataRun.value && runOf(dataRun.value)) setReviewScope(dataRun.value)
}
export const dataLink = (path: string, runId?: string, query: LocationQueryRaw = {}) => ({ path, query: runId ? { ...query, run: runId } : query })
export const dataRunTitle = computed(() => (dataRun.value && runOf(dataRun.value)?.title) || 'Разбор')

const RF = 'gs:rf:'
const filters = new Map<string, { run: string; init: () => object; v: object }>()
export function useRunFilter<T extends object>(name: string, init: () => T): T {
  const have = filters.get(name)
  if (have) return have.v as T
  const read = (): { run: string; v: Partial<T> } | null => {
    try { return JSON.parse(sessionStorage.getItem(RF + name) ?? 'null') as { run: string; v: Partial<T> } | null } catch { return null }
  }
  const saved = read()
  const v = reactive({ ...init(), ...(saved && saved.run === dataRun.value ? saved.v : {}) }) as T
  const entry = { run: dataRun.value, init, v }
  filters.set(name, entry)
  watch(v, () => { try { sessionStorage.setItem(RF + name, JSON.stringify({ run: entry.run, v })) } catch { } }, { deep: true })
  return v
}
export function resetRunFilter(name: string) {
  const f = filters.get(name)
  if (f) Object.assign(f.v, f.init())
}
watch(dataRun, (id) => {
  for (const f of filters.values()) {
    f.run = id
    Object.assign(f.v, f.init())
  }
})

export const exportPick = ref<Set<string> | null>(null)
