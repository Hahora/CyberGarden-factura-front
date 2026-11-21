<script setup lang="ts">
import { DATA_HIDDEN, DATA_TABS, runForPaper } from './dataTabs'
import { parsePaperPath } from './case'
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import CommandPalette from './components/CommandPalette.vue'
import KeysModal from './components/KeysModal.vue'
import ProjectModal from './components/ProjectModal.vue'
import Toasts from './components/Toasts.vue'
import UploadQueue from './components/UploadQueue.vue'
import UiPrompt from './components/UiPrompt.vue'
import TooltipLayer from './components/TooltipLayer.vue'
import RouteProgress from './components/RouteProgress.vue'
import { backStack, goBack } from './viewState'
import { backWhere } from './backWhere'
import Icon from './components/Icon.vue'
import { ACCENTS, canUndo, chatOf, deleteChat, dismiss, exportJSON, nav, picker, pinChat, projectOf, state, toast, undo } from './store'
import { FEATURES } from './features'
import { droppedFiles, inbox, runOf, sendToInbox } from './case/runs'
import { matches } from './keys'
import { isApi } from './config'
import { server } from './api/client'
import { watchHealth } from './api/auth'
import { SECTIONS } from './settingsSections'

const router = useRouter()
if (isApi) watch(() => server.state, (v) => { if (v === 'down') watchHealth() })
const backTop = computed(() => backStack[backStack.length - 1] ?? null)
const route = useRoute()
const routerReady = ref(false)
router.isReady().then(() => (routerReady.value = true))
nav.go = (path: string) => void router.push(path)

const systemDark = window.matchMedia('(prefers-color-scheme: dark)')
const sysDark = ref(systemDark.matches)
systemDark.addEventListener('change', (e) => (sysDark.value = e.matches))
watchEffect(() => {
  const a = state.appearance
  const root = document.documentElement
  root.dataset.theme = a.mode === 'system' ? (sysDark.value ? 'dark' : 'light') : a.mode
  root.dataset.motion = a.motion === 'on' ? 'off' : a.motion === 'off' ? 'full' : ''
  root.dataset.density = a.density
  const acc = ACCENTS[a.accent] ?? ACCENTS.sapphire!
  const dark = root.dataset.theme === 'dark'
  const [c1, c2, c3, c4] = acc.c
  const main = dark && acc.dark ? acc.dark : c1
  root.style.setProperty('--blue', main)
  root.style.setProperty('--blue-2', dark ? `color-mix(in srgb, ${main} 70%, #fff)` : c2)
  if (!dark) {
    root.style.setProperty('--blue-soft', c3)
    root.style.setProperty('--blue-wash', c4)
  } else {
    root.style.removeProperty('--blue-soft')
    root.style.removeProperty('--blue-wash')
  }
  root.style.setProperty('--fs', Math.min(16, Math.max(13, a.font)) + 'px')
  const c = a.contrast
  const light = c <= 50 ? 50 + c * 0.16 : 58 + (c - 50) * 0.44
  root.style.setProperty('--mx', (root.dataset.theme === 'dark' ? 58 + c * 0.22 : light) + '%')
  root.style.setProperty('--lx', 6 + c * 0.08 + '%')
})

const phone = window.matchMedia('(max-width: 768px)')
const syncPhone = () => {
  const m = phone.matches || window.innerWidth <= 768
  if (state.mobile !== m) state.mobile = m
  if (!m) state.drawer = false
}
syncPhone()
phone.addEventListener('change', syncPhone)
window.addEventListener('resize', syncPhone)
watch(() => route.fullPath, () => (state.drawer = false))
watch(() => state.drawer, (v) => document.documentElement.classList.toggle('drawer-open', v))
watch(() => state.palette || state.keysModal || !!state.projectModal, (v) => { if (v) state.drawer = false })

const upTo = computed<string | null>(() => {
  if (!state.mobile) return null
  const p = route.path
  if (p.startsWith('/passport')) return '/export'
  if (DATA_HIDDEN.some((t) => p.startsWith(t.to))) return '/facts'
  if (p === '/settings' && route.query.section) return '/settings'
  return null
})
function goUp() {
  if (backTop.value) return goBack(router)
  const back = window.history.state?.back
  if (typeof back === 'string' && back.split('?')[0] === upTo.value) router.back()
  else if (route.path.startsWith('/paper/')) {
    if (typeof back === 'string') return router.back()
    const pp = parsePaperPath(route.path)
    const id = pp ? runForPaper(pp.pid, pp.domain) : ''
    void router.push(id ? '/run/' + encodeURIComponent(id) : '/app')
  } else void router.push(upTo.value ?? '/app')
}
const upLabel = computed(() => (backTop.value ? backWhere(backTop.value).full : 'Назад'))

const isPaperChat = computed(() => FEATURES.chat && route.path.startsWith('/c/') && chatOf(String(route.params.id))?.kind === 'paper')

