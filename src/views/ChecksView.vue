<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import DataPage from '../components/DataPage.vue'
import RagChecks from '../components/RagChecks.vue'
import IssuesList from '../components/IssuesList.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiSelect, { type Option } from '../components/UiSelect.vue'
import UiStat from '../components/UiStat.vue'
import { checkLabel, inScope, isIssueOpen, issuesOf, publication } from '../case'
import { dataDomain, dataPids, useDataReady, useRunFilter } from '../dataTabs'
import { plural } from '../search'
import { state } from '../store'
import { fmtInt } from '../fmt'

const ui = useRunFilter('checks', () => ({ rules: [] as string[], papers: [] as string[] }))
const isRag = computed(() => dataDomain.value === 'rag')
const ready = useDataReady(dataPids)
const pids = computed(() => (isRag.value ? [] : dataPids.value.filter(inScope)))

const rules = computed(() => {
  const m = new Map<string, { n: number; papers: Set<string> }>()
  for (const pid of pids.value) {
    for (const i of issuesOf(pid)) {
      let g = m.get(i.check_name)
      if (!g) m.set(i.check_name, (g = { n: 0, papers: new Set() }))
      g.n++
      g.papers.add(pid)
    }
  }
  return [...m].map(([id, g]) => ({ id, label: checkLabel(id), n: g.n, papers: g.papers.size })).sort((a, b) => b.n - a.n)
})
const GROUPS = [
  { id: 'num', title: 'Числа не сходятся', text: 'КПД, напряжение, ток и фактор заполнения должны подтверждать друг друга',
    checks: ['jv_consistency', 'voc_limit', 'voc_deficit_consistency', 'eqe_consistency', 'champion_vs_mean', 'hysteresis_index', 'derived_values', 'range', 'plausibility'] },
  { id: 'con', title: 'Противоречия в статье', text: 'Одно и то же значение в разных местах названо по-разному',
    checks: ['contradiction', 'possible_swap', 'figure_mismatch', 'ambiguity', 'typo'] },
  { id: 'unit', title: 'Единицы и округление', text: 'Значения в разных единицах или округлены не одинаково',
    checks: ['unit_inconsistency', 'rounding', 'rounding_inconsistency'] },
  { id: 'cond', title: 'Условия измерения', text: 'Освещение, площадь и направление развёртки: можно ли сравнивать числа',
    checks: ['missing_conditions', 'measurement_conditions', 'comparability'] },
  { id: 'misc', title: 'Прочее', text: 'Значения только на рисунке, из цитат, повторы и смешанный текст', checks: [] as string[] },
]
const grouped = computed(() => {
  const known = new Set(GROUPS.flatMap((g) => g.checks))
  return GROUPS.map((g) => ({
    ...g,
    rules: rules.value.filter((r) => (g.id === 'misc' ? !known.has(r.id) : g.checks.includes(r.id))),
  })).filter((g) => g.rules.length)
})
const activeRules = computed(() => ui.rules.filter((id) => rules.value.some((r) => r.id === id)))
const listEl = ref<HTMLElement | null>(null)

const total = computed(() => rules.value.reduce((a, r) => a + r.n, 0))
const open = computed(() => pids.value.reduce((a, p) => a + issuesOf(p).filter((i) => isIssueOpen(p, i.issue_id)).length, 0))
const clean = computed(() => pids.value.filter((p) => !issuesOf(p).length).length)

const paperOpts = computed<Option[]>(() =>
  pids.value.filter((p) => issuesOf(p).length).map((p) => ({ value: p, label: `${p} · ${publication(p)?.title ?? ''}` })),
)
const shownPids = computed(() => {
  const only = ui.papers.filter((p) => pids.value.includes(p))
  return only.length ? only : pids.value
})
function toggleRule(id: string) {
  const add = !ui.rules.includes(id)
  ui.rules = add ? [...ui.rules, id] : ui.rules.filter((r) => r !== id)
  if (add) void nextTick(() => listEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
const asArr = (v: string | string[]) => (Array.isArray(v) ? v : [v])
const dirty = computed(() => !!(activeRules.value.length || ui.papers.length))
const reset = () => { ui.rules = []; ui.papers = [] }
const ofPapers = (n: number) => `${n} ${plural(n, ['статьи', 'статей', 'статей'])}`
const papersN = (n: number) => `${n} ${plural(n, ['статья', 'статьи', 'статей'])}`
</script>

<template>
  <RagChecks v-if="isRag" />
  <DataPage v-else title="Проверки" :loading="!ready" :flow="state.mobile">
    <template v-if="pids.length" #toolbar>
      <UiSelect
        :class="{ 'filter-on': ui.papers.length }" :model-value="ui.papers" :options="paperOpts" label="Статья" placeholder="Статья" multiple searchable variant="chip"
        :size="state.mobile ? 'md' : 'sm'" :min-width="340" :summary="papersN" @update:model-value="(v) => (ui.papers = asArr(v))"
      />
      <button v-if="dirty" type="button" class="link" @click="reset">Сбросить</button>
    </template>

    <UiEmpty v-if="!pids.length" icon="shield" title="Замечаний пока нет" text="Они появятся, когда статьи будут разобраны." />
    <div v-else class="ck">
      <p class="ck__sum num">
        <b>{{ fmtInt(open) }}</b> из {{ fmtInt(total) }} {{ plural(total, ['замечания', 'замечаний', 'замечаний']) }} нужно проверить · без замечаний {{ clean }} из {{ ofPapers(pids.length) }}
      </p>
      <section v-for="g in grouped" :key="g.id" class="ck__g" :aria-label="g.title">
        <h2 class="ck__h">{{ g.title }}</h2>
        <p class="ck__t">{{ g.text }}</p>
        <div class="ck__cards" role="group" :aria-label="g.title">
          <UiStat
            v-for="r in g.rules" :key="r.id" button :on="activeRules.includes(r.id)" :value="r.n" :label="r.label" :hint="papersN(r.papers)"
            @click="toggleRule(r.id)"
          />
        </div>
      </section>
      <div ref="listEl" class="ck__list">
        <IssuesList :pids="shownPids" :checks="activeRules" />
      </div>
    </div>
  </DataPage>
</template>

<style scoped>
.ck { display: grid; gap: var(--s4); min-width: 0; }
.ck__sum { font-size: var(--fs-body); color: var(--muted); }
.ck__sum b { color: var(--ink); font-weight: 600; }
.ck__g { display: grid; gap: var(--s2); }
.ck__h { font-size: var(--fs-body); font-weight: 600; }
.ck__t { font-size: var(--fs-sm); color: var(--muted); margin-bottom: var(--s1); }
.ck__list { scroll-margin-top: calc(var(--s16, 64px) + var(--s4)); min-width: 0; }
.ck__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--s2); }
@media (max-width: 768px) {
  .ck__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ck__cards > :last-child:nth-child(odd) { grid-column: 1 / -1; }
}
</style>
