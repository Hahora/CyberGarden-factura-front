<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { keyText, shortcut } from '../keys'
import Icon from './Icon.vue'
import UiLoad from './UiLoad.vue'
import UiSpinner from './UiSpinner.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiEmpty from './UiEmpty.vue'
import { runsLoad } from '../api/state'
import { loadRun } from '../api/runs'
import { reloadRuns } from '../api/auth'
import { askConfirm, askText } from '../prompt'
import { DATA_PATHS } from '../dataTabs'
import {
  state, chatsOf, chatOf, openIssues, paperOf, sortedProjects, picker, toast, pinChat, pinnedChats, initials, ACCENTS,
  renameChat, renameProject, moveChat, deleteChat, deleteProject, togglePin,
  type Chat, type Project,
} from '../store'
import { sevDot } from '../query'
import { FEATURES } from '../features'
import { isApi } from '../config'
import { logout as apiLogout } from '../api/auth'
import { openIssuesOf, paperPath, publication, ragPublication, type Domain } from '../case'
import { ragTitleIn } from '../case/ragData'
import { isRemoteScope, paperOf as apiPaperOf } from '../api/papers'
import { deleteRun, inbox, renameRun, runOf, runPapers, sortedRuns, togglePinRun } from '../case/runs'
import { downloadRunSubmission, submissionToast } from '../case/export'

const route = useRoute()
const router = useRouter()
const outBusy = ref(false)
async function signOut() {
  if (outBusy.value) return
  if (!isApi) { closeMenu(); return toast('Это демо — выходить некуда') }
  outBusy.value = true
  try { await apiLogout(); closeMenu(); void router.push('/login') } finally { outBusy.value = false }
}

const activeChatId = computed(() => (route.path.startsWith('/c/') ? String(route.params.id ?? '') : ''))
const activeProjectId = computed(() => (route.path.startsWith('/p/') ? String(route.params.id ?? '') : ''))
const rail = computed(() => !state.sidebar && !state.mobile)

const W_KEY = 'gs:v1:sidebar-w'
const W_DEF = 272
const W_MIN = 220
const W_MAX = 420
const clampW = (v: number) => Math.round(Math.max(W_MIN, Math.min(W_MAX, v)))
const width = ref(W_DEF)
try {
  const v = Number(localStorage.getItem(W_KEY))
  if (v) width.value = clampW(v)
} catch { }
watchEffect(() => {
  if (state.mobile) document.documentElement.style.removeProperty('--sidebar')
  else document.documentElement.style.setProperty('--sidebar', width.value + 'px')
})
const saveW = () => { try { localStorage.setItem(W_KEY, String(width.value)) } catch { } }
const dragW = ref(false)
let x0 = 0
let w0 = 0
function barDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragW.value = true
  x0 = e.clientX
  w0 = width.value
  document.documentElement.classList.add('is-resizing-x')
}
function barMove(e: PointerEvent) {
  if (!dragW.value) return
  const next = w0 + (e.clientX - x0)
  if (next < W_MIN - 48) {
    width.value = w0
    barStop()
    state.sidebar = false
    return
  }
  width.value = clampW(next)
}
function barStop() {
  if (!dragW.value) return
  dragW.value = false
  document.documentElement.classList.remove('is-resizing-x')
  saveW()
}
function barReset() {
  width.value = W_DEF
  saveW()
}
function barKey(e: KeyboardEvent) {
  const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
  if (!d) return
  e.preventDefault()
  width.value = clampW(width.value + d * (e.shiftKey ? 64 : 16))
  saveW()
}
onBeforeUnmount(() => document.documentElement.classList.remove('is-resizing-x'))

const hist = ref<{ x: number; y: number } | null>(null)
const histEl = ref<HTMLElement | null>(null)
const lastChats = computed(() => [...state.chats].filter((c) => c.kind === 'paper' || c.turns.length).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10))
function toggleHist(e: MouseEvent) {
  e.stopPropagation()
  if (hist.value) return (hist.value = null)
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hist.value = { x: r.right + 8, y: r.top }
  void nextTick(() => {
    const h = histEl.value
    if (h && hist.value) hist.value.y = Math.max(8, Math.min(hist.value.y, window.innerHeight - h.offsetHeight - 8))
  })
}
function openHist(c: Chat) {
  hist.value = null
  void router.push('/c/' + c.id)
}

const projectsOpen = ref(true)
const recentOpen = ref(true)
const expanded = ref<Record<string, boolean>>({})
const LIMIT = 5
const SUB_MAX = 8
const subAll = ref<Record<string, boolean>>({})
const subExpanded = (id: string) => !!subAll.value[id] || runPapersOf(id).slice(SUB_MAX).some((f) => f.id === activePid.value)

function visibleChats(p: Project): Chat[] {
  const all = chatsOf(p.id)
  return expanded.value[p.id] ? all : all.slice(0, LIMIT)
}

const groups = computed(() => {
  const d = new Date()
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const day = 864e5
  const out: { label: string; chats: Chat[] }[] = [
    { label: 'Сегодня', chats: [] },
    { label: 'Вчера', chats: [] },
    { label: 'На этой неделе', chats: [] },
    { label: 'Раньше', chats: [] },
  ]
  for (const c of chatsOf(null).filter((x) => !x.pinned)) {
    const t = c.updatedAt
    const i = t >= today ? 0 : t >= today - day ? 1 : t >= today - 6 * day ? 2 : 3
    out[i]!.chats.push(c)
  }
  return out.filter((g) => g.chats.length)
})

function status(c: Chat) {
  if (c.kind !== 'paper') return null
  const p = paperOf(c.paperId)
  if (!p) return null
  if (p.processing < 100) return { type: 'ring' as const, pct: Math.floor(p.processing) }
  const open = openIssues(p)
  const worst = open.find((i) => i.level === 'conflict') ?? open[0]
  return open.length ? { type: 'issues' as const, n: open.length, dot: sevDot(worst!.level) } : null
}
const issueTip = (n: number) => `Есть ${n === 1 ? 'замечание' : 'замечания'}: ${n}`
const CIRC = 2 * Math.PI * 7

const go = (to: string | { path: string; query?: Record<string, string> }) => router.push(to)