const AUTO = 'gs:sidebar-auto'
try {
  if (sessionStorage.getItem(AUTO) === '1') {
    sessionStorage.removeItem(AUTO)
    state.sidebar = true
  }
} catch { }
const onBarTitle = () => {
  if (isPaperChat.value) state.paperInfo = true
  else state.palette = true
}
const barTitle = computed(() => {
  const p = route.path
  if (p.startsWith('/run/')) return runOf(String(route.params.id))?.title ?? 'Разбор'
  if (p.startsWith('/paper/')) return 'Статья ' + String(route.params.pid ?? '')
  if (p.startsWith('/c/')) return chatOf(String(route.params.id))?.title ?? 'Чат'
  if (p.startsWith('/p/')) return projectOf(String(route.params.id))?.name ?? 'Проект'
  const tab = DATA_TABS.find((t) => p.startsWith(t.to))
  if (tab) return 'Данные'
  const hidden = DATA_HIDDEN.find((t) => p.startsWith(t.to))
  if (hidden) return hidden.label
  if (p.startsWith('/settings')) {
    const sec = SECTIONS.find((x) => x.id === route.query.section)
    return sec && (state.mobile || route.query.section) ? sec.name : 'Настройки'
  }
  return 'Фактура AI'
})

let sx = 0
let sy = 0
let edge = false
function inHScroll(el: EventTarget | null) {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true
  }
  return false
}
function onTouchStart(e: TouchEvent) {
  if (!state.mobile) return
  const t = e.touches[0]!
  sx = t.clientX
  sy = t.clientY
  edge = !state.drawer && sx >= 28 && sx <= 80 && !inHScroll(e.target)
}
function onTouchEnd(e: TouchEvent) {
  if (!state.mobile) return
  const t = e.changedTouches[0]!
  const dx = t.clientX - sx
  const dy = Math.abs(t.clientY - sy)
  if (dy > 60) return
  if (edge && dx > 60) state.drawer = true
  else if (state.drawer && dx < -60) state.drawer = false
}

const hasComposer = () => route.path === '/app' || route.path.startsWith('/run/')
picker.open = () => {
  if (hasComposer()) inbox.pick++
  else void router.push('/app').then(() => setTimeout(() => inbox.pick++, 60))
}
function newRun() {
  if (route.path === '/app') inbox.clear++
  else void router.push('/app')
}

async function handleDrop(dt: DataTransfer | null) {
  const { files, folder } = await droppedFiles(dt)
  if (!files.length) return
  if (!hasComposer()) await router.push('/app')
  sendToInbox(files, folder)
}

let depth = 0
const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
function onDragEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  depth++
  state.dragging = true
}
function onDragLeave(e: DragEvent) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) state.dragging = false
}
function onDragOver(e: DragEvent) {
  if (hasFiles(e)) e.preventDefault()
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  state.dragging = false
  void handleDrop(e.dataTransfer)
}

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
}
function onKey(e: KeyboardEvent) {
  const code = e.code
  const run = (fn: () => void) => {
    e.preventDefault()
    fn()
  }
  const chatId = route.path.startsWith('/c/') ? String(route.params.id) : null
  const hit = (id: string) => matches(id, e)
  if (hit('palette')) return run(() => (state.palette = !state.palette))
  if (hit('new')) return run(newRun)
  if (hit('upload')) return run(() => picker.open(null))
  if (hit('explore')) return run(() => void router.push('/facts'))
  if (hit('profile')) return run(() => void router.push('/settings?section=profile'))
  if (hit('sidebar')) return run(() => (state.sidebar = !state.sidebar))
  if (hit('settings')) return run(() => void router.push('/settings'))
  if (hit('keys')) return run(() => (state.keysModal = !state.keysModal))
  if (hit('pin') && chatId) return run(() => pinChat(chatId))
  if (hit('export') && chatId) {
    const c = chatOf(chatId)
    if (c?.paperId) return run(() => exportJSON([c.paperId!], c.paperId + '.json'))
  }
  if (hit('delete') && chatId) return run(() => {
    deleteChat(chatId)
    void router.push('/app')
  })
  if (hit('undo') && !typing(e)) return run(undoLast)
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return
  if (goPending && !e.shiftKey && !state.palette && !state.keysModal) {
    goPending = false
    if (code === 'KeyD') return run(() => void router.push('/facts'))
    if (code === 'KeyH') return run(() => void router.push('/app'))
  }
  if (hit('panel')) state.sidebar = !state.sidebar
  else if (hit('pdf')) picker.open(null)
  else if (hit('help')) state.keysModal = !state.keysModal
  else if (code === 'KeyG' && !e.shiftKey) {
    goPending = true
    clearTimeout(goTimer)
    goTimer = window.setTimeout(() => (goPending = false), 1200)
  }
}
let goPending = false
let goTimer = 0
function undoLast() {
  const t = [...state.toasts].reverse().find((x) => x.action && /^(Вернуть|Отменить)/.test(x.action.label))
  if (t?.action) {
    t.action.run()
    dismiss(t.id)
    return
  }
  if (canUndo()) undo()
  else toast('Отменять нечего')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDrop)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('drop', onDrop)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <div v-if="isApi && server.state === 'down' && routerReady && route.path !== '/'" class="srv-down" role="alert">Сервер недоступен</div>
  <template v-if="!routerReady" />
  <RouterView v-else-if="route.meta.bare" />
  <div v-else class="app" :class="{ 'is-collapsed': !state.sidebar && !state.mobile, 'is-phone': state.mobile, 'is-drawer': state.drawer }">
    <Sidebar />
    <Transition name="fade">
      <div v-if="state.mobile && state.drawer" class="scrim" aria-hidden="true" @click="state.drawer = false" />
    </Transition>

    <header v-if="state.mobile" class="bar">
      <button v-if="backTop || upTo" type="button" class="icon-btn bar__btn bar__back" :aria-label="upLabel" @click="goUp">
        <Icon name="arrow-right" :size="22" />
      </button>
      <button v-else type="button" class="icon-btn bar__btn" aria-label="Открыть меню" :aria-expanded="state.drawer" @click="state.drawer = true">
        <Icon name="menu" :size="22" />
      </button>
      <button type="button" class="bar__title" @click="onBarTitle">
        <span>{{ barTitle }}</span>
        <Icon :name="isPaperChat ? 'chevron-down' : 'search'" :size="15" />
      </button>
      <button v-if="isPaperChat" type="button" class="icon-btn bar__btn" aria-label="Поиск" @click="state.palette = true">
        <Icon name="search" :size="20" />
      </button>
      <button v-else type="button" class="icon-btn bar__btn" aria-label="Новый разбор" @click="newRun">
        <Icon name="newchat" :size="22" />
      </button>
    </header>
    <UploadQueue />
    <UiPrompt />
    <TooltipLayer />
    <RouteProgress />

    <main class="app__main">
      <RouterView v-slot="{ Component, route: r }">
        <component :is="Component" :key="r.path" />
      </RouterView>
    </main>

    <Transition name="fade">
      <div v-if="state.dragging && !hasComposer()" class="drop" aria-hidden="true">
        <div class="drop__box">
          <Icon name="upload" :size="34" />
          <p class="drop__title">Отпустите, чтобы добавить PDF</p>
          <p class="drop__hint">Файлы, папка или ZIP</p>
        </div>
      </div>
    </Transition>

    <CommandPalette />
    <KeysModal />
    <ProjectModal />
    <Toasts />
  </div>
