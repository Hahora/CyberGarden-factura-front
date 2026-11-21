<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import Composer from './Composer.vue'
import Icon from './Icon.vue'
import AnswerCard from './AnswerCard.vue'
import GraphCard from './GraphCard.vue'
import UiSkeleton from './UiSkeleton.vue'
import UiSpinner from './UiSpinner.vue'
import { openDeep, useScrollMemory, useViewState } from '../viewState'
import { factOf, openIssues, paperOf, projectOf, state, toast, type Chat, type Cite, type Turn } from '../store'
import { busyOf, copyTextOf, followups, metaOf, rate, reask, setReason, sevDot, stop, swapVersion, type AnswerItem } from '../query'
import { plural } from '../search'
import type { CollectionId } from '../data'

const props = withDefaults(defineProps<{ chat: Chat; collection: CollectionId; placeholder?: string; lockCollection?: boolean; showExplore?: boolean }>(), {
  placeholder: 'Уточните вопрос…',
  lockCollection: true,
  showExplore: true,
})
const emit = defineEmits<{ send: [text: string]; cite: [factId: string, paperId: string]; collection: [id: CollectionId] }>()

const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof Composer> | null>(null)
const router = useRouter()
const { had } = useScrollMemory(scroller, 'thread')
const ui = useViewState('thread', () => ({ allSrcs: [] as number[], editing: null as number | null, draft: '' }))
const atBottom = ref(!had)
const hasMore = ref(false)
function onScroll() {
  const el = scroller.value
  if (el) {
    const rest = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottom.value = rest < 80
    hasMore.value = rest > 80
  }
}
function toBottom(smooth = true) {
  const el = scroller.value
  if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}
function toTurnStart(id: number) {
  const sc = scroller.value
  const el = sc?.querySelector<HTMLElement>(`[data-turn="${id}"]`)
  if (!sc || !el) return toBottom()
  if (el.offsetHeight > sc.clientHeight - 24) sc.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: 'smooth' })
  else toBottom()
}
watch(
  () => props.chat.turns.map((t) => `${t.id}:${t.step}:${t.shown}:${t.done}`).join('|') + (busyOf(props.chat) ? '' : ':idle'),
  () => {
    if (atBottom.value) void nextTick(() => toBottom())
  },
)

let first = true
watch(
  () => props.chat.id,
  () => {
    const skip = first && had
    first = false
    if (!skip) void nextTick(() => toBottom(false))
  },
  { immediate: true },
)

const busy = computed(() => busyOf(props.chat))
const scopeLabel = computed(() => (props.chat.kind === 'paper' ? 'Эта статья' : props.chat.projectId ? `Проект «${projectOf(props.chat.projectId)?.name ?? ''}»` : undefined))
const last = computed(() => props.chat.turns.at(-1))
const isEnd = (t: Turn) => !!t.answer && t.shown >= t.answer.items.length
const doStop = () => stop(props.chat.id)

let following = false
watch(
  () => [last.value?.id, !!last.value && isEnd(last.value)] as const,
  ([id, end], [pid, pend]) => {
    if (id == null) return
    if (!end) following = atBottom.value
    else if ((pend === false || pid !== id) && following) {
      following = false
      void nextTick(() => setTimeout(() => id != null && toTurnStart(id), 60))
    }
  },
  { flush: 'post' },
)

function send(text: string) {
  emit('send', text)
  atBottom.value = true
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape' && busy.value && !e.defaultPrevented && editing.value == null) doStop()
}
onMounted(() => {
  window.addEventListener('keydown', onEsc)
  if (editing.value != null) void nextTick(growEdit)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onEsc))

