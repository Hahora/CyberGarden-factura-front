<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from './Icon.vue'
import { openDeep, useScrollMemory } from '../viewState'
import Coverage from './Coverage.vue'
import DeviceStack from './DeviceStack.vue'
import { COLLECTIONS, fmt, paramOf } from '../data'
import { collectionRows, colNames, isQuality, rowName } from '../query'
import { runChecks, shortName } from '../checks'
import { paperColor } from '../colors'
import { chatOfPaper, factOf, paperOf, toast, type Card } from '../store'

const props = defineProps<{ card: Card; name?: string }>()
const router = useRouter()

const tbl = ref<HTMLElement | null>(null)
const emb = ref<HTMLElement | null>(null)
useScrollMemory(tbl, (props.name ?? 'card') + '-tbl')
useScrollMemory(emb, (props.name ?? 'card') + '-emb')

function openFact(factId: string) {
  const f = factOf(factId)
  const chat = f && chatOfPaper(f.paperId)
  if (chat) void openDeep(router, { path: '/c/' + chat.id, query: { view: 'facts', fact: factId } })
}

const cmp = computed(() => {
  const c = props.card
  if (c.kind !== 'compare') return null
  const col = COLLECTIONS[c.collection]
  const rows = collectionRows(c.collection)
  const used = new Set<string>()
  const cols = c.ids
    .map((id, i) => {
      const p = paperOf(id)
      const mine = rows.filter((r) => r.paper.id === id && r.values[col.best] != null)
      const top = (c.rows?.[i] ? mine.find((r) => r.rowId === c.rows![i]) : undefined) ?? mine.sort((a, b) => (b.values[col.best] ?? 0) - (a.values[col.best] ?? 0))[0]
      if (!p || !top) return null
      let color = paperColor(p.id)
      if (used.has(color) || color.startsWith('color-mix')) color = [1, 2, 3, 4, 5, 6].map((n) => `var(--c${n})`).find((x) => !used.has(x)) ?? color
      used.add(color)
      return { p, top, color, label: '', sub: c.collection === 'rag' ? shortName(p) : `${rowName(p, top.rowId)} · ${shortName(p)}` }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
  const names = colNames(cols.map((x) => ({ p: x.p, rowId: x.top.rowId })))
  cols.forEach((x, i) => (x.label = names[i]!))
  const keys = col.table
  const best = Object.fromEntries(keys.map((k) => [k, Math.max(...cols.map((x) => x.top.values[k] ?? -Infinity))]))
  const isBest = (k: string, v: number | null | undefined) => cols.length > 1 && isQuality(c.collection, k) && v != null && v === best[k] && cols.some((x) => x.top.values[k] !== v)
  return { col, cols, keys, best, isBest, anyBest: keys.some((k) => cols.some((x) => isBest(k, x.top.values[k]))) }
})

const chk = computed(() => {
  const c = props.card
  if (c.kind !== 'checks') return null
  const res = runChecks(c.collection).filter((r) => r.findings.length)
  const skip = new Set(c.skip ?? [])
  const found = res.flatMap((r) => r.findings.filter((f) => !c.papers || c.papers.includes(f.paperId)).map((f) => ({ ...f, rule: r.title })))
  const all = skip.size ? found.filter((f) => !f.factId || !skip.has(f.factId)) : found
  const count = (l: string) => all.filter((f) => f.level === l).length
  return { rules: res.length, errors: count('error'), warns: count('warn'), top: all.sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error')).slice(0, 4), total: all.length, more: skip.size > 0 }
})

const plain = (t: string) => t.replace(/,?\s*отклонение\s+[\d,.]+\s*MAD\./i, ', сильно выделяется среди остальных.')

const paper = computed(() => (props.card.kind === 'coverage' || props.card.kind === 'structure' ? paperOf(props.card.paperId) : null))
function openEmpty(_row: string, param: string) {
  const p = paper.value
  const chat = p && chatOfPaper(p.id)
  if (!p || !chat) return
  void openDeep(router, { path: '/c/' + chat.id, query: { view: 'facts', pane: 'pdf' } })
  toast(`Выделите в статье место, где указан параметр «${paramOf(p.collection, param).label}» — добавлю как факт`)
}

const expand = computed(() => {
  const c = props.card
  if (c.kind === 'compare') return { label: 'Открыть сравнение', to: { path: '/compare', query: { ids: [...new Set(c.ids)].join(',') } } }
  if (c.kind === 'checks') return { label: 'Открыть замечания', to: { path: '/checks' } }
  const chat = paper.value && chatOfPaper(paper.value.id)
  if (!chat) return null
  return { label: c.kind === 'coverage' ? 'Открыть полноту' : 'Открыть структуру', to: { path: '/c/' + chat.id, query: { view: 'facts', pane: c.kind } } }
})
</script>

<template>
  <section v-if="!(chk && chk.more && !chk.total)" class="ac">
    <template v-if="cmp">
      <h3 class="ac__title">Сравнение</h3>
      <div ref="tbl" class="ac__scroll">
        <table class="ac__table">
          <thead>
            <tr>
              <th />
              <th v-for="(x, i) in cmp.cols" :key="x.p.id + ':' + i" class="ac__paper">
                <span><i class="ac__dot" :style="{ background: x.color }" aria-hidden="true" />{{ x.label }}</span>
                <small>{{ x.sub }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="k in cmp.keys" :key="k">
              <th>{{ paramOf(cmp.col.id, k).label }}</th>
              <td v-for="(x, i) in cmp.cols" :key="x.p.id + ':' + i" class="num">
                <button
                  v-if="x.top.facts[k]" type="button" class="ac__val" :class="{ 'is-best': cmp.isBest(k, x.top.values[k]) }"
                  @click="openFact(x.top.facts[k]!.id)"
                ><span class="ac__v">{{ fmt(x.top.values[k], paramOf(cmp.col.id, k)) }}</span><i class="ac__up" :class="{ 'is-off': !cmp.isBest(k, x.top.values[k]) }" aria-hidden="true">▲</i><span v-if="cmp.isBest(k, x.top.values[k])" class="sr">, лучшее</span></button>
                <span v-else class="ac__none">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="cmp.anyBest" class="ac__legend">▲ лучшее в строке</p>
    </template>

    <template v-else-if="chk">
      <h3 class="ac__title">{{ chk.more ? 'Ещё замечания' : 'Замечания' }}<span v-if="chk.total" class="ac__n num">{{ chk.total }}</span></h3>
      <ul class="ac__list" role="list">
        <li v-for="f in chk.top.slice(0, 3)" :key="f.id">
          <span class="dot" :class="f.level === 'error' ? 'dot--conflict' : 'dot--warn'" :data-tip="f.level === 'error' ? 'Ошибка' : 'Предупреждение'" />
          <button type="button" class="ac__lt" :disabled="!f.factId" @click="f.factId && openFact(f.factId)"><b>{{ shortName(paperOf(f.paperId)!) }} · {{ f.paramLabel }} {{ f.value }}</b><small><em>{{ f.level === 'error' ? 'Ошибка' : 'Предупреждение' }}</em> · {{ plain(f.text) }}</small></button>
        </li>
      </ul>
    </template>

    <template v-else-if="card.kind === 'coverage' && paper">
      <h3 class="ac__title">Полнота</h3>
      <div ref="emb" class="ac__embed"><Coverage :paper="paper" :selected-id="null" @open="openFact" @empty="openEmpty" /></div>
    </template>

    <template v-else-if="card.kind === 'structure' && paper">
      <h3 class="ac__title">{{ paper.collection === 'rag' ? 'Схема конвейера' : 'Структура прибора' }}</h3>
      <div ref="emb" class="ac__embed"><DeviceStack :paper="paper" :selected-id="null" @open="openFact" /></div>
    </template>

    <button v-if="expand" type="button" class="olink" @click="openDeep(router, expand.to)">{{ expand.label }}<Icon name="arrow-up-right" :size="15" /></button>
  </section>
</template>

<style scoped>
.ac { display: grid; gap: var(--s4); min-width: 0; padding: var(--s5); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); }
.ac__title { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--fs-h2); font-weight: 600; line-height: 1.3; }
.ac__n { font-size: var(--fs-sm); font-weight: 400; color: var(--muted); }
.ac__scroll { overflow-x: auto; margin: 0 calc(var(--s2) * -1); padding: 0; }
.ac__table { width: 100%; border-collapse: collapse; font-size: var(--fs-body); }
.ac__table th, .ac__table td { padding: var(--s2) var(--s3); height: 40px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; }
.ac__table tr:last-child th, .ac__table tr:last-child td { border-bottom: 0; }
.ac__table tbody th { text-align: left; font-weight: 400; color: var(--muted); }
.ac__table thead th:first-child, .ac__table tbody th { position: sticky; left: 0; z-index: 1; padding-left: calc(var(--s2) + var(--s3)); background: var(--card); }
.ac__table tr > :last-child { padding-right: calc(var(--s2) + var(--s3)); }
.ac__paper { vertical-align: bottom; }
.ac__paper span { display: block; font-weight: 600; color: var(--ink); }
.ac__paper small { display: block; margin-top: 1px; font-size: var(--fs-xs); font-weight: 400; color: var(--muted); }
.ac__val { padding: 2px 6px; margin: -2px -6px; border-radius: var(--r-xs); }
.ac__val:hover { background: var(--bg-2); }
.ac__val.is-best { font-weight: 600; color: var(--ink); }
.ac__up { display: inline-block; width: 8px; margin-left: 5px; font-style: normal; font-size: 8px; text-align: left; vertical-align: 1px; color: var(--ink-2); }
.ac__up.is-off { visibility: hidden; }
.ac__dot { display: inline-block; width: 8px; height: 8px; margin-right: var(--s2); border-radius: 50%; vertical-align: 1px; }
.ac__legend { margin: calc(var(--s2) * -1) 0 0; font-size: var(--fs-xs); color: var(--muted); }
.ac__lt small em { font-style: normal; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ac__none { color: var(--faint); }
.ac__list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s3); }
.ac__list li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--s3); align-items: start; font-size: var(--fs-body); }
.ac__list .dot { margin-top: 8px; }
.ac__lt { text-align: left; min-width: 0; }
.ac__lt:not(:disabled):hover b { text-decoration: underline; text-underline-offset: 3px; }
.ac__lt b { display: block; font-weight: 500; }
.ac__lt small { display: block; margin-top: 2px; font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; }
.ac__embed { --bg: var(--card); margin: 0 calc(var(--s5) * -1); padding: 0 var(--s5); }
.ac__embed :deep(.cov), .ac__embed :deep(.ds) { height: auto; overflow: visible; padding: 0; background: none; }
.olink { justify-self: start; display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--fs-body); font-weight: 500; color: var(--blue); }
.olink:hover { text-decoration: underline; text-underline-offset: 3px; }
@media (max-width: 768px) {
  .ac { padding: var(--s4); }
  .ac__table th, .ac__table td { padding: var(--s2) var(--s2); }
  .ac__table td { height: 44px; }
  .ac__val { display: inline-flex; align-items: center; min-height: 44px; padding: 0 6px; margin: 0 -6px; }
  .olink { min-height: 44px; }
  .ac__paper { white-space: normal !important; vertical-align: bottom; }
  .ac__paper small { max-width: 112px; margin-left: auto; line-height: 1.3; }
  .ac__table tbody th { padding-right: var(--s1); }
  .ac__embed { margin: 0 calc(var(--s4) * -1); padding: 0 var(--s4); }
}
</style>
