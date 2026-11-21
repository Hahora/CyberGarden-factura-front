<script setup lang="ts">
import { computed, reactive, toRef, watch } from 'vue'
import { isApi } from '../config'
import { get, request } from '../api/client'
import { errText } from '../api/edits'
import { useRouter } from 'vue-router'
import DataPage from '../components/DataPage.vue'
import UiSelect from '../components/UiSelect.vue'
import UiEmpty from '../components/UiEmpty.vue'
import Icon from '../components/Icon.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import { plural } from '../search'
import { openDeep, useViewState } from '../viewState'
import { state, toast } from '../store'
import { resultLink, reviewOf, setReview, resetReview, type Review } from '../case'
import { dataPids, dataRun, dataRunTitle, useDataReady } from '../dataTabs'
import { J_FILTER, J_VERB, jLink, jPaper, jPlace, journal, type JEntry, type JKind } from '../journal'

const router = useRouter()

const ui = useViewState('history', () => ({ kind: 'all' as JKind | 'all', pid: 'all' }))
const kind = toRef(ui, 'kind')
const pid = toRef(ui, 'pid')
const ready = useDataReady(dataPids)
const all = computed(() => journal(dataPids.value))
const kindOpts = J_FILTER.map((a) => ({ value: a.id as string, label: a.id === 'all' ? 'Все действия' : a.label }))
const pids = computed(() => [...new Set(all.value.map((e) => e.pid))].sort())
const paperOpts = computed(() => [{ value: 'all', label: 'Все статьи' }, ...pids.value.map((p) => ({ value: p, label: `${p} · ${jPaper(p)}` }))])
const pidOn = computed(() => (pid.value !== 'all' && pids.value.includes(pid.value) ? pid.value : 'all'))
const dirty = computed(() => kind.value !== 'all' || pidOn.value !== 'all')
const reset = () => ((kind.value = 'all'), (pid.value = 'all'))

const list = computed(() => all.value.filter((e) => (kind.value === 'all' || e.kind === kind.value) && (pidOn.value === 'all' || e.pid === pidOn.value)))

const DAY = 864e5
const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0)
const dayLabel = (t: number) => {
  if (!t) return 'Раньше'
  const d = Math.round((dayStart(Date.now()) - dayStart(t)) / DAY)
  if (d <= 0) return 'Сегодня'
  if (d === 1) return 'Вчера'
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}
const timeLabel = (t: number) => (t ? new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '')

const groups = computed(() => {
  const g: { label: string; items: JEntry[] }[] = []
  for (const e of list.value) {
    const label = dayLabel(e.at)
    const last = g[g.length - 1]
    if (last && last.label === label) last.items.push(e)
    else g.push({ label, items: [e] })
  }
  return g
})

const TONE: Record<JKind, string> = { accepted: 'dot--ok', fixed: 'dot--blue', rejected: '' }
const runQ = computed(() => dataRun.value || undefined)
const open = (e: JEntry) => void openDeep(router, jLink(e, runQ.value))

interface HAction { id: string; action: 'review' | 'batch' | 'issue' | 'reset' | string; label: string; run_id: string; undone: boolean; at: string; changes?: unknown }
const srv = reactive({ list: [] as HAction[], loaded: false, busy: '' })
async function loadHist() {
  try {
    const r = await get<{ data: HAction[] }>('/history', { run: dataRun.value || undefined, limit: 50 }, { silent: true })
    srv.list = r.data ?? []
  } catch (e) { toast(errText(e, 'Не удалось загрузить журнал')) } finally { srv.loaded = true }
}
if (isApi) watch(dataRun, () => void loadHist(), { immediate: true })
const A_VERB: Record<string, string> = { review: 'Правка значения', batch: 'Правка нескольких значений', issue: 'Отметка замечания', fix: 'Исправление замечания', reset: 'Сброс правок' }
const hTime = (a: HAction) => Date.parse(a.at) || 0
const hGroups = computed(() => {
  const g: { label: string; items: HAction[] }[] = []
  for (const a of srv.list) {
    const label = dayLabel(hTime(a))
    const last = g[g.length - 1]
    if (last && last.label === label) last.items.push(a)
    else g.push({ label, items: [a] })
  }
  return g
})
function hTarget(a: HAction) {
  const c = Array.isArray(a.changes) ? a.changes[0] : a.changes
  const o = (c && typeof c === 'object' ? c : {}) as { pid?: string; rid?: string; result_id?: string; domain?: 'solar' | 'rag' }
  const rid = o.rid ?? o.result_id
  if (!o.pid || !rid) return null
  const l = resultLink(o.pid, rid, o.domain === 'rag' ? 'rag' : 'solar')
  return { ...l, query: { ...l.query, run: a.run_id } }
}
const hLast = computed(() => srv.list.find((a) => !a.undone))
async function undoAction(a: HAction) {
  if (srv.busy) return
  srv.busy = a.id
  try {
    await request(`/actions/${encodeURIComponent(a.id)}/undo`, { method: 'POST', silent: true })
    ;(await import('../api/runs')).reloadRunPapers(a.run_id)
    toast(`Отменено: ${a.label}`)
    await loadHist()
  } catch (e) { toast(errText(e, 'Не удалось отменить')) } finally { srv.busy = '' }
}

