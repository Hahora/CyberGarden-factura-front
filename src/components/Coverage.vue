<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { paramOf, rowLabel, rowTitle, sampleWords } from '../data'
import { display, state } from '../store'
import type { Paper } from '../store'
import { coverageOf, type Cell } from '../structure'
import { plural } from '../search'
import UiProgress from './UiProgress.vue'
import { useScrollMemory } from '../viewState'

const props = defineProps<{ paper: Paper; selectedId: string | null }>()
const emit = defineEmits<{ open: [factId: string]; empty: [row: string, param: string] }>()

const cov = computed(() => coverageOf(props.paper))
const mobile = computed(() => state.mobile)
const pct = computed(() => (cov.value.total ? Math.round((cov.value.filled / cov.value.total) * 100) : 0))
const words = computed(() => sampleWords(props.paper.collection))
const label = (k: string) => paramOf(props.paper.collection, k).label
const unit = (k: string) => paramOf(props.paper.collection, k).unit
const cellOf = (row: string, k: string) => cov.value.cells.find((c) => c.row === row && c.param === k)!

const shown = (c: Cell) => {
  const t = display(c.main!)
  const pr = paramOf(props.paper.collection, c.param)
  if (pr.text) return t.split(',')[0]!
  return mobile.value || !pr.unit || !t.endsWith(' ' + pr.unit) ? t : t.slice(0, -pr.unit.length - 1)
}
const notes = computed(() => {
  const c = cov.value
  const list: { text: string; dot?: string }[] = []
  if (c.conflicts) list.push({ text: `${c.conflicts} ${plural(c.conflicts, ['ошибка', 'ошибки', 'ошибок'])}`, dot: 'dot--conflict' })
  if (c.diverge) list.push({ text: `2 значения: ${c.diverge}`, dot: 'dot--doubt' })
  if (c.total - c.filled) list.push({ text: `${c.total - c.filled} не найдено` })
  if (c.figureOnly) list.push({ text: `${c.figureOnly} только с графика` })
  return list
})
const isSel = (c: Cell) => !!props.selectedId && c.facts.some((f) => f.id === props.selectedId)

function click(c: Cell) {
  if (c.main) emit('open', (c.facts.find((f) => f.id === props.selectedId) ?? c.main).id)
  else emit('empty', c.row, c.param)
}
const tip = (c: Cell) =>
  !c.main
    ? `${label(c.param)}: не найдено — нажмите, чтобы добавить`
    : c.facts.map((f) => `${display(f)} — ${f.source.ref}, ${f.source.where}`).join('\n')

