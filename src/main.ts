import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import { trackNavigation } from './viewState'
import { followRun } from './dataTabs'
import { FEATURES } from './features'
import './styles.css'
import { isApi } from './config'
import { hasToken, setAuthLost } from './api/client'
import { startApi } from './api/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/LandingView.vue'), meta: { bare: true } },
    { path: '/landing', redirect: '/' },
    { path: '/app', component: () => import('./views/HomeView.vue') },
    { path: '/corpus', redirect: '/facts' },
    { path: '/facts', component: () => import('./views/FactsTableView.vue') },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { bare: true } },
    { path: '/paper/:domain(solar|rag)/:pid', component: () => import('./views/PaperView.vue'), props: (r) => ({ pid: r.params.pid, domain: r.params.domain }) },
    { path: '/paper/:pid', component: () => import('./views/PaperView.vue'), props: (r) => ({ pid: r.params.pid, domain: 'solar' }) },
    { path: '/run/:id(demo-dev|demo-rag)', redirect: '/app' },
    { path: '/run/:id', component: () => import('./views/RunView.vue'), props: true },
    { path: '/c/:id', component: () => import('./views/ChatView.vue'), props: true, beforeEnter: () => FEATURES.chat || '/app' },
    { path: '/p/:id', component: () => import('./views/ProjectView.vue'), props: true, beforeEnter: () => FEATURES.projects || '/app' },
    { path: '/explore', redirect: '/facts' },
    { path: '/compare', component: () => (isApi ? import('./views/FrozenView.vue') : import('./views/CompareView.vue')), meta: { title: 'Сравнение' }, beforeEnter: () => (FEATURES.compare ? true : '/facts') },
    FEATURES.graph ? { path: '/graph', component: () => (isApi ? import('./views/FrozenView.vue') : import('./views/GraphView.vue')), meta: { title: 'Связи' } } : { path: '/graph', redirect: '/app' },
    { path: '/checks', component: () => import('./views/ChecksView.vue') },
    { path: '/quality', redirect: '/checks?section=accuracy' },
    { path: '/dictionary', redirect: '/settings?section=normalize' },
    { path: '/history', component: () => import('./views/HistoryView.vue'), meta: { title: 'Журнал правок' } },
    { path: '/export', component: () => import('./views/ExportView.vue'), meta: { title: 'Экспорт', download: true } },
    { path: '/passport', component: () => import('./views/PassportView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
    { path: '/profile', redirect: '/settings?section=profile' },
    { path: '/:rest(.*)*', redirect: '/app' },
  ],
})

if (isApi) {
  const open = (p: string) => p === '/' || p === '/landing' || p === '/login'
  router.beforeEach(async (to) => {
    await startApi()
    if (to.path === '/login' && hasToken()) return { path: '/app' }
    if (!open(to.path) && !hasToken()) return { path: '/login', query: { next: to.fullPath } }
    return true
  })
  setAuthLost(() => { if (router.currentRoute.value.path !== '/login' && !open(router.currentRoute.value.path)) void router.push({ path: '/login', query: { next: router.currentRoute.value.fullPath } }) })
}

router.afterEach((to, from) => { trackNavigation(to.fullPath, to.path, from.path); followRun(to) })

createApp(App).use(router).mount('#app')

const prefetch = () => {
  for (const r of router.getRoutes()) {
    const c = r.components?.default
    if (typeof c === 'function') void (c as () => Promise<unknown>)().catch(() => {})
  }
}
const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
if (idle) idle(prefetch)
else window.setTimeout(prefetch, 1500)