const last = computed(() => all.value[0])
function undoLast() {
  if (isApi) { if (hLast.value) void undoAction(hLast.value); return }
  const e = last.value
  if (!e) return
  const prev: Review = { ...reviewOf(e.pid, e.rid) }
  resetReview(e.pid, e.rid)
  toast(`Отменено: ${e.subject} (${e.pid})`, { label: 'Вернуть', run: () => setReview(e.pid, e.rid, prev) })
}
const count = computed(() => (isApi ? srv.list.length : list.value.length))
const sub = computed(() => `${dataRunTitle.value} · ${count.value} ${plural(count.value, ['действие', 'действия', 'действий'])}`)
const canUndo = computed(() => (isApi ? !!hLast.value && !srv.busy : !!last.value))
const undoTip = computed(() => (isApi ? hLast.value?.label : last.value ? `${J_VERB[last.value.kind]}: ${last.value.subject}` : undefined))
</script>

<template>
  <DataPage title="Журнал правок" :loading="isApi ? !srv.loaded : !ready" :tabs="false" :sub="sub" back-to="/facts">
    <template #actions>
      <button type="button" class="btn btn--soft btn--sm" :disabled="!canUndo" :data-tip="undoTip" @click="undoLast">
        <Icon name="undo" :size="16" />{{ state.mobile ? 'Отменить' : 'Отменить последнее' }}
      </button>
    </template>
    <template #skeleton>
      <div class="hsk" aria-busy="true">
        <div v-for="i in 6" :key="i" class="hsk__row">
          <UiSkeleton variant="circle" width="32px" />
          <div class="hsk__t"><UiSkeleton :lines="2" /></div>
        </div>
      </div>
    </template>
    <template v-if="!isApi && all.length" #toolbar>
      <UiSelect :model-value="kind" :options="kindOpts" label="Действие" variant="chip" size="sm" :class="{ 'filter-on': kind !== 'all' }" @update:model-value="(v) => (kind = v as typeof kind)" />
      <UiSelect :model-value="pidOn" :options="paperOpts" label="Статья" variant="chip" size="sm" :min-width="320" :class="{ 'filter-on': pidOn !== 'all' }" @update:model-value="(v) => (pid = v as string)" />
      <button v-if="dirty" type="button" class="chip" @click="reset">Сбросить<Icon name="x" :size="14" /></button>
    </template>

    <template v-if="isApi">
      <section v-for="g in hGroups" :key="g.label" class="day">
        <h2>{{ g.label }}</h2>
        <ul class="card">
          <li v-for="a in g.items" :key="a.id" class="row" :class="{ 'is-undone': a.undone }">
            <div class="row__main">
              <p class="row__t">
                <span class="st"><i class="dot" :class="a.action === 'reset' ? 'dot--warn' : a.action === 'issue' ? 'dot--blue' : 'dot--ok'" />{{ A_VERB[a.action] ?? 'Действие' }}</span>
                <b>{{ a.label }}</b>
              </p>
              <p class="row__d">{{ a.undone ? 'Отменено · ' : '' }}<time v-if="hTime(a)" class="num" :datetime="a.at">{{ timeLabel(hTime(a)) }}</time></p>
            </div>
            <div class="acts">
              <button v-if="!a.undone" type="button" class="link" :disabled="!!srv.busy" @click="undoAction(a)"><Icon name="undo" :size="15" />Отменить</button>
              <button v-if="hTarget(a)" type="button" class="link" @click="openDeep(router, hTarget(a)!)">К значению<Icon name="arrow-right" :size="16" /></button>
            </div>
          </li>
        </ul>
      </section>
      <UiEmpty
        v-if="!srv.list.length" icon="history" title="Правок пока нет"
        text="Принимайте, исправляйте и отклоняйте значения в таблице или в статье — каждое действие появится здесь."
      >
        <template #action><RouterLink class="btn btn--soft btn--sm" :to="{ path: '/facts', query: runQ ? { run: runQ } : {} }">Открыть таблицу</RouterLink></template>
      </UiEmpty>
    </template>
    <template v-else>
    <section v-for="g in groups" :key="g.label" class="day">
      <h2>{{ g.label }}</h2>
      <ul class="card">
        <li v-for="e in g.items" :key="e.key" class="row">
          <div class="row__main">
            <p class="row__t">
              <span class="st"><i class="dot" :class="TONE[e.kind]" />{{ J_VERB[e.kind] }}</span>
              <b>{{ e.subject }}</b>
            </p>
            <p v-if="e.from" class="chg num">
              <span class="from">{{ e.from }}</span><Icon name="arrow-right" :size="14" /><span class="to">{{ e.to }}</span>
            </p>
            <p class="row__d">{{ jPlace(e) }} · {{ jPaper(e.pid) }}</p>
            <p v-if="e.at" class="row__d">{{ state.profile.name }} · <time class="num" :datetime="new Date(e.at).toISOString()">{{ timeLabel(e.at) }}</time></p>
          </div>
          <button type="button" class="link" @click="open(e)">К значению<Icon name="arrow-right" :size="16" /></button>
        </li>
      </ul>
    </section>

    <UiEmpty
      v-if="!groups.length && all.length" icon="history" title="Ничего не подошло" text="Смените действие или статью."
      action="Сбросить фильтры" @action="reset"
    />
    <UiEmpty
      v-else-if="!all.length" icon="history" title="Правок пока нет"
      text="Принимайте, исправляйте и отклоняйте значения в таблице или в статье — каждое действие появится здесь."
    >
      <template #action><RouterLink class="btn btn--soft btn--sm" :to="{ path: '/facts', query: runQ ? { run: runQ } : {} }">Открыть таблицу</RouterLink></template>
    </UiEmpty>
    </template>
  </DataPage>
