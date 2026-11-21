<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DATA_TABS, dataRun, ensureDataRun, setDataRun } from '../dataTabs'
import UiSelect from './UiSelect.vue'
import BackChip from './BackChip.vue'
import { runOf, runs, sortedRuns } from '../case/runs'

const route = useRoute()
const isOn = (to: string) => route.path === to
const RUN_OPTIONS = computed(() => sortedRuns().map((r) => ({ value: r.id, label: r.title, icon: 'doc' })))
const runValue = computed(() => (dataRun.value && runOf(dataRun.value) ? dataRun.value : ''))
watch(() => runs.length, () => ensureDataRun())
function setRun(v: string | string[]) {
  setDataRun(v as string)
  if (route.query.run != null) {
    const { run: _drop, ...rest } = route.query
    void router.replace({ query: rest })
  }
}

const router = useRouter()
const bar = ref<HTMLElement>()
const edge = ref({ l: 0, r: 0 })
function measure() {
  const el = bar.value
  if (!el) return
  edge.value = { l: el.scrollLeft > 4 ? 40 : 0, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 ? 40 : 0 }
}
function center() {
  void nextTick(() => {
    const el = bar.value?.querySelector<HTMLElement>('.dt__tab.is-on')
    const box = bar.value
    if (!box || !el) return
    if (box.scrollWidth > box.clientWidth + 1) {
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.left < b.left + 8 || r.right > b.right - 8) box.scrollLeft += r.left + r.width / 2 - (b.left + b.width / 2)
    }
    measure()
  })
}
onMounted(center)
watch(() => route.path, center)
</script>

<template>
  <header class="dt">
    <BackChip in-tabs />
    <div v-if="runs.length" class="dt__coll">
      <UiSelect :model-value="runValue" :options="RUN_OPTIONS" label="Разбор" variant="ghost" :min-width="300" @update:model-value="setRun" />
    </div>
    <span v-if="runs.length" class="dt__sep" aria-hidden="true" />
    <nav ref="bar" class="dt__tabs" aria-label="Раздел «Данные»" :style="{ '--fl': edge.l + 'px', '--fr': edge.r + 'px' }" @scroll.passive="measure">
      <RouterLink v-for="t in DATA_TABS" :key="t.to" :to="t.to" class="dt__tab" :class="{ 'is-on': isOn(t.to) }" :aria-current="isOn(t.to) ? 'page' : undefined">
        {{ t.label }}
      </RouterLink>
    </nav>
    <div v-if="$slots.right" class="dt__right"><slot name="right" /></div>
  </header>
</template>

<style scoped>
.dt { flex: none; container-type: inline-size; display: flex; align-items: center; gap: var(--s2); padding: var(--s2) var(--s4) var(--s2) max(var(--s4), calc((100% - var(--dp-max, 1400px)) / 2 + var(--page-x) - var(--s3))); border-bottom: 1px solid var(--line); min-width: 0; }
.dt__tabs {
  flex: 1; min-width: 0; display: flex; gap: var(--s1); overflow-x: auto; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--fl, 0px), #000 calc(100% - var(--fr, 0px)), transparent 100%);
  mask-image: linear-gradient(90deg, transparent 0, #000 var(--fl, 0px), #000 calc(100% - var(--fr, 0px)), transparent 100%);
}
.dt__tabs::-webkit-scrollbar { display: none; }
.dt__tab {
  flex: none; display: inline-flex; align-items: center; gap: var(--s2); height: 34px; padding: 0 var(--s3); border-radius: var(--r-sm);
  font-size: var(--fs-body); color: var(--muted); white-space: nowrap; transition: background-color var(--t-fast) ease, color var(--t-fast) ease;
}
@media (hover: hover) { .dt__tab:not(.is-on):hover { color: var(--ink); background: var(--bg-2); } }
.dt__tab:focus { outline: 0; }
.dt__tab:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.dt__tab.is-on { color: var(--ink); font-weight: 500; box-shadow: inset 0 -2px 0 var(--blue); border-radius: var(--r-sm) var(--r-sm) 0 0; }
.dt__coll { flex: none; display: flex; font-weight: 500; }
.dt__sep { flex: none; width: 1px; height: 20px; background: var(--line-2); }
.dt__right { flex: none; display: flex; align-items: center; gap: var(--s2); }
@container (max-width: 1000px) {
  .dt :deep(.bc) { max-width: 120px; }
  .dt__tab { padding: 0 var(--s2); }
}
@container (max-width: 820px) {
  .dt__coll :deep(.us__text) { max-width: 140px; }
  .dt__tab { padding: 0 var(--s2); font-size: var(--fs-sm); }
}
@media (max-width: 768px) {
  .dt { padding: var(--s1) 0 var(--s1) var(--s2); gap: var(--s1); }
  .dt__sep { display: none; }
  .dt__coll { min-width: 0; max-width: 42%; }
  .dt__coll :deep(.us) { min-width: 44px; padding: 0 var(--s2); gap: var(--s1); }
  .dt__coll :deep(.us__text) { max-width: 30vw; font-size: var(--fs-sm); }
  .dt__tab { height: 44px; padding: 0 var(--s3); font-size: var(--fs-body); }
  .dt__tabs { scroll-padding-inline: var(--s6); }
  .dt__right { padding-right: var(--s2); }
}
</style>