const copied = ref<number | null>(null)
let copiedTimer = 0
async function copy(t: Turn) {
  if (!t.answer) return
  try {
    await navigator.clipboard.writeText(copyTextOf(t.answer))
    copied.value = t.id
    clearTimeout(copiedTimer)
    copiedTimer = window.setTimeout(() => (copied.value = null), 1600)
  } catch {
    toast('Не удалось скопировать')
  }
}
function retry(t: Turn) {
  atBottom.value = true
  reask(props.chat.id, t.q)
}
const REASONS = ['Неверная цифра', 'Не тот источник', 'Неполный ответ']
function like(t: Turn) {
  rate(t.id, 'up')
}
function dislike(t: Turn) {
  const was = atBottom.value
  rate(t.id, 'down')
  if (was) void nextTick(() => toBottom())
}
function reason(t: Turn, r: string) {
  const was = atBottom.value
  setReason(t.id, r)
  if (was) void nextTick(() => toBottom())
}
const hasContent = (t: Turn) => !!t.answer && !!(t.answer.intro || t.answer.items.length || t.answer.card)

const editing = toRef(ui, 'editing')
const draft = toRef(ui, 'draft')
const editArea = ref<HTMLTextAreaElement[] | HTMLTextAreaElement | null>(null)
const editEl = () => (Array.isArray(editArea.value) ? editArea.value[0] : editArea.value)
function growEdit() {
  const el = editEl()
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 180) + 'px'
}
function startEdit(t: Turn) {
  editing.value = t.id
  draft.value = t.q
  void nextTick(() => {
    editEl()?.focus()
    growEdit()
  })
}
function submitEdit() {
  const q = draft.value.trim()
  editing.value = null
  if (q) {
    atBottom.value = true
    reask(props.chat.id, q)
  }
}
function onEditKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submitEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    editing.value = null
  }
}

const picked = ref<{ tid: number; n: number } | null>(null)
const mini = computed(() => {
  const p = picked.value
  const t = p && props.chat.turns.find((x) => x.id === p.tid)
  return p && t?.answer ? (t.answer.cites[p.n - 1] ?? null) : null
})
const place = ref<{ key: string; mode: 'right' | 'above' | 'below'; dy: number } | null>(null)
function flip(e: Event, t: Turn, n: number) {
  const w = (e.currentTarget as HTMLElement).closest('.citew')
  const sc = scroller.value
  if (!w || !sc) return
  const wr = w.getBoundingClientRect()
  const scr = sc.getBoundingClientRect()
  const pop = w.querySelector<HTMLElement>('.cite__pop')
  const h = pop?.offsetHeight ?? 190
  const key = `${t.id}:${n}`
  let mode: 'right' | 'above' | 'below' = 'above'
  let dy = 0
  const cy = wr.top + wr.height / 2
  if (scr.right - wr.right >= 344 && scr.bottom - cy > h / 2 + 8) {
    mode = 'right'
    dy = Math.max(0, scr.top + 8 - (cy - h / 2))
  } else if (wr.top - scr.top < h + 16) mode = 'below'
  place.value = { key, mode, dy }
}
const placeCls = (t: Turn, n: number) => {
  const p = place.value
  return p && p.key === `${t.id}:${n}` ? 'is-' + p.mode : ''
}
function onCite(e: Event, t: Turn, n: number) {
  flip(e, t, n)
  picked.value = picked.value?.tid === t.id && picked.value.n === n ? null : { tid: t.id, n }
}
function openCiteOf(t: Turn, n: number) {
  const c = t.answer?.cites[n - 1]
  picked.value = null
  if (c) emit('cite', c.factId, c.paperId)
}
function openMini() {
  const c = mini.value
  picked.value = null
  if (c) emit('cite', c.factId, c.paperId)
}
function onDocClick(e: MouseEvent) {
  if (picked.value && !(e.target as HTMLElement).closest('.citew, .cmini')) picked.value = null
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && picked.value) {
    picked.value = null
    e.preventDefault()
  }
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onDocKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onDocKey)
})
watch(() => props.chat.id, () => (picked.value = null))

const itemsOf = (t: Turn) => (t.answer!.items as AnswerItem[]).slice(0, t.shown)
const grouped = (t: Turn) => (t.answer!.items as AnswerItem[]).some((x) => x.head)
const nb = (s: string) =>
  s.replace(/(\d)\s(%|В|мВ|мА\/см²|А\/м²|эВ|нм|мкм|ток\.|токенов)(?![А-Яа-яA-Za-z])/g, '$1\u00a0$2').replace(/(мА|А)\/(см²|м²)/g, '$1/\u2060$2')
