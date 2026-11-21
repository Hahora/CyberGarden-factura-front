<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import FileComposer from '../components/FileComposer.vue'
import Icon from '../components/Icon.vue'
import HomeWaves from '../components/HomeWaves.vue'
import UiLoad from '../components/UiLoad.vue'
import UiSkeleton from '../components/UiSkeleton.vue'
import { runsLoad } from '../api/state'
import { summaryLoading } from '../api/runs'
import { useScrollMemory } from '../viewState'
import { plural } from '../search'
import { fmtInt } from '../fmt'
import { state } from '../store'
import { isApi } from '../config'
import { startRun, sendingText, runOf, runSummary, sortedRuns } from '../case/runs'

const router = useRouter()
const scroller = ref<HTMLElement | null>(null)
useScrollMemory(scroller, 'home')

const busy = ref(false)
async function send(files: File[], folder: string, domain: 'solar' | 'rag') {
  if (busy.value) return
  busy.value = true
  try {
    const id = await startRun(files, domain, { title: folder || undefined })
    if (id) void router.push('/run/' + id)
  } finally {
    busy.value = false
  }
}
const recentLoading = computed(() => runsLoad.state === 'loading')
const sumWait = (id: string) => isApi && !!runOf(id)?.remote && summaryLoading(id)
const recent = computed(() => sortedRuns().slice(0, 4).map((r) => ({ run: r, s: runSummary(r.id) })))
const fmtDate = (t: number) => {
  const d = new Date(t)
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const hour = new Date().getHours()
const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
</script>

<template>
  <div ref="scroller" class="home">
    <HomeWaves :active="busy || state.dragging" />
    <div class="home__inner">
      <Icon name="logo" :size="44" class="home__logo" />
      <h1 class="home__title">{{ hello }}. Что разберём?</h1>
      <p class="home__what">Научные PDF → таблица результатов, каждое число со ссылкой на место в статье</p>

      <FileComposer class="home__composer" autofocus pick-domain :busy="busy" :busy-text="sendingText()" :placeholder="state.mobile ? 'Добавьте PDF, папку или ZIP' : 'Перетащите PDF, папку или ZIP'" @send="send" />

      <UiLoad :loading="recentLoading" tag="section" class="recent" aria-label="Недавние разборы">
        <template #skeleton>
          <h2 class="recent__h">Недавние разборы</h2>
          <div v-for="i in 3" :key="i" class="recent__row recent__row--sk"><UiSkeleton variant="circle" width="15px" /><UiSkeleton :style="{ width: [48, 36, 56][i - 1] + '%' }" /></div>
        </template>
        <template v-if="recent.length">
        <h2 class="recent__h">Недавние разборы</h2>
        <RouterLink v-for="{ run, s } in recent" :key="run.id" :to="'/run/' + run.id" class="recent__row">
          <Icon name="folder" :size="15" class="recent__ico" />
          <span class="recent__t">{{ run.title }}</span>
          <span v-if="sumWait(run.id)" class="recent__n"><UiSkeleton width="180px" /></span>
          <span v-else class="recent__n num">{{ s.papers }} {{ plural(s.papers, ['статья', 'статьи', 'статей']) }} · {{ fmtInt(s.values) }} {{ plural(s.values, ['значение', 'значения', 'значений']) }} · {{ s.issues }} {{ plural(s.issues, ['замечание', 'замечания', 'замечаний']) }}</span>
          <span class="recent__d">{{ fmtDate(run.createdAt) }}</span>
        </RouterLink>
      </template>
      </UiLoad>
      <p v-if="state.mobile" class="home__sp" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.home { position: relative; isolation: isolate; height: 100%; overflow: auto; display: grid; place-items: center; padding: var(--s10) var(--s6); }
.home__inner { position: relative; z-index: 1; width: min(760px, 100%); display: grid; justify-items: center; }
.home__logo { margin-bottom: var(--s5); }
.home__title { font-size: var(--fs-hero); line-height: 1.15; font-weight: 300; letter-spacing: -0.01em; text-align: center; text-wrap: balance; }
.home__what { margin-top: var(--s3); max-width: 34em; color: var(--muted); font-size: var(--fs-body); line-height: 1.5; text-align: center; text-wrap: balance; }
.home__composer { margin-top: var(--s6); }

.recent:empty { display: none; }
.recent__row--sk { pointer-events: none; }
.recent { width: 100%; margin-top: var(--s8); display: grid; gap: 1px; }
.recent__h { padding: 0 var(--s3) var(--s1); font-size: var(--fs-sm); font-weight: 500; color: var(--muted); }
.recent__row {
  display: flex; align-items: center; gap: var(--s3); min-height: var(--row-h); padding: 0 var(--s3); border-radius: var(--r-sm);
  font-size: var(--fs-sm); color: var(--ink-2); transition: background-color var(--t-fast) ease, color var(--t-fast) ease;
}
.recent__row:hover { background: var(--bg-2); color: var(--ink); }
.recent__ico { flex: none; color: var(--faint); }
.recent__t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.recent__n { flex: none; color: var(--muted); }
.recent__d { flex: none; min-width: var(--s10); text-align: right; color: var(--faint); font-size: var(--fs-xs); }
@media (max-width: 768px) {
  .home { display: block; padding: 0; }
  .home__inner { min-height: 100%; display: flex; flex-direction: column; width: 100%; padding: clamp(var(--s8), 9vh, 88px) 0 calc(var(--s3) + var(--safe-b)); }
  .home__logo { margin: auto auto var(--s4); }
  .home__title { margin: 0 var(--s6); }
  .home__what { margin: var(--s2) var(--s6) 0; font-size: var(--fs-sm); }
  .recent { order: 1; margin: var(--s6) 0 0; padding: 0 var(--s2); }
  .recent__n { display: none; }
  .home__sp { order: 1; flex: 1; min-height: var(--s4); }
  .home__composer { order: 3; margin: 0 var(--s3); width: auto; }
}
</style>
