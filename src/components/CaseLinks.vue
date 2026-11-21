<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import CaseGraph from './CaseGraph.vue'
import UiEmpty from './UiEmpty.vue'
import { NODATA_TEXT, hasData, publication } from '../case'
import { citedOf, relatedPapers, type EdgeKind, type LinkEdge, type LinkNode } from '../case/links'

const props = defineProps<{ pid: string }>()
const router = useRouter()
const route = useRoute()

const related = computed(() => relatedPapers(props.pid))
const cited = computed(() => citedOf(props.pid))
const MAX = 8
const top = computed(() => related.value.slice(0, MAX))

const strongest = (s: { kind: string }[]): EdgeKind => (s.some((x) => x.kind === 'absorber') ? 'absorber' : s.some((x) => x.kind === 'layer') ? 'layer' : 'class')
const nodes = computed<LinkNode[]>(() => [
  { id: props.pid, kind: 'paper', label: props.pid, pid: props.pid, weight: 1 },
  ...top.value.map((r) => ({ id: r.pid, kind: 'paper' as const, label: r.pid, pid: r.pid, weight: 1 })),
])
const edges = computed<LinkEdge[]>(() => top.value.map((r) => ({ from: props.pid, to: r.pid, kind: strongest(r.shared), label: r.shared[0]?.label ?? '' })))
const titles = computed(() => Object.fromEntries(nodes.value.map((n) => [n.id, n.id])))

const open = (pid: string | null) => {
  if (!pid || pid === props.pid) return
  const run = typeof route.query.run === 'string' ? route.query.run : ''
  void router.push({ path: '/paper/' + encodeURIComponent(pid), query: run ? { run } : {} })
}
const title = (pid: string) => publication(pid)?.title ?? ''
const ru = (s: string) => s.replace(/^тыл /, 'задний электрод ').replace(/^фронт /, 'передний электрод ')
const MAXCHIPS = 5
</script>

<template>
  <div class="cl">
    <UiEmpty v-if="!hasData(pid)" icon="graph" :title="NODATA_TEXT" text="Связи с другими статьями появятся вместе с результатами." compact plain />
    <template v-else>
      <figure v-if="related.length" class="cl__fig">
        <div class="card cl__graph" aria-label="Мини-граф связей">
          <CaseGraph :nodes="nodes" :edges="edges" :titles="titles" mode="radial" :focus="false" :controls="false" :selected="pid" @select="open" />
        </div>
        <figcaption class="cl__cap">В центре эта статья, вокруг — статьи с теми же материалами. Цвет кружка — класс поглотителя.</figcaption>
      </figure>

      <section class="cl__sec">
        <h2 class="cl__h">Похожие статьи<span v-if="related.length" class="cl__n num">{{ related.length }}</span></h2>
        <p v-if="!related.length" class="cl__m">Статей с теми же материалами в наборе нет.</p>
        <ul v-else class="cl__list" role="list">
          <li v-for="r in related" :key="r.pid">
            <button type="button" class="card cl__row" @click="open(r.pid)">
              <span class="cl__code num">{{ r.pid }}</span>
              <span class="cl__body">
                <span class="cl__t">{{ title(r.pid) }}</span>
                <span class="cl__chips">
                  <span v-for="s in r.shared.slice(0, MAXCHIPS)" :key="s.label" class="chip chip--sm chip--soft" :class="{ 'cl__chip--main': s.kind === 'absorber' }">{{ ru(s.label) }}</span>
                  <span v-if="r.shared.length > MAXCHIPS" class="chip chip--sm chip--soft">ещё {{ r.shared.length - MAXCHIPS }}</span>
                </span>
              </span>
            </button>
          </li>
        </ul>
      </section>

      <section class="cl__sec">
        <h2 class="cl__h">Значения из других работ</h2>
        <p v-if="cited.count" class="cl__m">{{ cited.text }}. Автор приводит их из списка литературы; в таблице они помечены «из другой работы» и в сравнения не входят.</p>
        <p v-else class="cl__m">Все значения в статье — собственные данные авторов.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cl { display: grid; gap: var(--s6); min-width: 0; }
.cl__m { font-size: var(--fs-sm); color: var(--muted); line-height: 1.5; }
.cl__fig { display: grid; gap: var(--s2); margin: 0; min-width: 0; }
.cl__graph { height: 300px; overflow: hidden; }
.cl__cap { font-size: var(--fs-xs); color: var(--muted); line-height: 1.45; }
.cl__sec { display: grid; gap: var(--s3); min-width: 0; }
.cl__h { display: flex; align-items: baseline; gap: var(--s2); font-size: var(--fs-sm); font-weight: 600; color: var(--muted); }
.cl__n { font-weight: 400; color: var(--faint); }
.cl__list { display: grid; gap: var(--s2); list-style: none; padding: 0; margin: 0; }
.cl__row {
  display: flex; gap: var(--s3); align-items: flex-start; width: 100%; padding: var(--s3) var(--s4); text-align: left; min-width: 0;
  transition: background-color var(--t-fast) ease;
}
@media (hover: hover) { .cl__row:hover { background: var(--bg-2); } }
.cl__code { flex: none; font-weight: 600; font-size: var(--fs-sm); padding-top: 1px; }
.cl__body { display: grid; gap: var(--s2); min-width: 0; flex: 1; }
.cl__t { font-size: var(--fs-sm); line-height: 1.4; overflow-wrap: anywhere; }
.cl__chips { display: flex; flex-wrap: wrap; gap: var(--s1); min-width: 0; }
.cl__chip--main { color: var(--ink); font-weight: 600; }
@media (max-width: 768px) { .cl__graph { height: 260px; } .cl__row { padding: var(--s3); } }
</style>
