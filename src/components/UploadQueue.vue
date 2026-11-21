<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Icon from './Icon.vue'
import UiProgress from './UiProgress.vue'
import UiSpinner from './UiSpinner.vue'
import { openDeep } from '../viewState'
import { dock, watchDock } from '../dock'
import { plural } from '../search'
import { STAGES, chatOfPaper, dismiss, factsOf, openIssues, state, type Paper } from '../store'

const route = useRoute()
const router = useRouter()

const KEEP = 60_000
const seen = new Set<string>()
const doneAt = reactive<Record<string, number>>({})
const now = ref(Date.now())
const dismissed = ref<Set<string>>(new Set())
const tick = window.setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => clearInterval(tick))
watchEffect(() => {
  for (const p of state.papers) {
    if (p.processing < 100) {
      seen.add(p.id)
      delete doneAt[p.id]
    } else if (seen.has(p.id) && !doneAt[p.id]) doneAt[p.id] = Date.now()
  }
})

const items = computed<Paper[]>(() =>
  state.papers
    .filter((p) => !dismissed.value.has(p.id) && (p.processing < 100 || (doneAt[p.id] != null && now.value - doneAt[p.id]! < KEEP)))
    .sort((a, b) => Number(b.processing < 100) - Number(a.processing < 100) || b.addedAt - a.addedAt),
)
const doneCount = computed(() => items.value.filter((p) => p.processing >= 100).length)
const allDone = computed(() => items.value.length > 0 && doneCount.value === items.value.length)
const total = computed(() => items.value.length)
const avg = computed(() => (total.value ? items.value.reduce((s, p) => s + Math.min(100, p.processing), 0) / total.value : 0))

const hidden = computed(() => {
  if (!total.value) return true
  if (total.value > 1) return false
  const chat = chatOfPaper(items.value[0]!.id)
  return !!chat && route.path === '/c/' + chat.id
})

watch(
  () => state.toasts.length,
  () => {
    for (const t of [...state.toasts]) if (t.action && /» разобрана:/.test(t.text)) dismiss(t.id)
  },
  { flush: 'sync' },
)
watch(allDone, (v) => {
  if (v) state.queueOpen = false
})
watch(() => items.value.some((p) => p.processing < 100), (v) => {
  if (v) state.queueOpen = true
})

const title = computed(() => (allDone.value ? `Разобрано · ${total.value}` : `Разбор · ${doneCount.value} из ${total.value}`))
const stageOf = (p: Paper) => STAGES[Math.min(STAGES.length - 1, Math.floor((p.processing / 100) * STAGES.length))]!
const nameOf = (p: Paper) => p.file ?? p.title
function summary(p: Paper) {
  const n = factsOf(p.id).length
  const i = openIssues(p).length
  return `${n} ${plural(n, ['факт', 'факта', 'фактов'])} · ${i ? `${i} ${plural(i, ['замечание', 'замечания', 'замечаний'])}` : 'без замечаний'}`
}
function open(p: Paper) {
  const chat = chatOfPaper(p.id)
  sheet.value = false
  if (chat) void openDeep(router, { path: '/c/' + chat.id, query: { view: 'chat' } })
}
function close() {
  for (const p of items.value) if (p.processing >= 100) dismissed.value.add(p.id)
  dismissed.value = new Set(dismissed.value)
  sheet.value = false
}

const sheet = ref(false)
watchDock()
const bottom = computed(() => {
  const W = 340
  const base = 20
  const toasts = state.toasts.length * 58
  const left = window.innerWidth - 20 - W
  if (dock.on && left < dock.right + 12 && window.innerWidth - 20 > dock.left - 12) return { bottom: `${Math.max(base, window.innerHeight - dock.top + 12)}px` }
  return window.innerWidth <= 1180 ? { bottom: `${base + toasts}px` } : undefined
})
</script>