</template>

<style scoped>
.hsk { display: grid; gap: var(--s4); }
.hsk__row { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: var(--s3); align-items: center; padding: var(--s2) 0; }
.hsk__t { min-width: 0; max-width: 520px; }
.day { display: grid; gap: var(--s2); }
.day h2 { padding: 0 var(--s1); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.card { list-style: none; padding: 0; overflow: hidden; }
.row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--s2) var(--s4); align-items: start; padding: var(--s4) var(--s5); min-width: 0; }
.row + .row { border-top: 1px solid var(--line); }
.row__main { min-width: 0; display: grid; gap: var(--s1); }
.row__t { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s3); font-size: var(--fs-body); }
.st { display: inline-flex; align-items: center; gap: var(--s2); font-size: var(--fs-sm); font-weight: 500; }
.row__d { font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; overflow-wrap: anywhere; }
.chg { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.from { text-decoration: line-through; text-decoration-color: var(--faint); }
.to { color: var(--ink); font-weight: 500; }
.link { min-height: 32px; font-size: var(--fs-sm); }
.acts { display: flex; flex-wrap: wrap; gap: var(--s1) var(--s4); justify-content: flex-end; }
.is-undone .row__t b { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--faint); }
@media (max-width: 768px) { .acts { justify-content: flex-start; } }

@media (max-width: 768px) {
  .row { grid-template-columns: minmax(0, 1fr); padding: var(--s4); }
  .link { min-height: 44px; justify-self: start; }
}
</style>
