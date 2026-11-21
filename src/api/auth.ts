import { ref } from 'vue'
import { ApiError, checkHealth, get, hasToken, post, refresh, request, server, setToken } from './client'
import { clearRemote, refreshRuns } from './runs'
import { runsLoad } from './state'
import { state } from '../store'
import { ensureDataRun, followRun } from '../dataTabs'
import { reviewScope, setReviewScope } from '../case'
import { runOf, sortedRuns } from '../case/runs'

interface ApiUser { id: string; email: string; name?: string | null; role?: string | null; team?: string | null; focus?: string | null }
export const authed = ref(false)

function applyUser(u: ApiUser) {
  state.profile.email = u.email
  state.profile.name = u.name?.trim() || u.email.split('@')[0]!
  if (u.role) state.profile.role = u.role
  if (u.team) state.profile.team = u.team
  if (u.focus) state.profile.focus = u.focus
}
export async function reloadRuns() {
  runsLoad.state = 'loading'
  try { await refreshRuns(); runsLoad.state = 'ready' } catch { runsLoad.state = 'error' }
}
async function afterLogin() {
  authed.value = true
  try { applyUser(await get<ApiUser>('/auth/me', undefined, { silent: true })) } catch { }
  void reloadRuns().then(() => {
    ensureDataRun()
    if (!runOf(reviewScope.value)) setReviewScope(sortedRuns()[0]?.id ?? '')
    followRun({ path: location.pathname, query: Object.fromEntries(new URLSearchParams(location.search)) })
  })
}

export async function login(email: string, password: string, remember = false) {
  const b = await post<{ access_token: string; expires_in?: number; user?: ApiUser }>('/auth/login', { email, password, remember }, { anon: true, silent: true })
  setToken(b.access_token, b.expires_in)
  if (b.user) applyUser(b.user)
  await afterLogin()
}
export async function logout() {
  try { await request('/auth/logout', { method: 'POST', silent: true }) } catch { }
  setToken('')
  authed.value = false
  clearRemote()
  state.profile.name = 'Исследователь'
  state.profile.email = 'team@faktura.ai'
}

let startP: Promise<void> | null = null
export function startApi(): Promise<void> {
  startP ??= (async () => {
    void checkHealth().then((ok) => { if (!ok) watchHealth() })
    if (!hasToken() && !(await refresh())) { runsLoad.state = 'ready'; return }
    try { await afterLogin() } catch (e) { if (!(e instanceof ApiError)) authed.value = false }
    if (!authed.value) { setToken(''); runsLoad.state = 'ready' }
  })()
  return startP
}
let hw = 0
export function watchHealth() {
  window.clearInterval(hw)
  hw = window.setInterval(async () => {
    if (server.state === 'up') return window.clearInterval(hw)
    if (await checkHealth()) {
      window.clearInterval(hw)
      startP = null
      void startApi()
    }
  }, 10_000)
}
