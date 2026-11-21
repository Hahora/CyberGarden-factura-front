<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import UiSelect from './UiSelect.vue'
import { rowLabel, sampleWords } from '../data'
import { factOf, state } from '../store'
import type { Paper } from '../store'
import { useScrollMemory, useViewState } from '../viewState'
import { ROLE_LABEL, conditionsOf, fmtThickness, pipelineOf, structureOf, type Layer } from '../structure'

const props = defineProps<{ paper: Paper; selectedId: string | null; sample?: string }>()
const emit = defineEmits<{ open: [factId: string]; 'update:sample': [id: string] }>()

const mobile = computed(() => state.mobile)
const solar = computed(() => props.paper.collection === 'solar')

const variants = computed(() => (solar.value ? structureOf(props.paper) : []))
const ui = useViewState('structure', () => ({ vid: '', rowId: '' }))
const page = ref<HTMLElement | null>(null)
useScrollMemory(page, 'structure-page')
const vid = toRef(ui, 'vid')
watch(
  [variants, () => props.selectedId],
  () => {
    const f = factOf(props.selectedId)
    const byFact = f && variants.value.find((v) => v.id === f.row)
    if (byFact && f.row !== '*') vid.value = byFact.id
    else if (!variants.value.some((v) => v.id === vid.value)) vid.value = variants.value[0]?.id ?? ''
  },
  { immediate: true },
)
const variant = computed(() => variants.value.find((v) => v.id === vid.value) ?? variants.value[0])

const CUT = 1e5
const isCut = (l: Layer) => l.nm >= CUT
const hOf = (l: Layer) => (isCut(l) ? 52 : Math.round(Math.min(120, Math.max(44, 44 + (Math.log10(Math.max(l.nm, 1)) - 1) * 24))))
const conds = computed(() => (solar.value ? conditionsOf(props.paper) : []))
const dsW = ref(0)
const condCols = computed(() => {
  const n = conds.value.length
  if (!n) return 1
  const max = Math.max(1, Math.min(n, Math.floor((dsW.value || 600) / 150)))
  return Math.ceil(n / Math.ceil(n / max))
})
let ro: ResizeObserver | null = null
onMounted(() => {
  if (!page.value) return
  ro = new ResizeObserver(() => (dsW.value = page.value?.clientWidth ?? 0))
  ro.observe(page.value)
})
onBeforeUnmount(() => ro?.disconnect())
const isSel = (l: Layer) => !!l.fact && l.fact.id === props.selectedId

const rowId = toRef(ui, 'rowId')
watch(
  [() => props.paper.id, () => props.selectedId],
  () => {
    const f = factOf(props.selectedId)
    if (f && f.row !== '*' && props.paper.rows.some((r) => r.id === f.row)) rowId.value = f.row
    else if (!props.paper.rows.some((r) => r.id === rowId.value)) rowId.value = props.paper.rows[0]?.id ?? ''
  },
  { immediate: true },
)
const nodes = computed(() => (solar.value ? [] : pipelineOf(props.paper, rowId.value)))

const opts = computed(() => (solar.value ? variants.value.map((v) => ({ value: v.id, label: v.label })) : props.paper.rows.map((r) => ({ value: r.id, label: rowLabel(props.paper, r.id) }))))
const showSwitch = computed(() => opts.value.length > 1)
const cur = computed(() => (solar.value ? variant.value?.id : rowId.value) ?? '')
function pickSample(id: string) {
  if (solar.value) vid.value = id
  else rowId.value = id
  emit('update:sample', id)
}
watch(
  () => props.sample,
  (s) => {
    if (!s || s === 'all') return
    if (solar.value) {
      if (variants.value.some((v) => v.id === s)) vid.value = s
    } else if (props.paper.rows.some((r) => r.id === s)) rowId.value = s
  },
  { immediate: true },
)
</script>