function intro(t: Turn) {
  const a = t.answer!
  const m = a.items.length ? /^(.{8,140}?[.!?])(?:\s+(.+))?$/s.exec(a.intro) : null
  return { lead: m?.[1] ?? '', rest: m?.[2] ?? '' }
}
function issueOfCite(c: Cite): { title: string; level: 'doubt' | 'conflict' | 'warn' }[] {
  const p = paperOf(c.paperId)
  const f = factOf(c.factId)
  if (!p || !f) return []
  const open = openIssues(p)
  const wholePaper = (i: { factIds: string[]; anchors: string[] }) => !i.factIds.length && !i.anchors.length
  const mine = open.filter((x) => x.factIds.includes(f.id)).sort((x, y) => Number(y.level === 'conflict') - Number(x.level === 'conflict'))
  const i = (c.issueId ? open.find((x) => x.id === c.issueId) : undefined) ?? mine[0] ?? open.find(wholePaper)
  return i ? [{ title: i.title, level: i.level }] : []
}
const levelWord = (l: string) => (l === 'conflict' ? 'Ошибка' : 'Предупреждение')
const textHead = (s: string) => s.replace(/ ?[^ ]*$/, '')
const textTail = (s: string) => /([^ ]+)$/.exec(s)?.[1] ?? ''
const wide = (t: Turn) => {
  const c = t.answer?.card
  return !!c && c.kind === 'compare' && c.ids.length >= 3
}

const srcsOpen = (t: Turn) => ui.allSrcs.includes(t.id)
function toggleSrcs(t: Turn) {
  const i = ui.allSrcs.indexOf(t.id)
  if (i < 0) ui.allSrcs.push(t.id)
  else ui.allSrcs.splice(i, 1)
}
const srcsLabel = (n: number) => `${n} ${plural(n, ['источник', 'источника', 'источников'])}`
const nextQs = (t: Turn) => followups(props.chat, t).slice(0, 2)

defineExpose({ fill: (t: string) => composer.value?.fill(t) })
</script>

