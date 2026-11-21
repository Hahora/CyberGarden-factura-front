<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import GraphCanvas from './GraphCanvas.vue'
import GraphFull from './GraphFull.vue'
import GraphTimeline from './GraphTimeline.vue'
import Icon from './Icon.vue'
import UiSkeleton from './UiSkeleton.vue'
import { openDeep } from '../viewState'
import { defaultRoot, buildGraph } from '../graph'
import { state } from '../store'
import type { CollectionId } from '../data'

const props = defineProps<{ collection: CollectionId; root?: string; focus?: string; title: string; name?: string }>()
const router = useRouter()

const ready = ref(false)
onMounted(() => requestAnimationFrame(() => requestAnimationFrame(() => (ready.value = true))))

const sel = computed(() => props.focus ?? props.root ?? null)

const full = ref(false)
const fullRoot = computed(() => {
  const g = buildGraph(props.collection)
  const r = props.root ?? props.focus
  return r && g.byId.get(r)?.kind === 'paper' ? r : defaultRoot(g)
})
function openFull() {
  if (state.mobile) { full.value = true; return }
  openDeep(router, { path: '/graph', query: { ...(props.root ? { root: props.root } : {}), ...(props.focus ? { focus: props.focus } : {}) } })
}
</script>

<template>
  <section class="gcard">
    <h3 class="gcard__title">{{ title }}</h3>
    <template v-if="state.mobile && fullRoot">
      <div class="gcard__graph gcard__graph--m">
        <UiSkeleton v-if="!ready" variant="block" height="240px" />
        <GraphTimeline v-else :collection="collection" :root="fullRoot" :selected="null" :max-height="300" @open="full = true" />
      </div>
      <button type="button" class="gcard__open" @click="full = true">Открыть граф<Icon name="arrow-up-right" :size="16" /></button>
      <GraphFull v-if="full" :collection="collection" :root="fullRoot" :focus="focus ?? null" @close="full = false" />
    </template>
    <template v-else>
    <div class="gcard__graph">
      <UiSkeleton v-if="!ready" variant="block" height="320px" />
      <GraphCanvas v-else :state-key="'card:' + (name ?? root ?? focus ?? '')" :collection="collection" :root="root" compact pan height="320px" :selected="sel" @select="() => {}" @expand="openFull" />
    </div>
    <button type="button" class="olink" @click="openFull">Открыть связи<Icon name="arrow-up-right" :size="15" /></button>
    </template>
  </section>
</template>

<style scoped>
.gcard { display: grid; gap: var(--s4); padding: var(--s5); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1px var(--line); min-width: 0; }
.gcard__title { font-weight: 600; font-size: var(--fs-h2); line-height: 1.3; }
.gcard__graph { border-radius: var(--r); overflow: hidden; box-shadow: 0 0 0 1px var(--line); }
.olink { justify-self: start; display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--fs-body); font-weight: 500; color: var(--blue); }
.olink:hover { text-decoration: underline; text-underline-offset: 3px; }
.gcard__open { display: flex; align-items: center; justify-content: center; gap: var(--s2); height: 48px; border-radius: var(--r); background: var(--solid); color: var(--on-solid); font-size: var(--fs-body); font-weight: 500; }
@media (max-width: 768px) {
  .gcard { padding: var(--s4); }
  .olink { min-height: 44px; }
}
</style>
