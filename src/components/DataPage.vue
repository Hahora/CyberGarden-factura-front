<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import DataTabs from './DataTabs.vue'
import BackChip from './BackChip.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiEmpty from './UiEmpty.vue'
import { runs } from '../case/runs'
import { runsLoad } from '../api/state'
import { useScrollMemory } from '../viewState'
import { useLoadGate } from '../useLoad'

const props = withDefaults(defineProps<{ title: string; loading?: boolean; sub?: string; fill?: boolean; tabs?: boolean; flow?: boolean; wrap?: boolean; backTo?: string; noRun?: boolean }>(), { tabs: true, backTo: '/facts' })

const router = useRouter()
const listLoading = computed(() => !props.noRun && !runs.length && runsLoad.state === 'loading')
const empty = computed(() => !props.noRun && !runs.length && runsLoad.state !== 'loading')
const listFailed = computed(() => empty.value && runsLoad.state === 'error')
const retry = async () => { const { reloadRuns } = await import('../api/auth'); void reloadRuns() }
const { phase, animate } = useLoadGate(computed(() => !!props.loading || listLoading.value))
const tbar = ref<HTMLElement>()
const tbEdge = ref({ l: 0, r: 0 })
function measureTb() {
  const el = tbar.value
  if (!el) return
  tbEdge.value = { l: el.scrollLeft > 4 ? 40 : 0, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 ? 40 : 0 }
}
watch(tbar, () => void nextTick(measureTb), { flush: 'post' })
onMounted(() => void nextTick(measureTb))
const scroller = ref<HTMLElement>()
useScrollMemory(scroller, 'page')
</script>

<template>
  <div class="dp" :class="{ 'dp--fill': fill, 'dp--flow': flow, 'dp--wrap': wrap }">
    <DataTabs v-if="tabs" />
    <div v-else class="dp__bar">
      <BackChip :fallback="backTo" />
    </div>
    <div ref="scroller" class="dp__scroll">
      <div class="dp__wrap">
        <header class="dp__head">
          <div class="dp__titles">
            <h1 class="dp__title">{{ title }}</h1>
            <p v-if="sub" class="dp__sub">{{ sub }}</p>
          </div>
          <div v-if="$slots.actions && !empty" class="dp__actions"><slot name="actions" /></div>
        </header>
        <div v-if="$slots.toolbar && !empty" ref="tbar" class="dp__toolbar" :style="{ '--fl': tbEdge.l + 'px', '--fr': tbEdge.r + 'px' }" @scroll.passive="measureTb"><slot name="toolbar" /></div>
        <UiEmpty v-if="listFailed" icon="info" title="Не удалось загрузить разборы" text="Проверьте соединение и повторите." action="Повторить" @action="retry" />
        <UiEmpty v-else-if="empty" icon="doc" title="Разборов пока нет" text="Загрузите PDF — данные появятся здесь." action="Новый разбор" action-icon="plus" @action="router.push('/app')" />
        <div v-else-if="phase === 'wait'" class="dp__body" aria-busy="true" />
        <div v-else-if="phase === 'sk'" class="dp__body dp__sk" aria-busy="true">
          <slot name="skeleton">
            <div class="dp__sk-tiles"><UiSkeleton v-for="i in 4" :key="i" variant="block" height="92px" /></div>
            <UiSkeleton variant="row" :lines="7" />
          </slot>
        </div>
        <div v-else class="dp__body" :class="{ reveal: animate }"><slot /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dp { --dp-max: 1400px; --lk: var(--blue-2); height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.dp__bar { flex: none; height: 56px; display: flex; align-items: center; gap: var(--s2); padding: var(--s2) var(--s4) var(--s2) max(var(--s4), calc((100% - var(--dp-max)) / 2 + var(--page-x) - var(--s3))); border-bottom: 1px solid var(--line); min-height: 56px; box-sizing: border-box; }
.dp__scroll { flex: 1; min-height: 0; overflow: auto; }
.dp__wrap { width: min(var(--dp-max), 100%); margin: 0 auto; padding: var(--s6) var(--page-x) var(--s10); display: flex; flex-direction: column; gap: var(--s5); }
.dp__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); flex-wrap: wrap; min-height: 32px; }
.dp__titles { min-width: 0; flex: 1 1 320px; }
.dp__title { font-size: var(--fs-h1); line-height: 1.2; font-weight: 600; letter-spacing: var(--h1-ls); }
.dp__sub { margin-top: var(--s1); font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; max-width: 64ch; }
.dp__actions { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.dp__actions :deep(.btn) { height: 32px; padding: 0 var(--s3); font-size: var(--fs-sm); }
.dp__toolbar { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; min-width: 0; }
.dp__sk-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s3); }
@media (max-width: 768px) { .dp__sk-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.dp__body { min-width: 0; display: flex; flex-direction: column; gap: var(--block); }
.dp--fill .dp__scroll { overflow: hidden; display: flex; }
.dp--fill .dp__wrap { flex: 1; max-width: var(--dp-max); min-height: 0; padding-bottom: 0; gap: var(--s4); }
.dp--fill .dp__body { flex: 1; min-height: 0; }

@media (max-width: 768px) {
  .dp--flow .dp__scroll { overflow: auto; display: block; overscroll-behavior: contain; }
  .dp--flow .dp__wrap { min-height: 100%; padding-bottom: calc(96px + var(--safe-b)); gap: var(--s3); }
  .dp--flow .dp__body { flex: none; }
  .dp--flow .dp__head { align-items: center; }
  .dp--wrap .dp__toolbar { flex-wrap: wrap; overflow: visible; -webkit-mask-image: none; mask-image: none; }
  .dp__wrap { padding-top: var(--s4); gap: var(--s4); }
  .dp__head { align-items: flex-start; flex-wrap: wrap; row-gap: var(--s3); }
  .dp__titles { flex: 1 1 100%; }
  .dp__actions { width: 100%; }
  .dp__actions :deep(.btn) { height: 40px; }
  .dp__toolbar { flex-wrap: nowrap; overflow-x: auto; margin: 0 calc(-1 * var(--page-x)); padding: 0 var(--page-x) 2px; scrollbar-width: none; }
  .dp__toolbar::-webkit-scrollbar { display: none; }
  .dp__toolbar > * { flex: none; }
  .dp__toolbar {
    -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--fl, 0px), #000 calc(100% - var(--fr, 0px)), transparent 100%);
    mask-image: linear-gradient(90deg, transparent 0, #000 var(--fl, 0px), #000 calc(100% - var(--fr, 0px)), transparent 100%);
  }
}
</style>