<template>
  <div class="thread">
    <div ref="scroller" class="thread__scroll" @scroll="onScroll">
      <div class="thread__inner">
        <slot name="lead" />
        <p v-if="!chat.turns.length && !$slots.lead" class="thread__empty">Задайте вопрос — отвечу по статьям и покажу, откуда каждая цифра.</p>

        <article v-for="t in chat.turns" :key="t.id" class="turn" :data-turn="t.id">
          <div v-if="editing === t.id" class="edit">
            <textarea ref="editArea" v-model="draft" class="edit__area" rows="1" aria-label="Изменить вопрос" @input="growEdit" @keydown="onEditKey" />
            <div class="edit__bar">
              <span class="edit__hint" />
              <button type="button" class="btn btn--sm btn--ghost" @click="editing = null">Отмена</button>
              <button type="button" class="btn btn--sm btn--dark" :disabled="!draft.trim()" @click="submitEdit">Задать</button>
            </div>
          </div>
          <div v-else class="turn__row">
            <button
              v-if="t === last && !busy" type="button" class="icon-btn icon-btn--sm turn__edit" aria-label="Изменить вопрос" data-tip="Изменить вопрос" @click="startEdit(t)"
            ><Icon name="edit" :size="15" /></button>
            <p class="turn__q">{{ t.q }}</p>
          </div>
          <div v-if="metaOf(t.id).alt && editing !== t.id" class="ver" role="group" aria-label="Версии вопроса">
            <button type="button" class="ver__b" aria-label="Прежний вопрос" data-tip="Прежний вопрос и ответ" :disabled="metaOf(t.id).ver === 1" @click="swapVersion(chat.id, t.id)"><Icon class="ver__l" name="chevron-right" :size="14" /></button>
            <span class="num">{{ metaOf(t.id).ver }}/2</span>
            <button type="button" class="ver__b" aria-label="После правки" data-tip="После правки" :disabled="metaOf(t.id).ver === 2" @click="swapVersion(chat.id, t.id)"><Icon name="chevron-right" :size="14" /></button>
          </div>

          <p v-if="!t.done" class="steps" aria-live="polite">
            <UiSpinner :size="14" tone="muted" label="Выполняется" /><span :key="t.step" class="steps__t">{{ t.steps[Math.min(t.step, t.steps.length - 1)] }}…</span>
          </p>

          <div v-else-if="t.answer" class="ans">
            <p v-if="t.answer.intro" class="ans__intro">
              <template v-if="intro(t).lead"><strong class="ans__lead">{{ intro(t).lead }}</strong><span v-if="intro(t).rest" class="ans__rest">{{ intro(t).rest }}</span></template>
              <template v-else>{{ t.answer.intro }}</template>
            </p>
            <ul v-if="t.answer.items.length" class="ans__list" role="list">
              <template v-for="(it, i) in itemsOf(t)" :key="i">
                <li v-if="it.head" class="ans__grp">{{ it.head }}</li>
                <li class="ans__item" :class="{ 'is-sub': grouped(t) }">
                  <span>{{ textHead(nb(it.text)) }} <span class="nb">{{ textTail(nb(it.text)) }}<span v-if="it.cite && t.answer.cites[it.cite - 1]" class="citew" :class="[placeCls(t, it.cite), { 'is-open': picked?.tid === t.id && picked.n === it.cite }]" @mouseenter="flip($event, t, it.cite)">
                    <button type="button" class="cite" :aria-label="'Источник ' + it.cite" @click="onCite($event, t, it.cite)">{{ it.cite }}</button>
                    <span v-if="!state.mobile" class="cite__pop" :style="place && place.key === t.id + ':' + it.cite ? { '--dy': place.dy + 'px' } : undefined">
                      <span class="cite__card">
                        <b>{{ t.answer.cites[it.cite - 1]!.title }}</b>
                        <span class="cite__where">{{ t.answer.cites[it.cite - 1]!.where }}</span>
                        <q>{{ t.answer.cites[it.cite - 1]!.quote }}</q>
                        <span v-for="iss in issueOfCite(t.answer.cites[it.cite - 1]!)" :key="iss.title" class="cite__issue"><i class="dot" :class="sevDot(iss.level)" aria-hidden="true" />{{ levelWord(iss.level) }} · {{ iss.title }}</span>
                        <button type="button" class="olink" @click.stop="openCiteOf(t, it.cite)">Показать в статье<Icon name="arrow-up-right" :size="14" /></button>
                      </span>
                    </span>
                  </span></span></span>
                </li>
              </template>
            </ul>

            <UiSkeleton v-if="!isEnd(t) && t.answer.card" variant="block" :height="t.answer.card.kind === 'graph' ? '440px' : '240px'" class="ans__card" />

            <template v-if="isEnd(t)">
              <template v-if="!metaOf(t.id).stopped">
                <p v-if="t.answer.outro" class="ans__outro">{{ t.answer.outro }}</p>
                <template v-if="t.answer.card">
                  <GraphCard
                    v-if="t.answer.card.kind === 'graph'" class="ans__card ans__card--wide" :name="'t' + t.id"
                    :collection="t.answer.card.collection" :root="t.answer.card.root" :focus="t.answer.card.focus" :title="t.answer.card.title"
                  />
                  <AnswerCard v-else :card="t.answer.card" :name="'t' + t.id" class="ans__card" :class="{ 'ans__card--wide': wide(t) }" />
                </template>
                <button v-if="showExplore && t.answer.explore && !t.answer.card" type="button" class="olink" @click="openDeep(router, { path: '/explore', query: { q: t.answer.explore } })">Открыть таблицей<Icon name="arrow-up-right" :size="15" /></button>
                <div v-if="t.answer.cites.length" class="srcs">
                  <button type="button" class="srcs__toggle" :aria-expanded="srcsOpen(t)" @click="toggleSrcs(t)">
                    {{ srcsLabel(t.answer.cites.length) }}<Icon class="srcs__chev" :class="{ 'is-open': srcsOpen(t) }" name="chevron-right" :size="14" />
                  </button>
                  <template v-if="srcsOpen(t)">
                    <button v-for="c in t.answer.cites" :key="c.n" type="button" class="srcs__item" @click="emit('cite', c.factId, c.paperId)">
                      <span class="srcs__n num">{{ c.n }}</span>
                      <span class="srcs__t" :data-tip="c.title">{{ c.title }}</span>
                      <span class="srcs__w">{{ c.where }}</span>
                    </button>
                  </template>
                </div>
              </template>
              <p v-else class="stopped"><svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" /></svg>Остановлено</p>

              <div class="acts" :class="{ 'acts--last': t === last }" role="group" aria-label="Действия с ответом">
                <button v-if="hasContent(t)" type="button" class="acts__b" :aria-label="copied === t.id ? 'Скопировано' : 'Копировать'" :data-tip="copied === t.id ? 'Скопировано' : 'Копировать'" @click="copy(t)"><Icon :name="copied === t.id ? 'check' : 'copy'" :size="17" /></button>
                <button v-if="t === last" type="button" class="acts__b" aria-label="Повторить" data-tip="Повторить" :disabled="busy" @click="retry(t)">
                  <svg class="ico" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20 4v5h-5" /></svg>
                </button>
                <button v-if="hasContent(t)" type="button" class="acts__b" :class="{ 'is-on': metaOf(t.id).rating === 'up' }" aria-label="Полезный ответ" data-tip="Полезно" :aria-pressed="metaOf(t.id).rating === 'up'" @click="like(t)">
                  <svg class="ico" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11v9H4v-9z" /><path d="M7 11l4-7c1.7 0 2.5 1.2 2.2 2.8L12.7 9H19a2 2 0 0 1 2 2.4l-1.3 6.6a2 2 0 0 1-2 1.6H7" /></svg>
                </button>
                <button v-if="hasContent(t)" type="button" class="acts__b" :class="{ 'is-on': metaOf(t.id).rating === 'down' }" aria-label="Неточный ответ" data-tip="Неточно" :aria-pressed="metaOf(t.id).rating === 'down'" @click="dislike(t)">
                  <svg class="ico" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 13V4h3v9z" /><path d="M17 13l-4 7c-1.7 0-2.5-1.2-2.2-2.8l.5-2.2H5a2 2 0 0 1-2-2.4L4.3 6a2 2 0 0 1 2-1.6H17" /></svg>
                </button>
                <span v-if="metaOf(t.id).rating === 'up'" class="acts__ok">Спасибо</span>
              </div>
              <div v-if="hasContent(t) && metaOf(t.id).rating === 'down'" class="why" role="group" aria-label="Что не так">
                <span v-if="metaOf(t.id).reason" class="why__t">Спасибо, учтём: {{ metaOf(t.id).reason!.toLowerCase() }}</span>
                <template v-else>
                  <span class="why__t">Что не так?</span>
                  <button v-for="r in REASONS" :key="r" type="button" class="chip" @click="reason(t, r)">{{ r }}</button>
                </template>
              </div>

              <div v-if="t === last && !busy && nextQs(t).length" class="next" role="group" aria-label="Связанные вопросы">
                <button v-for="q in nextQs(t)" :key="q" type="button" class="chip chip--q" @click="send(q)">{{ q }}</button>
              </div>
            </template>
          </div>
        </article>
      </div>
    </div>

    <div class="thread__dock">
      <template v-if="state.mobile && mini">
        <div class="cmini__bd" @click="picked = null" />
        <section class="cmini" role="dialog" aria-label="Источник">
          <b>{{ mini.title }}</b>
          <span class="cite__where">{{ mini.where }}</span>
          <q>{{ mini.quote }}</q>
          <span v-for="iss in issueOfCite(mini)" :key="iss.title" class="cite__issue"><i class="dot" :class="sevDot(iss.level)" aria-hidden="true" />{{ levelWord(iss.level) }} · {{ iss.title }}</span>
          <button type="button" class="olink" @click="openMini">Показать в статье<Icon name="arrow-up-right" :size="15" /></button>
        </section>
      </template>
      <div v-if="!atBottom && hasMore" class="thread__downrow">
        <button type="button" class="thread__down" aria-label="Вниз" @click="toBottom()"><Icon name="chevron-down" :size="16" />Вниз</button>
      </div>
      <Composer
        ref="composer"
        :collection="collection"
        :project-id="chat.projectId"
        :lock-collection="lockCollection"
        :scope-label="scopeLabel"
        :scope-icon="chat.kind === 'paper' ? 'doc' : chat.projectId ? 'folder' : undefined"
        :placeholder="placeholder"
        :busy="busy"
        autofocus
        @send="send"
        @stop="doStop"
        @collection="(c) => emit('collection', c)"
      />
    </div>
  </div>
