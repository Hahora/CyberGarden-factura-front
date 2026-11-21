<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import DataPage from './DataPage.vue'
import IssuesList from './IssuesList.vue'
import UiEmpty from './UiEmpty.vue'
import UiSelect, { type Option } from './UiSelect.vue'
import UiStat from './UiStat.vue'
import { isIssueOpen } from '../case'
import { RAG_CHECK_GROUPS, ragCheckGroup, ragInScope, ragIssuesOf, ragPublication, type RagCheckGroup } from '../case/rag'
import { dataPids, useDataReady, useRunFilter } from '../dataTabs'
import { plural } from '../search'
import { state } from '../store'
import { fmtInt } from '../fmt'

const ui = useRunFilter('checks-rag', () => ({ groups: [] as string[], papers: [] as string[] }))
const pids = computed(() => dataPids.value.filter(ragInScope))
const ready = useDataReady(pids)

const issues = computed(() => pids.value.flatMap((p) => ragIssuesOf(p)))
const groups = computed(() =>
  RAG_CHECK_GROUPS.map((g) => {
    const items = issues.value.filter((i) => ragCheckGroup(i.check_name, i.description) === g)
    return { id: g, n: items.length, papers: new Set(items.map((i) => i.publication_id)).size, open: items.filter((i) => isIssueOpen(i.publication_id, i.issue_id, 'rag')).length }
  }).filter((g) => g.n),
)
const GROUP_HINT: Record<RagCheckGroup, string> = {
  'Шкала и нормализация': 'Проценты и доли, округление и единицы: число могли записать не в той шкале',
  'Протокол и сопоставимость': 'Как проводили оценку: сравнивать эти числа напрямую нельзя без оговорок',
  'Противоречия': 'Текст и таблицы или разные таблицы называют одно и то же по-разному',
  'Графики и чтение': 'Значения прочитаны с графика, они приблизительные',
  'Прочее': 'Остальные замечания к статье',
}
const activeGroups = computed(() => ui.groups.filter((g) => groups.value.some((x) => x.id === g)) as RagCheckGroup[])
const listEl = ref<HTMLElement | null>(null)

const total = computed(() => issues.value.length)
const open = computed(() => groups.value.reduce((a, g) => a + g.open, 0))
const clean = computed(() => pids.value.filter((p) => !ragIssuesOf(p).length).length)

const paperOpts = computed<Option[]>(() =>
  pids.value.filter((p) => ragIssuesOf(p).length).map((p) => ({ value: p, label: `${p} · ${ragPublication(p)?.title ?? ''}` })),
)
const shownPids = computed(() => {
  const only = ui.papers.filter((p) => pids.value.includes(p))
  return only.length ? only : pids.value
})
function toggleGroup(id: string) {
  const add = !ui.groups.includes(id)
  ui.groups = add ? [...ui.groups, id] : ui.groups.filter((r) => r !== id)
  if (add) void nextTick(() => listEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const asArr = (v: string | string[]) => (Array.isArray(v) ? v : [v])
const dirty = computed(() => !!(activeGroups.value.length || ui.papers.length))
const reset = () => { ui.groups = []; ui.papers = [] }
const papersN = (n: number) => `${n} ${plural(n, ['статья', 'статьи', 'статей'])}`
const issuesN = (n: number) => plural(n, ['замечания', 'замечаний', 'замечаний'])
const ofPapers = (n: number) => `${n} ${plural(n, ['статьи', 'статей', 'статей'])}`
</script>

<template>
  <DataPage title="Проверки" :loading="!ready" :flow="state.mobile">
    <template v-if="pids.length && ready" #toolbar>
      <UiSelect
        :class="{ 'filter-on': ui.papers.length }" :model-value="ui.papers" :options="paperOpts" label="Статья" placeholder="Статья" multiple searchable variant="chip"
        :size="state.mobile ? 'md' : 'sm'" :min-width="340" :summary="papersN" @update:model-value="(v) => (ui.papers = asArr(v))"
      />
      <button v-if="dirty" type="button" class="link" @click="reset">Сбросить</button>
    </template>

    <UiEmpty v-if="!pids.length" icon="shield" title="Замечаний пока нет" text="Они появятся, когда статьи будут разобраны." />
    <div v-else class="ck">
      <p class="ck__sum num">
        <b>{{ fmtInt(open) }}</b> из {{ fmtInt(total) }} {{ issuesN(total) }} нужно проверить · без замечаний {{ clean }} из {{ ofPapers(pids.length) }}
      </p>
      <div class="ck__cards" role="group" aria-label="Группы замечаний">
        <UiStat
          v-for="g in groups" :key="g.id" button :on="activeGroups.includes(g.id)" :value="g.n" :label="g.id"
          :hint="`${GROUP_HINT[g.id]} · ${papersN(g.papers)}`" @click="toggleGroup(g.id)"
        />
      </div>
      <div ref="listEl" class="ck__list">
        <IssuesList :pids="shownPids" :only-groups="activeGroups" :limit="25" domain="rag" />
      </div>
    </div>
  </DataPage>
</template>

<style scoped>
.ck { display: grid; gap: var(--s4); min-width: 0; }
.ck__sum { font-size: var(--fs-body); color: var(--muted); }
.ck__sum b { color: var(--ink); font-weight: 600; }
.ck__list { scroll-margin-top: calc(var(--s16, 64px) + var(--s4)); min-width: 0; }
.ck__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--s2); }
@media (max-width: 768px) {
  .ck__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ck__cards > :last-child:nth-child(odd) { grid-column: 1 / -1; }
}
</style>