const scroller = ref<HTMLElement | null>(null)
const page = ref<HTMLElement | null>(null)
useScrollMemory(page, 'cov-page')
useScrollMemory(scroller, 'cov-grid')
const edge = ref({ l: false, r: false })
function measure() {
  const el = scroller.value
  if (!el) return
  edge.value = { l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 }
}
let ro: ResizeObserver | null = null
onMounted(() => {
  void nextTick(measure)
  if (scroller.value) {
    ro = new ResizeObserver(measure)
    ro.observe(scroller.value)
  }
})
watch([cov, mobile], () => void nextTick(measure))
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div ref="page" class="cov" :class="{ 'cov--m': mobile }">
    <section class="blk">
      <div class="cov__metric">
        <span class="cov__n num">{{ cov.filled }}<small> из {{ cov.total }}</small></span>
        <span class="cov__cap">{{ plural(cov.total, ['параметра', 'параметров', 'параметров']) }} найдено · <span class="num">{{ pct }} %</span></span>
      </div>
      <div class="cov__bar"><UiProgress :value="pct" tone="blue" size="sm" label="Полнота" /></div>
      <p v-if="notes.length" class="cov__notes">
        <template v-for="(n, i) in notes" :key="i"><span v-if="i" class="cov__sep">·</span><span><i v-if="n.dot" class="dot" :class="n.dot" />{{ n.text }}</span></template>
      </p>
    </section>

    <section v-if="!mobile" class="blk blk--grid">
      <div class="cov__wrap" :class="{ 'has-l': edge.l, 'has-r': edge.r }">
        <div ref="scroller" class="cov__scroll" @scroll.passive="measure">
          <table class="cov__grid">
            <thead>
              <tr>
                <th scope="col" class="cov__corner">{{ words.cap }}</th>
                <th v-for="k in cov.params" :key="k" scope="col">
                  <span class="th__n">{{ label(k) }}</span>
                  <span class="th__u">{{ unit(k) || ' ' }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in paper.rows" :key="r.id">
                <th scope="row">{{ rowLabel(paper, r.id) }}</th>
                <td v-for="k in cov.params" :key="k">
                  <button type="button" class="cell" :class="{ 'is-empty': !cellOf(r.id, k).main, 'is-sel': isSel(cellOf(r.id, k)), 'is-fig': cellOf(r.id, k).figureOnly, 'has-n': cellOf(r.id, k).facts.length > 1 }" :data-tip="tip(cellOf(r.id, k))" :aria-label="`${rowLabel(paper, r.id)}, ${label(k)}: ${cellOf(r.id, k).main ? display(cellOf(r.id, k).main!) : 'не найдено'}`" @click="click(cellOf(r.id, k))">
                    <template v-if="cellOf(r.id, k).main">
                      <span class="cell__v num">{{ shown(cellOf(r.id, k)) }}</span>
                      <i v-if="cellOf(r.id, k).level" class="dot cell__dot" :class="cellOf(r.id, k).level === 'conflict' ? 'dot--conflict' : 'dot--doubt'" />
                      <span v-if="cellOf(r.id, k).diverge" class="cell__n">2 значения</span>
                    </template>
                    <span v-else class="cell__v">—</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="cov__legend">Пунктир — не найдено · 2 значения — источники расходятся · наведите на ячейку, чтобы увидеть источник</p>
    </section>

    <template v-else>
      <section v-for="r in paper.rows" :key="r.id" class="blk blk--row">
        <h3>{{ rowTitle(paper, r.id) }}</h3>
        <button v-for="k in cov.params" :key="k" type="button" class="line" :class="{ 'is-empty': !cellOf(r.id, k).main, 'is-sel': isSel(cellOf(r.id, k)) }" @click="click(cellOf(r.id, k))">
          <span class="line__k">{{ label(k) }}</span>
          <span v-if="cellOf(r.id, k).main" class="line__v num">
            <i v-if="cellOf(r.id, k).level" class="dot" :class="cellOf(r.id, k).level === 'conflict' ? 'dot--conflict' : 'dot--doubt'" />
            {{ shown(cellOf(r.id, k)) }}
            <small v-if="cellOf(r.id, k).diverge">2 значения</small>
          </span>
          <span v-else class="line__v">не найдено</span>
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cov { height: 100%; overflow: auto; display: grid; align-content: start; gap: var(--s5); padding: var(--s5); background: var(--bg); }
.blk { min-width: 0; }

.cov__metric { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s3); }
.cov__n { font-size: var(--fs-num); font-weight: 500; line-height: 1.1; }
.cov__n small { font-size: var(--fs-body); font-weight: 400; color: var(--muted); }
.cov__cap { font-size: var(--fs-sm); color: var(--muted); }
.cov__bar { margin-top: var(--s3); }
.cov__notes { margin: var(--s3) 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--s1) var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.cov__notes span { display: inline-flex; align-items: center; gap: var(--s2); }
.cov__sep { color: var(--faint); }
.blk--grid { margin: 0 calc(-1 * var(--s4)); }
.cov__wrap { position: relative; }
.cov__wrap::after {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 32px; pointer-events: none; opacity: 0; transition: opacity var(--t) ease;
  background: linear-gradient(to right, transparent, var(--bg));
}
.cov__wrap.has-r::after { opacity: 1; }
.cov__scroll { overflow-x: auto; padding: 0; }
.cov__grid { border-collapse: separate; border-spacing: 0 6px; width: max-content; min-width: 100%; }
.cov__grid th, .cov__grid td { padding: 0 3px; }
.cov__grid thead th { padding-bottom: var(--s2); font-weight: 500; text-align: left; vertical-align: bottom; min-width: 108px; }
.th__n { display: block; font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.25; }
.th__u { display: block; font-size: var(--fs-xs); font-weight: 400; color: var(--faint); white-space: nowrap; }
.cov__grid thead th:first-child, .cov__grid tbody th { position: sticky; left: 0; z-index: 2; min-width: 84px; padding-left: var(--s4); background: var(--bg); }
.cov__grid tr > :last-child { padding-right: var(--s4); }
.cov__grid thead th.cov__corner { vertical-align: bottom; font-size: var(--fs-xs); color: var(--muted); }
.cov__grid tbody th { padding-right: var(--s3); font-size: var(--fs-body); font-weight: 500; text-align: left; color: var(--ink); white-space: nowrap; }
.cov__wrap.has-l .cov__grid thead th:first-child, .cov__wrap.has-l .cov__grid tbody th { box-shadow: 8px 0 8px -6px rgb(0 0 0 / 0.28); }

.cell {
  position: relative; width: 100%; height: 56px; display: grid; align-content: center; gap: 2px; padding: 0 var(--s3); text-align: left;
  border-radius: var(--r-sm); background: var(--bg-2); box-shadow: 0 0 0 1px transparent; transition: background-color var(--t) ease, box-shadow var(--t) ease;
}
.cell:hover { background: var(--bg-3); }
.cell.is-sel { box-shadow: 0 0 0 1.5px var(--blue); background: var(--blue-soft); }
.cell__v { font-size: var(--fs-body); font-weight: 500; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: var(--s2); }
.cell.is-fig /* «нет данных» — один пунктирный язык во всех блоках */
.cell.is-empty { background: transparent; box-shadow: none; outline: 1px dashed var(--faint); outline-offset: -1px; }
.cell.is-empty:hover { background: var(--bg-2); outline-color: var(--faint); }
.cell.is-empty .cell__v { color: var(--faint); font-weight: 400; }
.cell__dot { position: absolute; top: var(--s2); right: var(--s2); }
.cell__n { font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }

.cov__legend { padding: 0 var(--s5); margin: var(--s2) 0 0; font-size: var(--fs-xs); color: var(--faint); }
.cov--m { padding: var(--s4) var(--s4) calc(var(--s6) + var(--safe-b)); gap: var(--s4); }
.blk--row { padding: 0; }
.blk--row h3 { padding: var(--s2) var(--s3) var(--s1); font-size: var(--fs-body); font-weight: 600; }
.line { width: 100%; min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: var(--s3); padding: 0 var(--s3); border-radius: var(--r-sm); text-align: left; font-size: var(--fs-body); }
.line + .line { border-top: 1px solid var(--line); border-radius: 0; }
.line__k { color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line__v { display: inline-flex; align-items: center; gap: var(--s2); font-weight: 500; min-width: 0; white-space: nowrap; }
.line__v small { font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
.line.is-empty .line__v { color: var(--faint); font-weight: 400; }
.line.is-sel { background: var(--blue-soft); }
</style>