</template>

<style scoped>
.thread { position: relative; height: 100%; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; }

.thread__scroll { overflow: auto; container-type: inline-size; }
.thread__inner { width: min(808px, 100%); margin: 0 auto; padding: var(--s8) var(--s6) var(--s6); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--block); }
.thread__empty { color: var(--muted); text-align: center; padding-top: 18vh; }

.turn { display: grid; gap: var(--s3); min-width: 0; }
.turn__row { justify-self: end; max-width: 80%; display: flex; align-items: center; gap: var(--s1); }
.turn__q { padding: var(--s3) var(--s4); border-radius: var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg); background: var(--bg-2); font-size: var(--fs-body); line-height: 1.5; overflow-wrap: anywhere; }
.turn__edit { opacity: 0; transition: opacity var(--t) ease, background-color var(--t) ease; }
.turn__row:hover .turn__edit, .turn__edit:focus-visible { opacity: 1; }
.edit { justify-self: end; width: min(560px, 100%); padding: var(--s3) var(--s4) var(--s2); border-radius: var(--r-lg); background: var(--card); box-shadow: 0 0 0 1.5px var(--blue); }
.edit__area { display: block; width: 100%; min-height: 24px; max-height: 180px; resize: none; border: 0; outline: 0; background: none; font-size: var(--fs-body); line-height: 1.5; padding: 0; }
.edit__bar { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s2); }
.edit__hint { flex: 1; min-width: 0; font-size: var(--fs-xs); color: var(--muted); }