<template>
  <div ref="page" class="ds" :class="{ 'ds--m': mobile }">
    <div v-if="showSwitch" class="ds__samples">
      <div v-if="opts.length <= 4" class="seg" role="tablist" :aria-label="sampleWords(paper.collection).cap">
        <button v-for="o in opts" :key="o.value" type="button" role="tab" :aria-selected="o.value === cur" :class="{ on: o.value === cur }" @click="pickSample(o.value)">{{ o.label }}</button>
      </div>
      <UiSelect v-else :model-value="cur" :options="opts" :label="sampleWords(paper.collection).cap" size="sm" variant="chip" @update:model-value="pickSample($event as string)" />
    </div>

    <div v-if="solar && variant" class="ds__cols">
      <section class="blk">
        <h2 data-tip="Высота слоя — в логарифмической шкале">Слои прибора</h2>
        <ol class="stack" role="list">
          <li v-for="l in variant.layers" :key="l.role + l.raw" class="layer" :class="['r-' + l.role, { 'is-sel': isSel(l), 'is-cut': isCut(l) }]" :style="{ height: hOf(l) + 'px' }" :title="`${l.where} · стр. ${l.page}${l.raw !== l.name ? ' · в статье: ' + l.raw : ''}`">
            <span class="layer__bar" />
            <span class="layer__txt">
              <span class="layer__name">
                <b>{{ l.name }}</b>
                <span class="layer__role">{{ ROLE_LABEL[l.role] }}</span>
              </span>
              <span class="layer__meta">
                <button v-if="l.fact" type="button" class="layer__t num is-link" data-tip="Показать факт в PDF" @click="emit('open', l.fact!.id)">{{ fmtThickness(l.nm) }}</button>
                <span v-else class="layer__t num">{{ fmtThickness(l.nm) }}</span>
                <span v-if="isCut(l)" class="layer__cut">показан обрезанным</span>
                <span v-if="l.role === 'absorber' && !l.fact" class="layer__gap"><i class="dot dot--doubt" />факта толщины нет</span>
              </span>
            </span>
          </li>
        </ol>
      </section>

      <section class="blk">
        <h2>Условия измерения</h2>
        <dl class="conds" :style="{ '--cols': condCols }">
          <div v-for="c in conds" :key="c.key" class="cond" :class="{ 'is-gap': !c.value }">
            <dt>{{ c.label }}</dt>
            <dd v-if="c.value && c.fact"><button type="button" class="num" data-tip="Показать факт в PDF" @click="emit('open', c.fact!.id)">{{ c.value }}</button></dd>
            <dd v-else>не указано</dd>
          </div>
        </dl>
      </section>
    </div>

    <section v-else-if="!solar" class="blk">
      <h2>Схема конвейера</h2>
      <ol class="pipe" role="list">
        <li v-for="n in nodes" :key="n.key" class="node" :class="{ 'is-gap': n.value === null }">
          <span class="node__t">{{ n.title }}</span>
          <template v-if="n.items">
            <span v-if="!n.items.length" class="node__v">не указано</span>
            <span v-for="m in n.items" :key="m.label" class="node__m">
              <span>{{ m.label }}</span>
              <button type="button" class="num" :class="{ 'is-sel': m.fact.id === selectedId }" @click="emit('open', m.fact.id)">{{ m.value }}</button>
            </span>
          </template>
          <template v-else>
            <button v-if="n.fact" type="button" class="node__v is-link" :class="{ 'is-sel': n.fact.id === selectedId }" :data-tip="'Показать факт в PDF'" @click="emit('open', n.fact!.id)">{{ n.value }}</button>
            <span v-else class="node__v">{{ n.value ?? 'не указано' }}</span>
            <span v-if="n.sub" class="node__s">{{ n.sub }}</span>
          </template>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.ds { height: 100%; overflow: auto; display: grid; align-content: start; gap: var(--s6); padding: var(--s5); background: var(--bg); container-type: inline-size; }