<template>
  <template v-if="!hidden">
    <template v-if="state.mobile">
      <button class="strip" type="button" :aria-label="title" @click="sheet = true">
        <UiSpinner v-if="!allDone" :size="16" tone="blue" label="Идёт разбор" />
        <Icon v-else name="check" :size="16" />
        <span class="strip__t">{{ title }}</span>
        <Icon name="chevron-right" :size="16" />
        <UiProgress v-if="!allDone" class="strip__bar" :value="avg" label="Общий прогресс разбора" />
      </button>
      <Transition name="fade">
        <div v-if="sheet" class="scrim" @click="sheet = false" />
      </Transition>
      <Transition name="rise">
        <div v-if="sheet" class="sheet" role="dialog" aria-modal="true" :aria-label="title">
          <div class="sheet__grip" />
          <header>
            <b>{{ title }}</b>
            <button v-if="allDone" class="link" @click="close">Скрыть</button>
            <button class="icon-btn" aria-label="Закрыть" @click="sheet = false"><Icon name="x" :size="18" /></button>
          </header>
          <ul>
            <li v-for="p in items" :key="p.id">
              <button class="row" @click="open(p)">
                <span class="st" :class="{ done: p.processing >= 100 }"><Icon v-if="p.processing >= 100" name="check" :size="14" /><UiSpinner v-else :size="14" tone="blue" /></span>
                <span class="tx">
                  <b>{{ nameOf(p) }}</b>
                  <small>{{ p.processing >= 100 ? summary(p) : stageOf(p) + ' · ' + Math.floor(p.processing) + ' %' }}</small>
                  <UiProgress v-if="p.processing < 100" class="bar" :value="p.processing" :label="'Разбор: ' + nameOf(p)" />
                </span>
              </button>
            </li>
          </ul>
        </div>
      </Transition>
    </template>

    <template v-else>
      <Transition name="pop">
        <section v-if="state.queueOpen" class="card" :style="bottom" aria-label="Очередь разбора" aria-live="polite">
          <header>
            <b>{{ title }}</b>
            <span class="grow" />
            <button v-if="allDone" class="link" @click="close">Скрыть</button>
            <button class="icon-btn icon-btn--sm" aria-label="Свернуть" @click="state.queueOpen = false"><Icon name="chevron-down" :size="16" /></button>
          </header>
          <ul>
            <li v-for="p in items" :key="p.id">
              <button class="row" @click="open(p)">
                <span class="st" :class="{ done: p.processing >= 100 }"><Icon v-if="p.processing >= 100" name="check" :size="12" /><UiSpinner v-else :size="12" tone="blue" /></span>
                <span class="tx">
                  <b :data-tip="nameOf(p)">{{ nameOf(p) }}</b>
                  <small>{{ p.processing >= 100 ? summary(p) : stageOf(p) }}</small>
                  <UiProgress v-if="p.processing < 100" class="bar" :value="p.processing" :label="'Разбор: ' + nameOf(p)" />
                </span>
                <span v-if="p.processing < 100" class="pc num">{{ Math.floor(p.processing) }}%</span>
              </button>
            </li>
          </ul>
        </section>
        <button v-else class="pill" :style="bottom" type="button" @click="state.queueOpen = true">
          <UiSpinner v-if="!allDone" :size="16" tone="blue" label="Идёт разбор" />
          <Icon v-else name="check" :size="16" />
          <span>{{ title }}</span>
        </button>
      </Transition>
    </template>
  </template>
</template>

<style scoped>
.card, .pill { position: fixed; right: var(--s5); bottom: var(--s5); z-index: var(--z-dock); }
.card {
  width: 340px; max-height: min(420px, 60vh); display: flex; flex-direction: column; overflow: hidden;
  border-radius: var(--r-lg); background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line-2);
}
.card header { flex: none; display: flex; align-items: center; gap: var(--s2); padding: var(--s3) var(--s2) var(--s2) var(--s4); font-size: var(--fs-body); }
.card header b { font-weight: 600; }
.grow { flex: 1; }
.link { padding: 0 6px; font-size: var(--fs-sm); color: var(--muted); }
.link:hover { color: var(--ink); }
.card ul, .sheet ul { list-style: none; padding: 0 6px 6px; overflow: auto; min-height: 0; }
.row { width: 100%; display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; border-radius: var(--r-sm); text-align: left; transition: background var(--t); }
.row:hover { background: var(--bg-2); }
.st { flex: none; width: 18px; height: 18px; margin-top: 2px; display: grid; place-items: center; border-radius: 50%; }
.st.done { background: var(--green); color: var(--on-accent); }
.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tx b { font-size: var(--fs-body); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx small { font-size: var(--fs-sm); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { margin-top: 4px; }
.pc { flex: none; font-size: var(--fs-xs); color: var(--muted); padding-top: 2px; }

.pill {
  display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px 0 12px; border-radius: var(--r-pill);
  background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line-2); font-size: var(--fs-sm); font-weight: 500;
}
.pill:hover { background: var(--bg-2); }

.card, .pill { transition: bottom var(--t-sheet) var(--ease), opacity var(--t) ease, translate var(--t-sheet) var(--ease); }

.pop-enter-active, .pop-leave-active { transition: opacity var(--t) ease, translate var(--t-sheet) var(--ease); }
.pop-enter-from, .pop-leave-to { opacity: 0; translate: 0 8px; }
.strip {
  position: relative; flex: none; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 0 16px;
  background: var(--bg-2); border-bottom: 1px solid var(--line); font-size: var(--fs-body); font-weight: 500;
}
.strip :deep(.ico:last-child) { margin-left: auto; color: var(--muted); }
.strip__t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.strip__bar { position: absolute; left: 0; right: 0; bottom: -1px; width: auto; border-radius: 0; }
.scrim { position: fixed; inset: 0; z-index: var(--z-drawer); background: var(--scrim); }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: calc(var(--z-drawer) + 1); max-height: 75dvh; display: flex; flex-direction: column;
  border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--card); padding-bottom: var(--safe-b); box-shadow: var(--shadow-pop);
}
.sheet__grip { flex: none; width: 36px; height: 4px; margin: 8px auto 0; border-radius: var(--r-pill); background: var(--line-2); }
.sheet header { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 8px 6px 20px; }
.sheet header b { flex: 1; font-size: var(--fs-h2); font-weight: 600; }
.sheet .link { min-height: 44px; font-size: var(--fs-body); }
.sheet .row { min-height: 60px; padding: 12px; align-items: center; }
.sheet .tx b { font-size: var(--fs-body); }
.sheet .tx small { font-size: var(--fs-sm); }
.sheet .st { margin-top: 0; width: 22px; height: 22px; }
.fade-enter-active, .fade-leave-active { transition: opacity var(--t) ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.rise-enter-active, .rise-leave-active { transition: translate var(--t-sheet) var(--ease); }
.rise-enter-from, .rise-leave-to { translate: 0 100%; }
</style>
