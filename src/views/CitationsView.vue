<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DataPage from '../components/DataPage.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import UiSelect from '../components/UiSelect.vue'
import Icon from '../components/Icon.vue'
import SourceList from '../components/SourceList.vue'
import { isApi } from '../config'
import { ApiError, get } from '../api/client'
import { chatSources, loadThreads, type Source } from '../api/chat'
import { errText } from '../api/edits'
import { dataRun, dataRunTitle } from '../dataTabs'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { useViewState } from '../viewState'

type Work = Source & { pid?: string | null }
type Rel = 'all' | 'cites' | 'related' | 'this' | 'search'
const REL_OPTS: { value: Rel; label: string }[] = [
  { value: 'all', label: 'Все работы' },
  { value: 'cites', label: 'Цитируют статьи' },
  { value: 'related', label: 'Связанные работы' },
  { value: 'search', label: 'Найдено в чатах' },
  { value: 'this', label: 'Сами статьи' },
]

const ui = useViewState('citations', () => ({ rel: 'all' as Rel, pid: 'all' }))
const loading = ref(false)
const error = ref('')
const works = ref<Work[]>([])
const fromChats = ref(false)

const key = (w: Work) => (w.openalex_id || w.doi || w.title) + '|' + (w.pid ?? '')
function merge(list: Work[]): Work[] {
  const m = new Map<string, Work>()
  for (const w of list) {
    const k = key(w)
    const o = m.get(k)
    if (!o) { m.set(k, { ...w, cited_in: [...(w.cited_in ?? [])] }); continue }
    const seen = new Set((o.cited_in ?? []).map((c) => c.message_id))
    for (const c of w.cited_in ?? []) if (!seen.has(c.message_id)) o.cited_in!.push(c)
  }
  return [...m.values()]
}

async function load() {
  const run = dataRun.value
  works.value = []
  error.value = ''
  if (!isApi || !run) return
  loading.value = true
  try {
    let list: Work[] = []
    try {
      const r = await get<{ data: { pid: string; sources: Work[] }[] }>(`/runs/${encodeURIComponent(run)}/citations`, undefined, { silent: true })
      list = r.data.flatMap((x) => x.sources.map((s) => ({ ...s, pid: s.pid ?? x.pid })))
      fromChats.value = false
    } catch (e) {
      if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405) || e.code === 'not_found') throw e
      fromChats.value = true
    }
    const threads = await loadThreads(run)
    const chats = await Promise.all(threads.map((t) => chatSources(run, t.id).then((r) => r.sources ?? []).catch(() => [] as Source[])))
    list = list.concat(chats.flat().map((s) => ({ ...s, relation: s.relation ?? 'search' })))
    works.value = merge(list).sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))
  } catch (e) {
    error.value = errText(e, 'Не удалось загрузить цитирования')
  } finally { loading.value = false }
}
watch(dataRun, () => void load(), { immediate: true })

const pids = computed(() => [...new Set(works.value.map((w) => w.pid).filter((x): x is string => !!x))].sort())
const pidOpts = computed(() => [{ value: 'all', label: 'Все статьи' }, ...pids.value.map((p) => ({ value: p, label: p }))])
const pidOn = computed(() => (ui.pid !== 'all' && pids.value.includes(ui.pid) ? ui.pid : 'all'))
const list = computed(() => works.value.filter((w) => (ui.rel === 'all' || w.relation === ui.rel) && (pidOn.value === 'all' || w.pid === pidOn.value)))
const count = (r: Rel) => (r === 'all' ? works.value.length : works.value.filter((w) => w.relation === r).length)
const relOpts = computed(() => REL_OPTS.filter((o) => o.value === 'all' || count(o.value) > 0).map((o) => ({ value: o.value as string, label: `${o.label} · ${fmtInt(count(o.value))}` })))
const dirty = computed(() => ui.rel !== 'all' || pidOn.value !== 'all')
const reset = () => { ui.rel = 'all'; ui.pid = 'all' }
const sub = computed(() => `${dataRunTitle.value} · ${fmtInt(works.value.length)} ${plural(works.value.length, ['работа', 'работы', 'работ'])}`)
</script>

<template>
  <DataPage title="Цитирования и похожие работы" :loading="loading" :sub="sub">
    <template #skeleton>
      <div class="sk"><div v-for="i in 4" :key="i" class="card sk__i"><UiSkeleton :lines="3" /></div></div>
    </template>
    <template v-if="works.length" #toolbar>
      <UiSelect :model-value="ui.rel" :options="relOpts" label="Тип" variant="chip" size="sm" :class="{ 'filter-on': ui.rel !== 'all' }" @update:model-value="(v) => (ui.rel = v as Rel)" />
      <UiSelect v-if="pids.length > 1" :model-value="pidOn" :options="pidOpts" label="Статья" variant="chip" size="sm" :class="{ 'filter-on': pidOn !== 'all' }" @update:model-value="(v) => (ui.pid = v as string)" />
      <button v-if="dirty" type="button" class="chip" @click="reset">Сбросить<Icon name="x" :size="14" /></button>
    </template>

    <p class="note"><Icon name="info" :size="15" />Работы найдены в открытых научных базах. Они не входят в набор для сдачи и не проверялись по данным разбора.</p>

    <UiEmpty v-if="!isApi" icon="book" title="Цитирования появятся с сервером" text="В демо-режиме научные базы не подключены. С бэком здесь будут работы, которые цитируют статьи разбора, и похожие работы." />
    <UiEmpty v-else-if="error" icon="info" :title="error" action="Повторить" @action="load" />
    <UiEmpty
      v-else-if="!works.length" icon="book" title="Цитирований пока нет"
      :text="fromChats ? 'Спросите в чате разбора, кто цитирует статью или что почитать рядом — найденные работы соберутся здесь.' : 'Для статей этого разбора в научных базах ничего не нашлось.'"
    />
    <UiEmpty v-else-if="!list.length" icon="book" title="Ничего не подошло" text="Смените тип или статью." action="Сбросить фильтры" @action="reset" />
    <SourceList v-else :sources="list" full />
  </DataPage>
</template>

<style scoped>
.note { display: flex; align-items: flex-start; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
.note :deep(svg) { flex: none; margin-top: 3px; }
.sk { display: grid; gap: var(--s4); }
.sk__i { padding: var(--s5); }
</style>