const activeRunId = computed(() => (route.path.startsWith('/run/') ? String(route.params.id ?? '') : ''))
const activePid = computed(() => (route.path.startsWith('/paper/') ? String(route.params.pid ?? '') : ''))
const lastRun = ref('')
watchEffect(() => { if (activeRunId.value) lastRun.value = activeRunId.value })
const queryRun = computed(() => (typeof route.query.run === 'string' && runOf(route.query.run) ? route.query.run : ''))
watchEffect(() => { if (queryRun.value) lastRun.value = queryRun.value })
const openRunId = computed(() => activeRunId.value || (activePid.value && runOf(lastRun.value)?.files.some((f) => f.id === activePid.value) ? lastRun.value : ''))
const OPEN_KEY = 'gs:v1:runs-open'
const runOpen = reactive<Record<string, boolean>>({})
try { Object.assign(runOpen, JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}')) } catch { }
watch(runOpen, (v) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(v)) } catch { } }, { deep: true })
watch(openRunId, (id) => {
  if (!id) return
  for (const k of Object.keys(runOpen)) if (k !== id) runOpen[k] = false
  if (runOpen[id] === undefined) runOpen[id] = true
}, { immediate: true })
const isRunOpen = (id: string) => !!runOpen[id]
const filesLoading = (id: string) => { const r = runOf(id) as (ReturnType<typeof runOf> & { detail?: boolean }) | undefined; return isApi && !!r?.remote && !r.detail }
watchEffect(() => { for (const r of sortedRuns()) if (isRunOpen(r.id) && filesLoading(r.id) && !asked.has(r.id)) { asked.add(r.id); void loadRun(r.id) } })
const asked = new Set<string>()
const toggleRun = (id: string) => void (runOpen[id] = !runOpen[id])
function clickRun(id: string) {
  if (activeRunId.value === id) return toggleRun(id)
  runOpen[id] = true
  go('/run/' + id)
}
function downloadRun(id: string) {
  closeMenu()
  const r = runOf(id)
  if (!r) return
  const name = r.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'разбор'
  void downloadRunSubmission(id, runPapers(id), `Набор для сдачи — ${name}.zip`).then((s) => { if (s.tables) toast(submissionToast(s)) })
}
const runsOpen = ref(true)
const fileLabel = (f: { id: string; name?: string }) => (f.name || f.id).replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()
const runLabel = (r: { id: string; title: string; createdAt?: number; created_at?: string }) => {
  const same = sortedRuns().filter((x) => x.title === r.title).length > 1
  const t = r.createdAt ?? (r.created_at ? Date.parse(r.created_at) : NaN)
  return same && Number.isFinite(t) ? `${r.title}, ${new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : r.title
}
const runPapersOf = (id: string) => (runOf(id)?.files ?? []).filter((f) => f.reason !== 'не PDF')
const paperTitle = (pid: string, domain: Domain = 'solar', runId = '') => {
  if (isApi && runId && isRemoteScope(runId)) return domain === 'rag' ? ragTitleIn(pid, runId) : (apiPaperOf(runId, pid)?.publication?.title ?? '')
  return (domain === 'rag' ? ragPublication(pid) : publication(pid))?.title ?? ''
}
const openN = (pid: string, domain: Domain = 'solar') => openIssuesOf(pid, domain).length
const openTip = (pid: string, domain: Domain = 'solar') => { const n = openN(pid, domain); return `Открытых замечаний: ${n} — нужно проверить` }
async function renameRunAsk(id: string) {
  closeMenu()
  const r = runOf(id)
  if (!r) return
  const name = await askText({ title: 'Переименовать разбор', value: r.title, placeholder: 'Название' })
  if (name != null) renameRun(id, name)
}
async function doDeleteRun(id: string) {
  closeMenu()
  if (isApi && !(await askConfirm('Удалить разбор?', `«${runOf(id)?.title ?? ''}» и все правки в нём будут удалены. Вернуть разбор нельзя.`))) return
  if (activeRunId.value === id) go('/app')
  deleteRun(id)
}
function newRun() {
  if (route.path === '/app') inbox.clear++
  else go('/app')
}
function openProject(p: Project) {
  if (renaming.value?.id === p.id) return
  p.open = activeProjectId.value === p.id ? !p.open : true
  go('/p/' + p.id)
}
function newAsk(projectId: string | null) {
  if (projectId) {
    const p = state.projects.find((x) => x.id === projectId)
    if (p) p.open = true
    go('/p/' + projectId)
  } else go('/app')
}
const K = (id: string) => keyText(shortcut(id))
const markOf = (p: Project) => ({ ch: (p.name.trim()[0] ?? '·').toUpperCase(), n: ([...p.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 6) + 1 })
const avatarBg = computed(() => (ACCENTS[state.profile.color] ?? ACCENTS.graphite!).c[0])

interface MenuState { type: 'project' | 'chat' | 'profile' | 'run'; id: string; x: number; y: number; sub: boolean }
const menu = ref<MenuState | null>(null)
const menuEl = ref<HTMLElement | null>(null)

async function openMenu(e: MouseEvent, type: MenuState['type'], id = '') {
  e.stopPropagation()
  e.preventDefault()
  if (menu.value && menu.value.type === type && menu.value.id === id) return closeMenu()
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  menu.value = { type, id, x: type === 'profile' ? r.left : r.right + 6, y: type === 'profile' ? r.top : r.top, sub: false }
  await nextTick()
  place(r)
}
function place(r?: DOMRect) {
  const m = menu.value
  const el = menuEl.value
  if (!m || !el) return
  const w = el.offsetWidth
  const h = el.offsetHeight
  const pad = 8
  let x = m.x
  let y = m.y
  if (m.type === 'profile' && r) {
    y = r.top - h - 6
    x = Math.max(pad, r.left)
  }
  x = Math.min(Math.max(pad, x), window.innerWidth - w - pad)
  y = Math.min(Math.max(pad, y), window.innerHeight - h - pad)
  m.x = x
  m.y = y
}
function closeMenu() { menu.value = null }
async function showMove() {
  if (!menu.value) return
  menu.value.sub = true
  await nextTick()
  place()
}
function onDocClick(e: MouseEvent) {
  if (menu.value && !menuEl.value?.contains(e.target as Node)) closeMenu()
  if (hist.value && !histEl.value?.contains(e.target as Node)) hist.value = null
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && menu.value) closeMenu()
  if (e.key === 'Escape' && hist.value) hist.value = null
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', closeMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', closeMenu)
})

const menuProject = computed(() => (menu.value?.type === 'project' ? state.projects.find((p) => p.id === menu.value!.id) : undefined))
const menuRun = computed(() => (menu.value?.type === 'run' ? runOf(menu.value.id) : undefined))
const menuChat = computed(() => (menu.value?.type === 'chat' ? chatOf(menu.value.id) : undefined))

const renaming = ref<{ type: 'project' | 'chat'; id: string; text: string } | null>(null)
async function startRename(type: 'project' | 'chat', id: string, text: string) {
  closeMenu()
  const name = await askText({ title: type === 'project' ? 'Переименовать проект' : 'Переименовать чат', value: text, placeholder: 'Название' })
  if (name == null) return
  if (type === 'project') renameProject(id, name)
  else renameChat(id, name)
}
function commitRename() {
  const r = renaming.value
  if (!r) return
  renaming.value = null
  if (r.type === 'project') renameProject(r.id, r.text)
  else renameChat(r.id, r.text)
}
const cancelRename = () => (renaming.value = null)
const isRenaming = (type: 'project' | 'chat', id: string) => renaming.value?.type === type && renaming.value.id === id

function onChatClick(c: Chat) {
  if (!isRenaming('chat', c.id)) go('/c/' + c.id)
}
function doDeleteChat(id: string) {
  closeMenu()
  if (activeChatId.value === id) go('/app')
  deleteChat(id)
}
function doDeleteProject(id: string) {
  closeMenu()
  if (activeProjectId.value === id) go('/app')
  deleteProject(id)
}
function doMove(id: string, projectId: string | null) {
  closeMenu()
  moveChat(id, projectId)
}
</script>

<template>
  <aside
    class="sb" :class="{ 'is-rail': rail, tips: rail, 'is-drawer': state.mobile, 'is-open': state.drawer }" aria-label="Боковая панель"
    :inert="state.mobile && !state.drawer ? true : undefined" :aria-hidden="state.mobile && !state.drawer ? 'true' : undefined"
  >
    <div class="sb__top">
      <button
        v-if="rail" type="button" class="sb__brand sb__brand--toggle"
        :data-tip="'Развернуть панель  ' + K('sidebar')" aria-label="Развернуть панель" @click="state.sidebar = true"
      >
        <Icon name="logo" :size="26" />
        <span class="sb__grip" aria-hidden="true"><Icon name="chevron-right" :size="12" /></span>
      </button>
      <RouterLink v-else to="/app" class="sb__brand" aria-label="Фактура AI, на главную">
        <Icon name="logo" :size="26" />
        <span class="lbl sb__brand-name">фактура<span class="sb__ai">AI</span></span>
      </RouterLink>
      <button class="icon-btn lbl sb__collapse" :data-tip="'Свернуть панель  ' + K('sidebar')" aria-label="Свернуть панель" @click="state.sidebar = false">
        <Icon name="sidebar" :size="18" />
      </button>
    </div>

    <nav class="sb__actions">
      <button class="row sb__new" :class="{ 'is-active': route.path === '/app' }" :data-tip="'Новый разбор  ' + K('new')" @click="newRun">
        <Icon name="newchat" :size="18" />
        <span class="lbl row__t">Новый разбор</span>
        <kbd class="lbl sb__kbd sb__kbd--hover">{{ K('new') }}</kbd>
      </button>
      <button v-if="FEATURES.chat" class="row" :data-tip="'Новый вопрос  ' + K('new')" @click="newAsk(null)">
        <Icon name="newchat" :size="18" />
        <span class="lbl row__t">Новый вопрос</span>
        <kbd class="lbl sb__kbd sb__kbd--hover">{{ K('new') }}</kbd>
      </button>
      <button class="row" :data-tip="'Поиск  ' + K('palette')" @click="state.palette = true">
        <Icon name="search" :size="18" />
        <span class="lbl row__t">Поиск</span>
        <kbd class="lbl sb__kbd sb__kbd--hover">{{ K('palette') }}</kbd>
      </button>
      <RouterLink to="/facts" class="row" :class="{ 'is-active': DATA_PATHS.some((p) => route.path.startsWith(p)) }" :data-tip="rail ? 'Данные  ' + K('go-data') : undefined">
        <Icon name="chart" :size="18" />
        <span class="lbl row__t">Данные</span>
        <kbd class="lbl sb__kbd sb__kbd--hover">{{ K('go-data') }}</kbd>
      </RouterLink>
    </nav>

    <div v-if="rail" class="sb__rail-projects">
      <button class="row" :class="{ 'is-menu': !!hist }" :data-tip="FEATURES.chat ? 'История' : 'Разборы'" :aria-label="FEATURES.chat ? 'История чатов' : 'Разборы'" aria-haspopup="true" :aria-expanded="!!hist" @click="toggleHist">
        <Icon :name="FEATURES.chat ? 'history' : 'folder'" :size="18" />
      </button>
      <button
        v-for="p in FEATURES.projects ? sortedProjects() : []" :key="p.id" class="row"
        :class="{ 'is-active': activeProjectId === p.id }" :data-tip="p.pinned ? p.name + ' · закреплён' : p.name" :aria-label="p.name"
        @click="go('/p/' + p.id)"
      >
        <span class="sb__mark" :style="{ '--mk': `var(--c${markOf(p).n})` }">{{ markOf(p).ch }}<i v-if="p.pinned" class="sb__pinned" aria-hidden="true" /></span>
      </button>
      <UiLoad :loading="runsLoad.state === 'loading'" class="sb__sk-rail">
        <template #skeleton><UiSkeleton v-for="i in 3" :key="i" variant="block" width="40px" height="32px" class="sb__sk-i" /></template>
      </UiLoad>
    </div>

    <div v-else class="sb__scroll">
      <div class="sec sec--runs">
        <button class="sec__head" :aria-expanded="runsOpen" @click="runsOpen = !runsOpen">
          <span>Разборы</span>
          <Icon class="sec__chev" :class="{ 'is-closed': !runsOpen }" name="chevron-down" :size="14" />
        </button>
      </div>
      <div v-show="runsOpen" class="list">
        <UiLoad :loading="runsLoad.state === 'loading'" :error="runsLoad.state === 'error'">
          <template #skeleton>
            <div v-for="i in 4" :key="i" class="row sb__sk-row"><UiSkeleton variant="block" width="18px" height="18px" class="sb__sk-ico" /><UiSkeleton :style="{ width: [68, 52, 74, 46][i - 1] + '%' }" /></div>
          </template>
          <template #error><UiEmpty compact icon="info" title="Не удалось загрузить разборы" action="Повторить" @action="reloadRuns()" /></template>
        <div v-for="r in sortedRuns()" :key="r.id" class="proj">
          <div
            class="row row--item" :class="{ 'is-active': activeRunId === r.id, 'is-menu': menu?.type === 'run' && menu.id === r.id }"
            role="link" tabindex="0" :aria-expanded="isRunOpen(r.id)" @click="clickRun(r.id)" @keydown.enter="clickRun(r.id)"
          >
            <button
              type="button" class="row__fold" :aria-label="isRunOpen(r.id) ? 'Свернуть статьи разбора' : 'Показать статьи разбора'"
              @click.stop="toggleRun(r.id)" @keydown.enter.stop
            ><Icon :name="isRunOpen(r.id) ? 'folder-open' : 'folder'" :size="18" /></button>
            <span class="row__t" :data-tip="runLabel(r)">{{ runLabel(r) }}</span>
            <Icon v-if="r.pinned" class="row__pin" name="pin" :size="13" data-tip="Закреплён" aria-label="Закреплён" />
            <span class="row__n num">{{ runPapersOf(r.id).length }}</span>
            <button class="row__dots icon-btn icon-btn--sm" aria-label="Действия с разбором" @click="openMenu($event, 'run', r.id)">
              <Icon name="dots" :size="16" />
            </button>
          </div>
          <div v-if="isRunOpen(r.id)" class="sub">
            <div v-if="filesLoading(r.id)" class="sub__sk" aria-busy="true"><UiSkeleton v-for="i in 3" :key="i" class="sub__sk-l" /></div>
            <div v-else :class="{ 'sub__scroll': subExpanded(r.id) && runPapersOf(r.id).length > SUB_MAX }">
              <RouterLink
                v-for="f in (subExpanded(r.id) ? runPapersOf(r.id) : runPapersOf(r.id).slice(0, SUB_MAX))" :key="f.id" :to="{ path: paperPath(f.id, r.domain), query: { run: r.id } }" class="row row--item row--chat row--paper"
                :class="{ 'is-active': activePid === f.id, 'is-dim': f.status === 'out' || f.status === 'error' }"
              >
                <template v-if="paperTitle(f.id, r.domain, r.id)">
                  <span class="row__code num">{{ f.id }}</span>
                  <span class="row__t row__sub" :data-tip="paperTitle(f.id, r.domain, r.id)">{{ paperTitle(f.id, r.domain, r.id) }}</span>
                </template>
                <span v-else class="row__t row__sub" :data-tip="fileLabel(f)">{{ fileLabel(f) }}</span>
                <span v-if="openN(f.id, r.domain)" class="dot dot--warn row__issue" role="img" :data-tip="openTip(f.id, r.domain)" :aria-label="openTip(f.id, r.domain)" />
              </RouterLink>
            </div>
            <button v-if="runPapersOf(r.id).length > SUB_MAX" class="more" :aria-expanded="subExpanded(r.id)" @click="subAll[r.id] = !subExpanded(r.id)">
              {{ subExpanded(r.id) ? 'Свернуть' : `ещё ${runPapersOf(r.id).length - SUB_MAX}` }}
            </button>
          </div>
        </div>
          <UiEmpty v-if="!sortedRuns().length" compact plain icon="folder" title="Разборов пока нет" />
        </UiLoad>
      </div>

      <template v-if="FEATURES.chat && pinnedChats().length">
        <div class="sec"><div class="sec__head sec__head--static"><span>Закреплённые</span></div></div>
        <div class="list">
          <div
            v-for="c in pinnedChats()" :key="c.id" class="row row--item"
            :class="{ 'is-active': activeChatId === c.id, 'is-menu': menu?.type === 'chat' && menu.id === c.id }"
            role="link" tabindex="0" @click="onChatClick(c)" @keydown.enter="onChatClick(c)"
          >
            <input
              v-if="isRenaming('chat', c.id)" ref="renameInput" v-model="renaming!.text" class="row__input row__input--flush"
              @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="cancelRename" @blur="commitRename"
            />
            <template v-else>
              <Icon class="row__pinned" name="pin" :size="13" />
              <span class="row__t">{{ c.title }}</span>
              <button class="row__dots icon-btn icon-btn--sm" aria-label="Действия с чатом" @click="openMenu($event, 'chat', c.id)">
                <Icon name="dots" :size="16" />
              </button>
            </template>
          </div>
        </div>
      </template>

      <div v-if="FEATURES.projects" class="sec">
        <button class="sec__head" :aria-expanded="projectsOpen" @click="projectsOpen = !projectsOpen">
          <span>Проекты</span>
          <Icon class="sec__chev" :class="{ 'is-closed': !projectsOpen }" name="chevron-down" :size="14" />
        </button>
        <button class="icon-btn icon-btn--sm sec__add" data-tip="Новый проект" aria-label="Новый проект" @click="state.projectModal = 'new'">
          <Icon name="plus" :size="16" />
        </button>
      </div>
      <div v-if="FEATURES.projects" v-show="projectsOpen" class="list">
        <div v-for="p in sortedProjects()" :key="p.id" class="proj">
          <div
            class="row row--item" :class="{ 'is-active': activeProjectId === p.id, 'is-menu': menu?.type === 'project' && menu.id === p.id }"
            role="link" tabindex="0" @click="openProject(p)" @keydown.enter="openProject(p)"
          >
            <Icon :name="p.open ? 'folder-open' : 'folder'" :size="18" />
            <input
              v-if="isRenaming('project', p.id)" ref="renameInput" v-model="renaming!.text" class="row__input"
              @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="cancelRename" @blur="commitRename"
            />
            <template v-else>
              <span class="row__t">{{ p.name }}</span>
              <Icon v-if="p.pinned" class="row__pin" name="pin" :size="13" data-tip="Закреплён" aria-label="Закреплён" />
              <button class="row__dots icon-btn icon-btn--sm" aria-label="Действия с проектом" @click="openMenu($event, 'project', p.id)">
                <Icon name="dots" :size="16" />
              </button>
            </template>
          </div>

          <div v-if="p.open" class="sub">
            <div
              v-for="c in visibleChats(p)" :key="c.id" class="row row--item row--chat"
              :class="{ 'is-active': activeChatId === c.id, 'is-menu': menu?.type === 'chat' && menu.id === c.id }"
              role="link" tabindex="0" @click="onChatClick(c)" @keydown.enter="onChatClick(c)"
            >
              <input
                v-if="isRenaming('chat', c.id)" ref="renameInput" v-model="renaming!.text" class="row__input"
                @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="cancelRename" @blur="commitRename"
              />
              <template v-else>
                <Icon class="row__kind" :name="c.kind === 'paper' ? 'doc' : 'chat'" :size="14" />
                <span class="row__t">{{ c.title }}</span>
                <span v-if="status(c)" class="st" :data-tip="status(c)!.type === 'issues' ? issueTip((status(c) as any).n) : undefined">
                  <svg v-if="status(c)!.type === 'ring'" class="ring" viewBox="0 0 18 18" width="18" height="18" role="img" :aria-label="`Разбор ${(status(c) as any).pct}%`">
                    <circle cx="9" cy="9" r="7" class="ring__bg" />
                    <circle cx="9" cy="9" r="7" class="ring__fg" :stroke-dasharray="CIRC" :stroke-dashoffset="CIRC * (1 - (status(c) as any).pct / 100)" />
                  </svg>
                  <span v-else class="dot" :class="(status(c) as any).dot" :aria-label="issueTip((status(c) as any).n)" />
                </span>
                <button class="row__dots icon-btn icon-btn--sm" aria-label="Действия с чатом" @click="openMenu($event, 'chat', c.id)">
                  <Icon name="dots" :size="16" />
                </button>
              </template>
            </div>
            <button v-if="chatsOf(p.id).length > LIMIT" class="more" @click="expanded[p.id] = !expanded[p.id]">
              {{ expanded[p.id] ? 'Свернуть' : 'Показать ещё' }}
            </button>
            <div v-if="!chatsOf(p.id).length" class="empty">Чатов пока нет</div>
          </div>
        </div>
      </div>

      <div v-if="FEATURES.chat" class="sec sec--recent">
        <button class="sec__head" :aria-expanded="recentOpen" @click="recentOpen = !recentOpen">
          <span>Недавние</span>
          <Icon class="sec__chev" :class="{ 'is-closed': !recentOpen }" name="chevron-down" :size="14" />
        </button>
      </div>
      <div v-if="FEATURES.chat" v-show="recentOpen" class="list">
        <template v-for="g in groups" :key="g.label">
          <div class="grp">{{ g.label }}</div>
          <div
            v-for="c in g.chats" :key="c.id" class="row row--item"
            :class="{ 'is-active': activeChatId === c.id, 'is-menu': menu?.type === 'chat' && menu.id === c.id }"
            role="link" tabindex="0" @click="onChatClick(c)" @keydown.enter="onChatClick(c)"
          >
            <input
              v-if="isRenaming('chat', c.id)" ref="renameInput" v-model="renaming!.text" class="row__input row__input--flush"
              @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="cancelRename" @blur="commitRename"
            />
            <template v-else>
              <Icon class="row__kind" :name="c.kind === 'paper' ? 'doc' : 'chat'" :size="14" />
              <span class="row__t">{{ c.title }}</span>
              <span v-if="status(c)" class="st" :data-tip="status(c)!.type === 'issues' ? issueTip((status(c) as any).n) : undefined">
                <svg v-if="status(c)!.type === 'ring'" class="ring" viewBox="0 0 18 18" width="18" height="18" role="img" :aria-label="`Разбор ${(status(c) as any).pct}%`">
                  <circle cx="9" cy="9" r="7" class="ring__bg" />
                  <circle cx="9" cy="9" r="7" class="ring__fg" :stroke-dasharray="CIRC" :stroke-dashoffset="CIRC * (1 - (status(c) as any).pct / 100)" />
                </svg>
                <span v-else class="dot" :class="(status(c) as any).dot" :aria-label="issueTip((status(c) as any).n)" />
              </span>
              <button class="row__dots icon-btn icon-btn--sm" aria-label="Действия с чатом" @click="openMenu($event, 'chat', c.id)">
                <Icon name="dots" :size="16" />
              </button>
            </template>
          </div>
        </template>
        <div v-if="!groups.length" class="empty empty--flush">Чатов вне проектов нет</div>
      </div>
    </div>
    <div v-if="rail" class="sb__spacer" />

    <div class="sb__bottom">
      <button class="prof" :class="{ 'is-open': menu?.type === 'profile' }" :data-tip="state.profile.name.trim() || state.profile.email" @click="openMenu($event, 'profile')">
        <span class="prof__ava" :style="{ background: avatarBg }"><Icon v-if="!state.profile.name.trim()" name="user" :size="16" /><template v-else>{{ initials(state.profile.name) }}</template></span>
        <span class="lbl prof__txt">
          <span class="prof__name">{{ state.profile.name.trim() || state.profile.email }}</span>
          <span v-if="state.profile.name.trim()" class="prof__sub">{{ state.profile.email }}</span>
        </span>
        <kbd class="lbl sb__kbd sb__kbd--hover prof__kbd">{{ K('profile') }}</kbd>
      </button>
    </div>

    <div
      v-if="!rail && !state.mobile" class="sb__bar" :class="{ 'is-drag': dragW }" role="separator" aria-orientation="vertical" tabindex="0"
      :aria-valuenow="width" :aria-valuemin="W_MIN" :aria-valuemax="W_MAX" aria-label="Ширина панели (двойной клик — по умолчанию)"
      @pointerdown="barDown" @pointermove="barMove" @pointerup="barStop" @pointercancel="barStop" @lostpointercapture="barStop" @dblclick="barReset" @keydown="barKey"
    ><span class="sb__barline" /></div>

    <Teleport to="body">
      <Transition name="pop">
        <div v-if="hist" ref="histEl" class="menu sb-menu sb-hist" :style="{ left: hist.x + 'px', top: hist.y + 'px' }" role="menu" @click.stop>
          <template v-if="!FEATURES.chat">
            <div class="menu__label">Разборы</div>
            <div v-if="runsLoad.state === 'loading'" class="sb-hist__sk" aria-busy="true"><UiSkeleton v-for="i in 3" :key="i" /></div>
            <div v-else-if="!sortedRuns().length" class="menu__label">Разборов пока нет</div>
            <template v-for="r in sortedRuns()" :key="r.id">
              <div class="sb-hist__run">
                <button type="button" class="menu__item sb-hist__fold" :aria-label="isRunOpen(r.id) ? 'Свернуть статьи разбора' : 'Показать статьи разбора'" @click="toggleRun(r.id)">
                  <Icon :name="isRunOpen(r.id) ? 'folder-open' : 'folder'" :size="16" />
                </button>
                <button class="menu__item" role="menuitem" :class="{ 'is-active': activeRunId === r.id }" @click="hist = null; clickRun(r.id)">
                  <span class="sb-hist__t" :data-tip="r.title">{{ runLabel(r) }}</span>
                </button>
              </div>
              <div v-if="isRunOpen(r.id)" class="sub sb-hist__sub">
                <button v-for="f in runPapersOf(r.id)" :key="f.id" class="menu__item" role="menuitem" :class="{ 'is-active': activePid === f.id }" @click="hist = null; go({ path: paperPath(f.id, r.domain), query: { run: r.id } })">
                  <span class="row__code num">{{ f.id }}</span><span class="sb-hist__t">{{ paperTitle(f.id, r.domain, r.id) }}</span>
                </button>
              </div>
            </template>
          </template>
          <template v-else>
          <template v-if="pinnedChats().length">
            <div class="menu__label">Закреплённые</div>
            <button v-for="c in pinnedChats()" :key="'p' + c.id" class="menu__item" role="menuitem" @click="openHist(c)">
              <Icon name="pin" :size="16" /><span class="sb-hist__t">{{ c.title }}</span>
            </button>
            <div class="menu__sep" />
          </template>
          <div class="menu__label">Последние чаты</div>
          <button v-for="c in lastChats" :key="c.id" class="menu__item" role="menuitem" @click="openHist(c)">
            <Icon :name="c.kind === 'paper' ? 'doc' : 'chat'" :size="16" /><span class="sb-hist__t">{{ c.title }}</span>
          </button>
          <div v-if="!lastChats.length" class="menu__label">Чатов пока нет</div>
          </template>
        </div>
      </Transition>
      <div v-if="menu && state.mobile" class="sb-scrim" aria-hidden="true" @click="closeMenu" />
      <Transition name="pop">
        <div v-if="menu" ref="menuEl" class="menu sb-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" role="menu" @click.stop>
          <template v-if="menu.type === 'project' && menuProject">
            <button class="menu__item" @click="go('/p/' + menuProject.id); closeMenu()"><Icon name="home" :size="16" />Главная проекта</button>
            <button class="menu__item" @click="newAsk(menuProject.id); closeMenu()"><Icon name="newchat" :size="16" />Новый вопрос в проекте</button>
            <button class="menu__item" @click="picker.open(menuProject.id); closeMenu()"><Icon name="upload" :size="16" />Загрузить PDF в проект</button>
            <button class="menu__item" @click="state.projectModal = menuProject.id; closeMenu()"><Icon name="gear" :size="16" />Настройки проекта</button>
            <button class="menu__item" @click="startRename('project', menuProject.id, menuProject.name)"><Icon name="edit" :size="16" />Переименовать</button>
            <div class="menu__sep" />
            <button class="menu__item" @click="togglePin(menuProject.id); closeMenu()"><Icon name="pin" :size="16" />{{ menuProject.pinned ? 'Открепить' : 'Закрепить' }}</button>
            <button class="menu__item menu__item--danger" @click="doDeleteProject(menuProject.id)"><Icon name="trash" :size="16" />Удалить проект</button>
          </template>

          <template v-else-if="menu.type === 'chat' && menuChat">
            <template v-if="!menu.sub">
              <button class="menu__item" @click="pinChat(menuChat.id); closeMenu()"><Icon name="pin" :size="16" />{{ menuChat.pinned ? 'Открепить' : 'Закрепить' }}<kbd class="menu__kbd">{{ K('pin') }}</kbd></button>
              <button class="menu__item" @click="startRename('chat', menuChat.id, menuChat.title)"><Icon name="edit" :size="16" />Переименовать</button>
              <button class="menu__item" @click="showMove"><Icon name="move" :size="16" />Переместить в проект<Icon class="menu__more" name="chevron-right" :size="14" /></button>
              <div class="menu__sep" />
              <button class="menu__item menu__item--danger" @click="doDeleteChat(menuChat.id)"><Icon name="trash" :size="16" />Удалить</button>
            </template>
            <template v-else>
              <div class="menu__label">Переместить в…</div>
              <button v-for="p in sortedProjects()" :key="p.id" class="menu__item" :class="{ 'is-active': menuChat.projectId === p.id }" @click="doMove(menuChat.id, p.id)">
                <Icon name="folder" :size="16" />{{ p.name }}<Icon v-if="menuChat.projectId === p.id" class="menu__more" name="check" :size="14" />
              </button>
              <div class="menu__sep" />
              <button class="menu__item" :class="{ 'is-active': menuChat.projectId === null }" @click="doMove(menuChat.id, null)">
                <Icon name="chat" :size="16" />Без проекта<Icon v-if="menuChat.projectId === null" class="menu__more" name="check" :size="14" />
              </button>
            </template>
          </template>

          <template v-else-if="menu.type === 'run' && menuRun">
            <button class="menu__item" @click="downloadRun(menuRun.id)"><Icon name="export" :size="16" />Скачать набор для сдачи</button>
            <div class="menu__sep" />
            <button class="menu__item" @click="togglePinRun(menuRun.id); closeMenu()"><Icon name="pin" :size="16" />{{ menuRun.pinned ? 'Открепить' : 'Закрепить' }}</button>
            <button class="menu__item" @click="renameRunAsk(menuRun.id)"><Icon name="edit" :size="16" />Переименовать</button>
            <div class="menu__sep" />
            <button class="menu__item menu__item--danger" @click="doDeleteRun(menuRun.id)"><Icon name="trash" :size="16" />Удалить</button>
          </template>

          <template v-else-if="menu.type === 'profile'">
            <div class="menu__who">
              <b>{{ state.profile.name }}</b>
              <span>{{ state.profile.email }}</span>
            </div>
            <div class="menu__sep" />
            <button class="menu__item" @click="router.push('/settings'); closeMenu()"><Icon name="gear" :size="16" />Настройки<kbd class="menu__kbd">{{ K('settings') }}</kbd></button>
            <button class="menu__item" @click="state.keysModal = true; closeMenu()"><Icon name="keyboard" :size="16" />Горячие клавиши<kbd class="menu__kbd">{{ K('keys') }}</kbd></button>
            <div class="menu__sep" />
            <button class="menu__item" :disabled="outBusy" @click="signOut()"><UiSpinner v-if="outBusy" :size="14" tone="current" /><Icon v-else name="logout" :size="16" />{{ outBusy ? 'Выходим…' : 'Выйти' }}</button>
          </template>
        </div>
      </Transition>
    </Teleport>
  </aside>
</template>

<style scoped>
.sb {
  height: 100%; overflow: hidden; display: flex; flex-direction: column;
  background: var(--bg-2); padding: var(--s2); position: relative;
  --sk-bg: var(--bg-3);
}
.sb__top { display: flex; align-items: center; justify-content: space-between; height: 40px; padding: 0 2px 0 6px; flex: none; }
.sb__brand { display: flex; align-items: center; gap: 9px; min-width: 0; height: 36px; border-radius: var(--r-sm); color: var(--ink); }
.sb__brand-name { display: inline-flex; align-items: flex-start; gap: 3px; font-size: calc(var(--fs-body) + 2px); font-weight: 600; letter-spacing: -0.02em; white-space: nowrap; }
.sb__ai { margin-top: -2px; padding: 0 var(--s1); border-radius: var(--r-xs); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.02em; line-height: 1.4; color: var(--on-brand, #fff); background: var(--brand, #2f6bff); }
.sb__collapse { color: var(--muted); }
.sb__actions { display: flex; flex-direction: column; gap: 2px; margin-top: var(--s2); flex: none; }
.sb__upload {
  display: flex; align-items: center; gap: var(--s2); height: var(--row-h); padding: 0 var(--s3);
  border-radius: var(--r-sm); font-size: var(--fs-body); color: var(--ink);
  transition: background-color var(--t) ease, transform var(--t-fast) var(--ease);
}
.sb__upload:hover { background: var(--bg-3); }
.sb__upload:active { transform: scale(0.98); }
.sb__upload .lbl { flex: 1; text-align: left; white-space: nowrap; }
.sb__upload .sb__kbd { flex: none; }
.sb__kbd { margin-left: auto; }
.row {
  position: relative; display: flex; align-items: center; gap: var(--s2); width: 100%; height: var(--row-h); padding: 0 var(--s3);
  border-radius: var(--r-sm); font-size: var(--fs-body); color: var(--ink); text-align: left; cursor: pointer;
  transition: background-color var(--t) ease;
}
.row:hover, .row.is-menu { background: var(--bg-3); }
.row.is-active { background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.row > :deep(svg) { flex: none; color: var(--ink-2); }
.row__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row__pin { color: var(--faint); }
.row > :deep(svg.row__kind) { color: var(--faint); margin-right: -2px; }
.row__input {
  flex: 1; min-width: 0; height: 28px; padding: 0 var(--s2); margin-left: calc(-1 * var(--s2)); font: inherit; font-size: var(--fs-body); color: var(--ink);
  background: var(--card); border-radius: var(--r-xs); box-shadow: 0 0 0 1.5px var(--blue);
}
.row__dots {
  display: none; margin-right: -6px; color: var(--muted);
}
.row:hover .row__dots, .row.is-menu .row__dots, .row:focus-within .row__dots { display: grid; }
.row:hover .st, .row.is-menu .st { display: none; }
.row:hover .row__pin, .row.is-menu .row__pin { display: none; }
.row__dots:hover { background: var(--bg-2); }
.row__pin { flex: none; color: var(--muted); }
.row__n { flex: none; font-size: var(--fs-xs); color: var(--faint); }
.row:hover .row__n, .row.is-menu .row__n { display: none; }
.row--paper { height: 32px; gap: var(--s2); }
.row__code { flex: none; max-width: 6em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); font-weight: 500; color: var(--ink-2); }
.row__sub { font-size: var(--fs-sm); color: var(--muted); }
.row--paper.is-active .row__sub { color: var(--ink-2); }
.row.is-dim .row__code, .row.is-dim .row__sub { color: var(--faint); }
.row__issue { flex: none; }
.row__fold { flex: none; display: grid; place-items: center; width: 28px; height: 28px; margin-left: calc(-1 * var(--s1)); border-radius: var(--r-xs); color: var(--ink-2); }
.row__fold:hover { background: var(--bg-3); color: var(--ink); }
.sec--runs { margin-top: 0; }

.sb__rail-projects { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line); flex: none; }
.sb__spacer { flex: 1; }
.sb__pinned { position: absolute; top: -3px; right: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-2); box-shadow: 0 0 0 2px var(--bg-2); }
.sb__mark {
  position: relative; width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--r-xs); font-size: var(--fs-xs); font-weight: 600;
  color: var(--mk); background: color-mix(in srgb, var(--mk) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mk) 38%, transparent);
}
.sb__scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 10px -8px 0; padding: 0 8px 8px; scrollbar-width: thin; scrollbar-color: transparent transparent; }
.sb__scroll:hover { scrollbar-color: var(--line-2) transparent; }

.sec { position: relative; display: flex; align-items: center; margin-top: var(--s2); }
.sec--recent { margin-top: var(--s4); }
.sec__head {
  display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 var(--s3); border-radius: var(--r-sm);
  min-height: var(--sec-h, 28px);
  font-size: var(--fs-xs); font-weight: 500; color: var(--faint);
  transition: color var(--t) ease;
}
.sec__head:hover { color: var(--ink); }
.sec__chev { transition: rotate var(--t) var(--ease); }
.sec__chev.is-closed { rotate: -90deg; }
.sec__add { margin-left: auto; color: var(--faint); opacity: 0; transition: opacity var(--t) ease; }
.sec:hover .sec__add, .sec__add:focus-visible { opacity: 1; }

.sb__sk-row { cursor: default; pointer-events: none; }
.sb__sk-ico { flex: none; width: 18px; border-radius: var(--r-xs); }
.sb__sk-rail { display: grid; gap: 2px; justify-items: center; }
.sb__sk-i { width: 24px; height: 18px; border-radius: var(--r-xs); }
.sub__sk { display: grid; gap: 10px; padding: 8px 8px 8px 4px; }
.sb-hist__sk { display: grid; gap: 10px; padding: 8px 12px; min-width: 200px; }
.list { display: flex; flex-direction: column; gap: 1px; }
.sub { display: flex; flex-direction: column; gap: 1px; margin: 1px 0 4px 18px; padding-left: 8px; border-left: 1px solid var(--line-2); }

.row__t--flush, .row__input--flush { margin-left: 0; }
.grp { padding: var(--s3) var(--s3) var(--s1); font-size: var(--fs-xs); font-weight: 500; color: var(--faint); }
.grp:first-child { padding-top: var(--s1); }
.sub__scroll { display: flex; flex-direction: column; gap: 1px; max-height: 268px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.more { height: 28px; padding: 0 10px; text-align: left; font-size: var(--fs-xs); color: var(--muted); border-radius: var(--r-sm); }
.more:hover { color: var(--ink); background: var(--bg-3); }
.empty { padding: var(--s1) var(--s3) var(--s2); font-size: var(--fs-xs); color: var(--muted); }
.st { display: flex; align-items: center; gap: 5px; flex: none; }
.st__n { font-size: var(--fs-xs); color: var(--muted); font-variant-numeric: tabular-nums; }
.ring { transform: rotate(-90deg); }
.ring__bg { fill: none; stroke: var(--line-2); stroke-width: 2; }
.ring__fg { fill: none; stroke: var(--blue); stroke-width: 2; stroke-linecap: round; transition: stroke-dashoffset var(--t) linear; }
.sb__bottom { flex: none; padding-top: 8px; margin-top: 4px; border-top: 1px solid var(--line); }
.prof {
  display: flex; align-items: center; gap: 10px; width: 100%; height: 48px; padding: 0 8px; border-radius: var(--r-sm); text-align: left;
  transition: background-color var(--t) ease;
}
.prof:hover, .prof.is-open { background: var(--bg-3); }
.prof__ava {
  width: 32px; height: 32px; flex: none; display: grid; place-items: center; border-radius: 50%;
  background: var(--solid); color: var(--on-accent, #fff); font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.02em;
}
.prof__txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.prof__name { font-size: var(--fs-body); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prof__sub { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sb__bar { position: absolute; z-index: 5; top: 0; bottom: 0; right: 0; width: 8px; cursor: col-resize; touch-action: none; outline: none; }
.sb__barline { position: absolute; top: 0; bottom: 0; right: 0; width: 1px; background: var(--line); transition: background-color var(--t) ease, width var(--t) ease; }
.sb__bar:hover .sb__barline, .sb__bar:focus-visible .sb__barline, .sb__bar.is-drag .sb__barline { width: 2px; background: var(--blue); }
.is-rail .sb__top { flex-direction: column; height: auto; gap: 4px; padding: 0; align-items: center; }
.is-rail .sb__brand { justify-content: center; width: 100%; padding: 0; }
.is-rail .lbl { display: none; }
.is-rail .row, .is-rail .sb__upload, .is-rail .prof { justify-content: center; padding: 0; gap: 0; }
.is-rail .row, .is-rail .sb__upload { height: 40px; }
.is-rail .sb__actions { align-items: stretch; }
.is-rail .prof { height: 48px; }
.is-rail .sb__brand:hover, .is-rail .sb__upload:hover { background: var(--bg-3); }
.is-rail .sb__brand--toggle { position: relative; display: grid; place-items: center; height: 40px; overflow: visible; }
.sb__grip {
  position: absolute; top: 50%; right: -8px; translate: 0 -50%;
  width: 18px; height: 32px; display: grid; place-items: center; border-radius: var(--r-xs) 0 0 var(--r-xs);
  background: var(--bg-3); color: var(--muted); box-shadow: 0 0 0 1px var(--line);
  transition: width var(--t) var(--ease), opacity var(--t) ease;
}
.sb__brand--toggle:is(:hover, :focus-visible) .sb__grip { width: 22px; background: var(--ink); color: var(--bg); }

.lbl { animation: lbl-in var(--t-slow) var(--ease) both; }
@keyframes lbl-in { from { opacity: 0; translate: -4px 0; } to { opacity: 1; translate: 0 0; } }

@media (prefers-reduced-motion: reduce) {
  .lbl { animation: none; }
}
</style>

<style>
.menu.sb-menu { position: fixed; z-index: calc(var(--z-drawer) + 2); }
.sb-scrim { position: fixed; inset: 0; z-index: calc(var(--z-drawer) + 1); background: var(--scrim); }
@media (max-width: 768px) {
  .menu.sb-menu:not(.sb-hist) {
    left: 0 !important; right: 0; top: auto !important; bottom: 0; width: 100%; max-height: 80dvh; overflow-y: auto;
    padding: var(--s2) var(--s2) calc(var(--s2) + var(--safe-b)); border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
  .menu.sb-menu:not(.sb-hist)::before { content: ''; display: block; width: 36px; height: 4px; margin: 2px auto 8px; border-radius: var(--r-pill); background: var(--line-2); }
  .menu.sb-menu .menu__item { height: 52px; }
}
.sb-menu .menu__item { position: relative; }
.sb-menu .menu__more { margin-left: auto; color: var(--muted); }
.sb-hist { width: 280px; max-height: min(70vh, 440px); overflow-y: auto; overflow-x: hidden; }
.sb-hist__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-hist__run { display: flex; align-items: center; gap: 2px; min-width: 0; }
.sb-hist .sb-hist__run > .menu__item { flex: 1 1 auto; width: auto; min-width: 0; }
.sb-hist .sb-hist__run > .sb-hist__fold { flex: 0 0 32px; width: 32px; justify-content: center; padding: 0; }
.sb-hist__sub .menu__item { min-width: 0; }
.sb-hist__sub { display: flex; flex-direction: column; gap: 1px; margin: 1px 0 var(--s1) 18px; padding-left: var(--s2); border-left: 1px solid var(--line-2); }
.sb-hist__sub .row__code { flex: none; font-size: var(--fs-xs); font-weight: 500; color: var(--ink-2); }
.sec__head--static { cursor: default; }
.row__pinned { flex: none; color: var(--muted); margin-right: 6px; }
.sb__kbd--hover { opacity: 0; transition: opacity var(--t) ease; }
.row:hover .sb__kbd--hover, .sb__upload:hover .sb__kbd--hover, .prof:hover .sb__kbd--hover { opacity: 1; }
.prof__kbd { margin-left: auto; flex: none; }
.lbl.sb__kbd--hover { animation: none; }
.sb.is-drawer {
  position: fixed; z-index: var(--z-drawer); top: 0; left: 0; bottom: 0; width: min(86vw, 320px);
  padding-top: calc(var(--s2) + var(--safe-t)); padding-bottom: var(--safe-b);
  translate: -102% 0; transition: translate var(--t-sheet) var(--ease);
  box-shadow: none;
}
.sb.is-drawer.is-open { translate: 0 0; box-shadow: var(--shadow-pop); }
.sb.is-drawer .sb__collapse { display: none; }
@media (max-width: 768px) {
  .sb .row__dots { display: grid !important; width: 44px; height: 44px; }
  .sb .row--paper { height: 44px; }
  .sb .row__fold { width: 44px; height: 44px; margin-left: calc(-1 * var(--s3)); }
  .sb .sec__add { opacity: 1; }
}

@media (max-width: 768px) { .sb { --sec-h: 44px; } }
</style>