.steps { display: flex; align-items: center; gap: var(--s3); min-height: 28px; color: var(--muted); font-size: var(--fs-body); }
.steps__t { animation: step-in 220ms var(--ease) both; }
@keyframes step-in { from { opacity: 0; translate: 0 3px; } }

.ans { display: grid; gap: var(--s3); min-width: 0; font-size: var(--fs-body); line-height: 1.65; }
.ans__intro { color: var(--ink); }
.ans__lead { display: block; font-size: var(--fs-h2); font-weight: 600; line-height: 1.4; color: var(--ink); text-wrap: balance; }
.ans__rest { display: block; margin-top: var(--s1); color: var(--muted); font-size: var(--fs-sm); line-height: 1.5; }
.ans__list { list-style: none; padding: 0; display: grid; gap: var(--s2); }
.ans__grp { margin-top: var(--s2); font-weight: 600; color: var(--ink); line-height: 1.45; animation: rise 320ms var(--ease) both; }
.ans__grp:first-child { margin-top: 0; }
.ans__item { position: relative; padding-left: var(--s4); animation: rise 320ms var(--ease) both; }
.ans__item:hover, .ans__item:focus-within, .ans__item:has(.citew.is-open) { z-index: 6; }
.ans__item.is-sub { color: var(--ink-2); }
.nb { display: inline-block; white-space: nowrap; }
.ans__item::before { content: ''; position: absolute; left: 0; top: 0.82em; width: 7px; height: 1.5px; background: var(--faint); }
.ans__outro { color: var(--ink-2); }
.ans__card { margin-top: var(--s1); animation: card-in 320ms var(--ease) both; }
.ans__card--wide { margin-inline: calc(-1 * clamp(0px, (100cqw - 840px) / 2, 64px)); }
@keyframes card-in { from { opacity: 0; translate: 0 6px; } }
@keyframes rise { from { opacity: 0; translate: 0 4px; } }
.olink { justify-self: start; display: inline-flex; align-items: center; gap: var(--s1); font-size: var(--fs-body); font-weight: 500; color: var(--blue); }
.olink:hover { text-decoration: underline; text-underline-offset: 3px; }
.citew { position: relative; display: inline-block; }
.citew:hover, .citew:focus-within, .citew.is-open { z-index: 30; }
.cite {
  position: relative; display: inline-grid; place-items: center; min-width: 20px; height: 20px; margin-left: 4px; padding: 0 4px;
  vertical-align: middle; border-radius: var(--r-pill); font-size: 11px; font-weight: 500; color: var(--muted); background: var(--bg-2);
  transition: background-color var(--t) ease, color var(--t) ease;
}
.cite::after { content: ''; position: absolute; inset: -6px -3px; }
.cite:hover, .cite:focus-visible, .citew.is-open .cite { background: var(--ink); color: var(--bg); }
.cite__pop {
  white-space: normal; position: absolute; z-index: 20; left: 50%; bottom: 100%; translate: -50% 4px; width: 320px; max-width: 80vw; padding-bottom: var(--s2);
  opacity: 0; pointer-events: none; transition: opacity 140ms ease, translate 200ms var(--ease);
}
.citew:hover .cite__pop, .citew:focus-within .cite__pop, .citew.is-open .cite__pop { opacity: 1; translate: -50% 0; pointer-events: auto; }
.citew.is-below .cite__pop { bottom: auto; top: 100%; padding-bottom: 0; padding-top: var(--s2); translate: -50% -4px; }
.citew.is-below:hover .cite__pop, .citew.is-below:focus-within .cite__pop, .citew.is-below.is-open .cite__pop { translate: -50% 0; }
.citew.is-right .cite__pop { left: 100%; bottom: auto; top: 50%; padding: 0 0 0 var(--s3); translate: 4px calc(-50% + var(--dy, 0px)); }
.citew.is-right:hover .cite__pop, .citew.is-right:focus-within .cite__pop, .citew.is-right.is-open .cite__pop { translate: 0 calc(-50% + var(--dy, 0px)); }
.citew.is-right .cite__card::before {
  content: ''; position: absolute; left: -5px; top: calc(50% - var(--dy, 0px)); width: 10px; height: 10px; translate: 0 -50%; rotate: 45deg;
  background: var(--card); box-shadow: -1px 1px 0 var(--line);
}
.citew.is-right .cite__card { position: relative; }
.cite__card, .cmini {
  display: grid; gap: var(--s1); padding: var(--s3) var(--s4); border-radius: var(--r); text-align: left;
  background: var(--card); color: var(--ink); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line);
  font-size: var(--fs-sm); font-weight: 400; line-height: 1.45;
}
.cite__card b, .cmini b { font-weight: 600; }
.cite__where { color: var(--muted); }
.cite__card q, .cmini q { margin-top: var(--s1); padding-left: var(--s3); border-left: 2px solid var(--blue); color: var(--ink-2); font-family: var(--serif); quotes: '«' '»'; }
.cite__card .olink, .cmini .olink { margin-top: var(--s1); font-size: var(--fs-sm); }
.cmini__bd { position: fixed; inset: 0; z-index: 30; }
.cmini { position: absolute; z-index: 31; left: var(--s3); right: var(--s3); bottom: calc(100% + var(--s1)); }
.srcs { display: grid; gap: 2px; justify-items: start; }
.srcs__toggle { display: inline-flex; align-items: center; gap: 2px; height: 28px; font-size: var(--fs-sm); color: var(--muted); border-radius: var(--r-sm); transition: color var(--t) ease; }
.srcs__toggle:hover { color: var(--ink); }
.srcs__chev { transition: rotate 200ms var(--ease); }
.srcs__chev.is-open { rotate: 90deg; }
.srcs__item {
  width: 100%; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: baseline; gap: var(--s3);
  padding: var(--s1) var(--s2); border-radius: var(--r-sm); font-size: var(--fs-sm); line-height: 1.4; text-align: left;
}
.srcs__item:hover { background: var(--bg-2); }
.srcs__n { color: var(--muted); font-weight: 500; }
.srcs__t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srcs__w { color: var(--muted); white-space: nowrap; font-size: var(--fs-xs); }