.ds__cols { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s6); min-width: 0; }
@container (min-width: 820px) { .ds__cols { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: var(--s8); align-items: start; } }
.ds__samples { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s2) var(--s3); min-width: 0; }
.ds__lbl { font-size: var(--fs-sm); color: var(--muted); }
.seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--r); background: var(--bg-2); max-width: 100%; overflow-x: auto; scrollbar-width: none; }
.seg::-webkit-scrollbar { display: none; }
.seg button { flex: none; height: 30px; padding: 0 var(--s3); border-radius: var(--r-sm); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease; }
.seg button:hover { color: var(--ink); }
.seg button.on { color: var(--ink); background: var(--card); box-shadow: 0 1px 2px rgb(0 0 0 / 0.12), 0 0 0 1px var(--line); }
.blk { min-width: 0; }
.blk h2 { font-size: var(--fs-h2); font-weight: 600; }
.blk__sub { margin: 2px 0 var(--s4); font-size: var(--fs-sm); color: var(--muted); }
.stack { list-style: none; padding: 0; margin: 0; max-width: 720px; }
.layer { position: relative; display: grid; grid-template-columns: minmax(96px, 36%) minmax(0, 1fr); align-items: center; gap: var(--s4); }
.layer__bar { align-self: stretch; margin-top: -1px; background-color: var(--bg-2); box-shadow: inset 0 0 0 1px var(--line-2); transition: box-shadow var(--t) ease; }
.layer:first-child .layer__bar { border-radius: var(--r-sm) var(--r-sm) 0 0; margin-top: 0; }
.layer:last-child .layer__bar { border-radius: 0 0 var(--r-sm) var(--r-sm); }
.r-tco .layer__bar, .r-contact .layer__bar { background-image: repeating-linear-gradient(45deg, var(--line-2) 0 1px, transparent 1px 7px); }
.r-etl .layer__bar, .r-htl .layer__bar { background-color: var(--bg-3); background-image: radial-gradient(var(--line-2) 1.2px, transparent 1.6px); background-size: 7px 7px; }
.r-absorber .layer__bar { background-color: var(--blue-soft); box-shadow: inset 0 0 0 1px var(--blue); }
.r-extra .layer__bar { background-color: var(--bg-3); }
.is-cut .layer__bar { background-image: repeating-linear-gradient(-45deg, transparent 0 8px, var(--line) 8px 9px); -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 35%, transparent 35%, transparent 45%, #000 45%, #000 100%); mask-image: linear-gradient(to bottom, #000 0, #000 35%, transparent 35%, transparent 45%, #000 45%, #000 100%); box-shadow: none; border: 1px dashed var(--line-2); border-radius: 0; }
.layer.is-sel .layer__bar { box-shadow: inset 0 0 0 2px var(--blue); }
.layer__txt { display: grid; gap: 1px; min-width: 0; }
.layer__name { display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 var(--s2); }
.layer__name b { font-size: var(--fs-body); font-weight: 600; }
.layer__role { font-size: var(--fs-xs); color: var(--faint); }
.layer__meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--s2); font-size: var(--fs-xs); color: var(--muted); }
.layer__t { color: var(--ink); font-weight: 500; }
.layer__t.is-link { padding: 0 4px; margin: 0 -4px; border-radius: var(--r-xs); color: var(--ink); text-decoration: underline; text-decoration-color: var(--blue); text-underline-offset: 3px; }
.layer__t.is-link:hover { background: var(--blue-soft); }
.layer__cut { color: var(--muted); }
.layer__gap { display: inline-flex; align-items: center; gap: var(--s1); color: var(--muted); }
.conds { margin: 0; display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); gap: var(--s2); }
@container (min-width: 820px) { .conds { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cond:last-child:nth-child(odd) { grid-column: 1 / -1; } }
.cond { padding: var(--s3); border-radius: var(--r); background: var(--bg-2); min-width: 0; }
.cond dt { font-size: var(--fs-xs); color: var(--muted); }
.cond dd { margin: 2px 0 0; font-size: var(--fs-body); font-weight: 500; }
.cond dd button { font-weight: 500; text-align: left; border-radius: var(--r-xs); }
.cond dd button:hover { color: var(--blue); }
.cond.is-gap { background: transparent; outline: 1px dashed var(--line-2); outline-offset: -1px; }
.cond.is-gap dd { color: var(--faint); font-weight: 400; }
.pipe { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s2); counter-reset: n; }
.node { position: relative; display: grid; align-content: start; gap: 3px; min-height: 84px; padding: var(--s3) var(--s4); border-radius: var(--r); background: var(--bg-2); min-width: 0; counter-increment: n; }
.node::before { content: counter(n); position: absolute; top: var(--s3); right: var(--s3); font-size: var(--fs-xs); color: var(--faint); }
.node__t { font-size: var(--fs-xs); color: var(--muted); }
.node__v { font-size: var(--fs-body); font-weight: 500; text-align: left; overflow-wrap: anywhere; }
.node__v.is-link { color: var(--ink); text-decoration: underline; text-decoration-color: var(--blue); text-underline-offset: 3px; }
.node__v.is-link:hover { color: var(--blue); }
.node__v.is-sel, .node__m .is-sel { box-shadow: 0 0 0 2px var(--blue-soft); background: var(--blue-soft); border-radius: var(--r-xs); }
.node__s { font-size: var(--fs-xs); color: var(--faint); }
.node__m { display: flex; justify-content: space-between; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.node__m button { color: var(--ink); font-weight: 500; text-decoration: underline; text-decoration-color: var(--blue); text-underline-offset: 3px; }
.node.is-gap { background: transparent; outline: 1px dashed var(--line-2); outline-offset: -1px; }
.node.is-gap .node__v { color: var(--faint); font-weight: 400; }
.ds--m { padding: var(--s4) var(--s4) calc(var(--s6) + var(--safe-b)); gap: var(--s3); }
.ds--m .seg button { height: 38px; padding: 0 var(--s4); font-size: 15px; }
.ds--m .layer { grid-template-columns: 72px minmax(0, 1fr); gap: var(--s3); }
.ds--m .pipe { grid-template-columns: minmax(0, 1fr); }
.ds--m .cond dd button { min-height: 28px; }
.ds--m .layer__t.is-link { min-height: 28px; display: inline-flex; align-items: center; }
</style>