</template>

<style scoped>
.app {
  display: grid; grid-template-columns: var(--sidebar) minmax(0, 1fr);
  height: 100%;
  transition: grid-template-columns var(--t-slow) var(--ease);
}
.app.is-collapsed { grid-template-columns: var(--sidebar-rail) minmax(0, 1fr); }
:global(html.is-resizing-x) .app { transition: none; }
.srv-down { position: fixed; z-index: 1000; top: var(--s3); left: 50%; translate: -50% 0; padding: var(--s2) var(--s4); border-radius: var(--r-lg); background: var(--ink); color: var(--bg); font-size: var(--fs-sm); box-shadow: 0 4px 16px rgb(0 0 0 / 0.18); }
.app__main { min-width: 0; height: 100%; overflow: hidden; background: var(--bg); }
.app.is-phone { display: flex; flex-direction: column; grid-template-columns: none; height: 100dvh; padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px); }
.app.is-phone .app__main { flex: 1; min-height: 0; height: auto; }
.bar {
  flex: none; display: flex; align-items: center; gap: var(--s1);
  height: calc(var(--appbar) + var(--safe-t)); padding: var(--safe-t) var(--s1) 0;
  background: var(--bg); border-bottom: 1px solid var(--line);
}
.bar__btn { width: 44px; height: 44px; border-radius: var(--r); }
.bar__title {
  flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: var(--s2);
  height: 44px; padding: 0 var(--s3); border-radius: var(--r); color: var(--ink); font-weight: 600; font-size: var(--fs-body);
}
.bar__title span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar__title :deep(.ico) { color: var(--muted); flex: none; }
.bar__title:active { background: var(--bg-2); }
.scrim { position: fixed; inset: 0; z-index: calc(var(--z-drawer) - 1); background: var(--scrim); }
.app.is-phone :deep(.dp__bar) { display: none; }

.drop {
  position: fixed; inset: 0; z-index: var(--z-overlay); display: grid; place-items: center;
  background: color-mix(in srgb, var(--bg) 86%, transparent); backdrop-filter: blur(6px);
}
.drop__box {
  display: grid; justify-items: center; gap: var(--s3); padding: var(--s10) calc(var(--s10) + var(--s6)); border-radius: var(--r-lg);
  border: 2px dashed var(--blue); background: var(--blue-wash); color: var(--blue-2);
}
.drop__title { font-size: var(--fs-h2); font-weight: 600; color: var(--ink); }
.drop__hint { color: var(--muted); }

.app__main > :deep(*) { animation: rise var(--t-enter) var(--ease) both; }
.bar__back :deep(.ico) { rotate: 180deg; }
</style>
