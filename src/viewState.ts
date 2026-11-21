import { effectScope, nextTick, onBeforeUnmount, onMounted, reactive, watch, type Ref } from 'vue'
import { useRoute, type RouteLocationRaw, type Router } from 'vue-router'

const states = new Map<string, object>()
const scrolls = new Map<string, { top: number; left: number }>()

const SS = 'gs:vs:'
function ssGet<T>(k: string): T | null {
  try {
    const v = sessionStorage.getItem(SS + k)
    return v == null ? null : (JSON.parse(v) as T)
  } catch {
    return null
  }
}
function ssSet(k: string, v: unknown) {
  try {
    sessionStorage.setItem(SS + k, JSON.stringify(v))
  } catch {
  }
}

export function useViewState<T extends object>(name: string, init: () => T): T {
  const route = useRoute()
  const key = route.path + '#' + name
  let s = states.get(key) as T | undefined
  if (!s) {
    const saved = ssGet<Partial<T>>('st:' + key)
    s = reactive({ ...init(), ...(saved ?? {}) }) as T
    states.set(key, s)
    let t = 0
    const obj = s
    effectScope(true).run(() =>
      watch(obj, () => {
        clearTimeout(t)
        t = window.setTimeout(() => ssSet('st:' + key, obj), 250)
      }, { deep: true }),
    )
  }
  return s
}

const seen = new Set<string>()
export function firstVisit(path: string): boolean {
  if (seen.has(path)) return false
  seen.add(path)
  return true
}

export function useScrollMemory(el: Ref<HTMLElement | null | undefined>, name: string) {
  const route = useRoute()
  const key = route.path + '#' + name
  if (!scrolls.has(key)) {
    const saved = ssGet<{ top: number; left: number }>('sc:' + key)
    if (saved) scrolls.set(key, saved)
  }
  const had = scrolls.has(key)
  let raf = 0
  let cur: HTMLElement | null = null
  const save = () => {
    if (cur && cur.isConnected) {
      const v = { top: cur.scrollTop, left: cur.scrollLeft }
      scrolls.set(key, v)
      ssSet('sc:' + key, v)
    }
  }
  const onScroll = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(save)
  }
  const attach = (e: HTMLElement | null | undefined) => {
    if (cur === e) return
    if (cur) {
      save()
      cur.removeEventListener('scroll', onScroll)
    }
    cur = e ?? null
    if (!cur) return
    cur.addEventListener('scroll', onScroll, { passive: true })
    const pos = scrolls.get(key)
    if (!pos) return
    const target = cur
    let n = 0
    const apply = () => {
      target.scrollTop = pos.top
      target.scrollLeft = pos.left
      if ((Math.abs(target.scrollTop - pos.top) > 2 || Math.abs(target.scrollLeft - pos.left) > 2) && ++n < 30) requestAnimationFrame(apply)
    }
    apply()
  }
  onMounted(() => void nextTick(() => attach(el.value)))
  watch(el, (e) => void nextTick(() => attach(e)), { flush: 'post' })
  onBeforeUnmount(() => {
    save()
    cur?.removeEventListener('scroll', onScroll)
    cancelAnimationFrame(raf)
  })
  return { had }
}

export interface BackEntry { fullPath: string; path: string }
export const backStack = reactive<BackEntry[]>([])
let deepPending = false

export function openDeep(router: Router, to: RouteLocationRaw) {
  const cur = router.currentRoute.value
  backStack.push({ fullPath: cur.fullPath, path: cur.path })
  if (backStack.length > 10) backStack.shift()
  deepPending = true
  return router.push(to)
}

export function goBack(router: Router) {
  const top = backStack[backStack.length - 1]
  if (!top) return router.back()
  const prev = (window.history.state as { back?: string } | null)?.back
  if (prev === top.fullPath) return router.back()
  backStack.pop()
  return router.push(top.fullPath)
}

export function trackNavigation(toFullPath: string, toPath: string, fromPath: string) {
  if (deepPending) {
    deepPending = false
    return
  }
  const top = backStack[backStack.length - 1]
  if (!top) return
  if (top.fullPath === toFullPath || (top.path === toPath && toPath !== fromPath)) {
    backStack.pop()
    return
  }
  if (toPath === fromPath) return
  backStack.splice(0)
}