.ver { justify-self: end; display: inline-flex; align-items: center; gap: var(--s1); margin-top: calc(var(--s2) * -1); font-size: var(--fs-xs); color: var(--muted); }
.ver__b { width: 24px; height: 24px; display: grid; place-items: center; border-radius: var(--r-sm); color: var(--ink-2); }
.ver__b:hover:not(:disabled) { background: var(--bg-2); color: var(--ink); }
.ver__b:disabled { opacity: 0.35; cursor: default; }
.ver__l { rotate: 180deg; }
.stopped { display: inline-flex; align-items: center; gap: var(--s2); font-size: var(--fs-sm); color: var(--muted); }
.acts { display: flex; align-items: center; gap: 2px; margin-left: calc(var(--s2) * -1); opacity: 0; transition: opacity var(--t) ease; }
.turn:hover .acts, .acts:focus-within, .acts--last { opacity: 1; }
.acts__b { position: relative; width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--r-sm); color: var(--muted); transition: background-color var(--t) ease, color var(--t) ease; }
.acts__b:hover:not(:disabled) { background: var(--bg-2); color: var(--ink); }
.acts__b:disabled { opacity: 0.4; cursor: default; }
.acts__b.is-on { color: var(--blue); background: var(--blue-wash); }
.acts__ok { margin-left: var(--s2); font-size: var(--fs-sm); color: var(--muted); }

.why { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2); }
.why__t { font-size: var(--fs-sm); color: var(--muted); }
.next { display: flex; flex-wrap: wrap; gap: var(--s2); margin-top: var(--s1); }
.chip {
  display: inline-flex; align-items: center; gap: var(--s2); min-height: 32px; padding: 0 var(--s3); border-radius: var(--r-pill);
  font-size: var(--fs-sm); box-shadow: inset 0 0 0 1px var(--line-2); transition: background-color var(--t) ease;
}
.chip:hover { background: var(--bg-2); }
.chip--q { color: var(--ink-2); }

.thread__dock { position: relative; width: min(808px, 100%); margin: 0 auto; padding: var(--s2) var(--s6) var(--s5); }
.thread__downrow { display: flex; justify-content: center; padding-bottom: var(--s2); }
.thread__down { display: inline-flex; align-items: center; gap: var(--s1); min-height: 32px; padding: 0 var(--s3) 0 var(--s2); border-radius: var(--r-pill); font-size: var(--fs-sm); color: var(--ink-2); background: var(--card); box-shadow: 0 0 0 1px var(--line-2); }
.thread__down:hover { color: var(--ink); background: var(--bg-2); }
.cite__issue { display: flex; align-items: center; gap: var(--s2); margin-top: var(--s1); color: var(--ink-2); }

@media (prefers-reduced-motion: reduce) {
  .ans__item { animation: none; }
}
@media (max-width: 768px) {
  .thread__inner { padding: var(--s5) var(--s4) var(--s3); }
  .turn__row { max-width: 92%; }
  .turn__edit { opacity: 1; width: 44px; height: 44px; }
  .srcs__item { grid-template-columns: 22px minmax(0, 1fr); min-height: 44px; align-items: center; }
  .srcs__w { grid-column: 2; margin-top: -4px; }
  .thread__dock { padding: var(--s2) var(--s3) calc(var(--s3) + var(--safe-b)); }
  .thread__down { min-height: 44px; padding: 0 var(--s4) 0 var(--s3); }
  .cite { min-width: 28px; height: 28px; font-size: var(--fs-xs); vertical-align: middle; }
  .cite::after { inset: -8px -8px; }
  .srcs__toggle { min-height: 44px; padding-right: var(--s3); }
  .olink { min-height: 44px; }
  .acts__b { width: 44px; height: 44px; }
  .ver__b { width: 44px; height: 44px; }
  .ver { margin-top: calc(var(--s3) * -1); }
  .acts { opacity: 1; }
  .acts:not(.acts--last) { display: none; }
  .chip { min-height: 44px; }
}
</style>
