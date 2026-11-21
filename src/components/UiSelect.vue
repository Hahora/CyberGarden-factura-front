<script setup lang="ts" generic="V extends string">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import Icon from './Icon.vue'
import { state } from '../store'
import { scrollWithin } from '../scroll'

export interface Option<T extends string = string> {
  value: T
  label: string
  icon?: string
  hint?: string
  group?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: V | V[] | null
    options: Option<V>[]
    label: string
    placeholder?: string
    multiple?: boolean
    searchable?: boolean
    size?: 'sm' | 'md'
    variant?: 'soft' | 'ghost' | 'chip'
    prefix?: string
    minWidth?: number
    align?: 'start' | 'end'
    disabled?: boolean
    summary?: (n: number) => string
  }>(),
  { placeholder: 'Выбрать', size: 'md', variant: 'soft', minWidth: 220, align: 'start' },
)
const emit = defineEmits<{ 'update:modelValue': [v: V | V[]]; change: [v: V | V[]] }>()

const id = useId()
const open = ref(false)
const query = ref('')
const active = ref(0)
const trigger = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()
const search = ref<HTMLInputElement>()
const pos = ref({ left: 0, top: 0, width: 0, up: false, maxH: 360 })

const selected = computed<V[]>(() => (props.modelValue == null ? [] : Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]))
const isOn = (v: V) => selected.value.includes(v)
const showSearch = computed(() => props.searchable ?? props.options.length > 7)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => (o.label + ' ' + (o.hint ?? '') + ' ' + (o.group ?? '')).toLowerCase().includes(q)) : props.options
})
const rows = computed(() => {
  const out: ({ type: 'group'; label: string } | { type: 'opt'; o: Option<V>; i: number })[] = []
  let g: string | undefined
  filtered.value.forEach((o, i) => {
    if (o.group && o.group !== g) out.push({ type: 'group', label: o.group })
    g = o.group
    out.push({ type: 'opt', o, i })
  })
  return out
})

const current = computed(() => props.options.filter((o) => isOn(o.value)))
const text = computed(() => {
  if (!current.value.length) return props.placeholder
  if (current.value.length === 1) return current.value[0]!.label
  if (props.summary) return props.summary(current.value.length)
  return `${current.value[0]!.label} +${current.value.length - 1}`
})
const icon = computed(() => (current.value.length === 1 ? current.value[0]!.icon : undefined))

function place() {
  const r = trigger.value?.getBoundingClientRect()
  if (!r) return
  const below = window.innerHeight - r.bottom - 12
  const above = r.top - 12
  const up = below < 240 && above > below
  const width = Math.max(r.width, props.minWidth)
  let left = props.align === 'end' ? r.right - width : r.left
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  pos.value = { left, top: up ? r.top - 6 : r.bottom + 6, width, up, maxH: Math.min(380, up ? above : below) }
}

async function show() {
  if (props.disabled) return
  open.value = true
  query.value = ''
  const first = filtered.value.findIndex((o) => isOn(o.value))
  active.value = first >= 0 ? first : 0
  if (!state.mobile) place()
  await nextTick()
  if (showSearch.value && !state.mobile) search.value?.focus()
  else list.value?.focus()
  scrollActive()
}
function hide(focusBack = true) {
  open.value = false
  query.value = ''
  drag.value = 0
  if (focusBack) void nextTick(() => trigger.value?.focus())
}
function clearAll() {
  emit('update:modelValue', [] as V[])
  emit('change', [] as V[])
}
const toggle = () => (open.value ? hide() : void show())

function pick(o: Option<V>) {
  if (o.disabled) return
  if (props.multiple) {
    const next = isOn(o.value) ? selected.value.filter((v) => v !== o.value) : [...selected.value, o.value]
    emit('update:modelValue', next)
    emit('change', next)
  } else {
    emit('update:modelValue', o.value)
    emit('change', o.value)
    hide()
  }
}

function scrollActive() {
  void nextTick(() => scrollWithin(list.value, list.value?.querySelector('.us__opt.is-active'), 'nearest', false))
}
function move(d: number) {
  const n = filtered.value.length
  if (!n) return
  let i = active.value
  for (let k = 0; k < n; k++) {
    i = (i + d + n) % n
    if (!filtered.value[i]!.disabled) break
  }
  active.value = i
  scrollActive()
}
let typed = ''
let typedAt = 0
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') move(1)
  else if (e.key === 'ArrowUp') move(-1)
  else if (e.key === 'PageDown') move(Math.min(8, filtered.value.length - 1 - active.value) || 1)
  else if (e.key === 'PageUp') (active.value = Math.max(0, active.value - 8)), scrollActive()
  else if (e.key === ' ' && props.multiple && !(e.target instanceof HTMLInputElement)) {
    const o = filtered.value[active.value]
    if (o) pick(o)
  } else if (e.key === 'Home') (active.value = 0), scrollActive()
  else if (e.key === 'End') (active.value = filtered.value.length - 1), scrollActive()
  else if (e.key === 'Enter') {
    const o = filtered.value[active.value]
    if (o) pick(o)
  } else if (e.key === 'Escape') hide()
  else if (e.key === 'Tab') return hide(false)
  else if (!showSearch.value && e.key.length === 1) {
    const now = Date.now()
    typed = now - typedAt > 700 ? e.key : typed + e.key
    typedAt = now
    const i = filtered.value.findIndex((o) => o.label.toLowerCase().startsWith(typed.toLowerCase()))
    if (i >= 0) (active.value = i), scrollActive()
  } else return
  e.preventDefault()
  e.stopPropagation()
}
const drag = ref(0)
let dragY = 0
let dragOn = false
function dragStart(e: PointerEvent) {
  dragOn = true
  dragY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function dragMove(e: PointerEvent) {
  if (dragOn) drag.value = Math.max(0, e.clientY - dragY)
}
function dragEnd() {
  if (!dragOn) return
  dragOn = false
  if (drag.value > 90) hide()
  else drag.value = 0
}
function onTriggerKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    void show()
  }
}
watch(query, () => (active.value = 0))

function onDoc(e: Event) {
  const t = e.target as Node
  if (!open.value || trigger.value?.contains(t) || list.value?.closest('.us__pop, .us__sheet')?.contains(t)) return
  hide(false)
}
function onScroll(e: Event) {
  if (open.value && !state.mobile && !(e.target instanceof Node && list.value?.contains(e.target))) hide(false)
}
const onResize = () => open.value && hide(false)
watch(open, (o) => {
  const m = o ? 'addEventListener' : 'removeEventListener'
  document[m]('pointerdown', onDoc, true)
  window[m]('scroll', onScroll, true)
  window[m]('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDoc, true)
  window.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <span class="us-root">
  <button
    ref="trigger" type="button" class="us" :class="['us--' + size, 'us--' + variant, { 'is-open': open, 'is-empty': !current.length }]"
    :disabled="disabled" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="id" :aria-label="label + ': ' + text"
    @click="toggle" @keydown="onTriggerKey"
  >
    <span v-if="prefix" class="us__prefix">{{ prefix }}</span>
    <Icon v-if="icon" :name="icon" :size="size === 'sm' ? 14 : 16" class="us__ico" />
    <span class="us__text">{{ text }}</span>
    <Icon name="chevron-down" :size="14" class="us__chev" />
  </button>

  <Teleport to="body">
    <div
      v-if="open && !state.mobile" class="us__pop" :class="{ 'is-up': pos.up }"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', width: pos.width + 'px' }"
    >
      <div v-if="showSearch" class="us__search">
        <Icon name="search" :size="15" />
        <input ref="search" v-model="query" type="text" placeholder="Найти…" :aria-controls="id" autocomplete="off" @keydown="onKey" />
      </div>
      <div
        :id="id" ref="list" class="us__list" role="listbox" tabindex="-1" :aria-label="label" :aria-multiselectable="multiple || undefined"
        :aria-activedescendant="filtered[active] ? id + '-' + active : undefined" :style="{ maxHeight: pos.maxH - (showSearch ? 46 : 0) + 'px' }"
        @keydown="onKey"
      >
        <template v-for="(r, k) in rows" :key="k">
          <p v-if="r.type === 'group'" class="us__group">{{ r.label }}</p>
          <div
            v-else :id="id + '-' + r.i" class="us__opt" role="option" :aria-selected="isOn(r.o.value)" :aria-disabled="r.o.disabled || undefined"
            :class="{ 'is-active': r.i === active, 'is-on': isOn(r.o.value), 'is-off': r.o.disabled }"
            @pointermove="active = r.i" @click="pick(r.o)"
          >
            <span v-if="multiple" class="us__box"><Icon v-if="isOn(r.o.value)" name="check" :size="12" /></span>
            <Icon v-if="r.o.icon" :name="r.o.icon" :size="16" class="us__oico" />
            <span class="us__ot"><span>{{ r.o.label }}</span><small v-if="r.o.hint">{{ r.o.hint }}</small></span>
            <Icon v-if="!multiple && isOn(r.o.value)" name="check" :size="16" class="us__check" />
          </div>
        </template>
        <p v-if="!filtered.length" class="us__none">Ничего не найдено<button v-if="query" type="button" class="us__link" @click="query = ''">Сбросить</button></p>
      </div>
      <div v-if="multiple" class="us__foot">
        <span class="num">Выбрано {{ selected.length }}</span>
        <button type="button" class="us__link" :disabled="!selected.length" @click="clearAll">Сбросить</button>
        <button type="button" class="us__link us__link--b" @click="hide()">Готово</button>
      </div>
    </div>

    <Transition name="us-fade"><div v-if="open && state.mobile" class="us__bd" @click="hide()" @touchmove.prevent /></Transition>
    <Transition name="us-sheet">
      <div v-if="open && state.mobile" class="us__sheet" role="dialog" aria-modal="true" :aria-label="label" :style="drag ? { translate: '0 ' + drag + 'px', transition: 'none' } : undefined" @keydown.esc.stop="hide()">
        <div class="us__drag" @pointerdown="dragStart" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd">
          <span class="us__grip" aria-hidden="true" />
          <div class="us__shead">
            <p class="us__stitle">{{ label }}</p>
          </div>
        </div>
        <div v-if="showSearch" class="us__search us__search--m">
          <Icon name="search" :size="16" />
          <input v-model="query" type="search" placeholder="Найти…" autocomplete="off" @keydown="onKey" />
        </div>
        <div :id="id" ref="list" class="us__list us__list--m" role="listbox" tabindex="-1" :aria-label="label" @keydown="onKey">
          <template v-for="(r, k) in rows" :key="k">
            <p v-if="r.type === 'group'" class="us__group">{{ r.label }}</p>
            <div
              v-else class="us__opt" role="option" :aria-selected="isOn(r.o.value)"
              :class="{ 'is-on': isOn(r.o.value), 'is-off': r.o.disabled }" @click="pick(r.o)"
            >
              <span v-if="multiple" class="us__box"><Icon v-if="isOn(r.o.value)" name="check" :size="13" /></span>
              <Icon v-if="r.o.icon" :name="r.o.icon" :size="20" class="us__oico" />
              <span class="us__ot"><span>{{ r.o.label }}</span><small v-if="r.o.hint">{{ r.o.hint }}</small></span>
              <Icon v-if="!multiple && isOn(r.o.value)" name="check" :size="20" class="us__check" />
            </div>
          </template>
          <p v-if="!filtered.length" class="us__none">Ничего не найдено<button v-if="query" type="button" class="us__link" @click="query = ''">Сбросить</button></p>
        </div>
        <div v-if="multiple" class="us__foot us__foot--m">
          <span class="num">Выбрано {{ selected.length }}</span>
          <button type="button" class="us__link" :disabled="!selected.length" @click="clearAll">Сбросить</button>
          <button type="button" class="us__link us__link--b" @click="hide()">Готово</button>
        </div>
      </div>
    </Transition>
  </Teleport>
  </span>
</template>

<style scoped>
.us-root { display: inline-flex; min-width: 0; max-width: 100%; vertical-align: middle; }
.us-root > .us { flex: 1 1 auto; }
.us {
  display: inline-flex; align-items: center; gap: 7px; min-width: 0; max-width: 100%;
  border-radius: var(--r-sm); color: var(--ink); white-space: nowrap; transition: background-color var(--t) ease, box-shadow var(--t) ease;
}
.us--md { height: 36px; padding: 0 10px 0 12px; font-size: var(--fs-body); }
.us--sm { height: 30px; padding: 0 8px 0 10px; font-size: var(--fs-sm); border-radius: var(--r-sm); }
@media (max-width: 768px) { .us--sm, .us--md { height: 44px; } }
.us--soft { background: var(--bg-2); }
.us--soft:hover, .us--soft.is-open { background: var(--bg-3); }
.us--ghost:hover, .us--ghost.is-open { background: var(--bg-2); }
.us--chip { border-radius: var(--r-pill); box-shadow: inset 0 0 0 1px var(--line-2); }
.us--chip:hover, .us--chip.is-open { background: var(--bg-2); }
.us:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.us:disabled { opacity: 0.5; cursor: default; }
.us.is-empty .us__text { color: var(--muted); }
.us__prefix { color: var(--muted); }
.us__ico { color: var(--muted); flex: none; }
.us__text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.us__chev { flex: none; margin-left: auto; color: var(--muted); transition: rotate var(--t) var(--ease); }
.us.is-open .us__chev { rotate: 180deg; }
.us__pop {
  position: fixed; z-index: var(--z-sheet); padding: 4px; border-radius: var(--r);
  background: var(--card); box-shadow: var(--shadow-pop), 0 0 0 1px var(--line);
  animation: us-in var(--t-fast) var(--ease) both; transform-origin: top;
}
.us__pop.is-up { translate: 0 -100%; transform-origin: bottom; }
@keyframes us-in { from { opacity: 0; scale: 0.97; } }
.us__search { display: flex; align-items: center; gap: 8px; height: 38px; margin-bottom: 4px; padding: 0 10px; border-bottom: 1px solid var(--line); color: var(--muted); }
.us__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; font: inherit; font-size: var(--fs-body); color: var(--ink); }
.us__list { overflow: auto; outline: none; overscroll-behavior: contain; }
.us__group { padding: 8px 10px 4px; font-size: var(--fs-xs); color: var(--muted); }
.us__opt {
  display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 10px; border-radius: var(--r-sm);
  font-size: var(--fs-body); color: var(--ink); cursor: pointer;
}
.us__opt.is-active { background: var(--bg-2); }
.us__opt.is-off { opacity: 0.4; cursor: default; }
.us__oico { flex: none; color: var(--muted); }
.us__ot { flex: 1; min-width: 0; display: grid; }
.us__ot > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.us__ot small { font-size: var(--fs-xs); color: var(--muted); line-height: 1.35; }
.us__check { flex: none; color: var(--blue); }
.us__box {
  width: 18px; height: 18px; flex: none; display: grid; place-items: center; border-radius: var(--r-xs);
  box-shadow: inset 0 0 0 1.5px var(--line-2); color: var(--on-solid);
}
.us__opt.is-on .us__box { background: var(--blue); box-shadow: none; color: var(--on-accent); }
.us__none { display: grid; justify-items: center; gap: 6px; padding: 14px 10px; font-size: var(--fs-sm); color: var(--muted); text-align: center; }
.us__link { height: 28px; padding: 0 8px; border-radius: var(--r-sm); font-size: var(--fs-sm); font-weight: 500; color: var(--blue); }
.us__link:hover:not(:disabled) { background: var(--bg-2); }
.us__link:disabled { opacity: 0.4; cursor: default; }
.us__link--b { font-weight: 600; }
.us__foot { display: flex; align-items: center; gap: var(--s1); margin-top: 4px; padding: 4px 4px 2px 10px; border-top: 1px solid var(--line); font-size: var(--fs-sm); color: var(--muted); }
.us__foot .us__link:first-of-type { margin-left: auto; }
.us__foot--m { padding: var(--s2) var(--s3) 0; }
.us__foot--m .us__link { height: 44px; font-size: 16px; padding: 0 var(--s3); }
.us__drag { flex: none; touch-action: none; cursor: grab; }
.us__bd { position: fixed; inset: 0; z-index: var(--z-sheet); background: var(--scrim); touch-action: none; overscroll-behavior: contain; }
.us__sheet {
  position: fixed; z-index: calc(var(--z-sheet) + 1); left: 0; right: 0; bottom: 0; max-height: 80dvh; display: flex; flex-direction: column;
  padding: 8px 8px calc(10px + var(--safe-b)); border-radius: var(--r-lg) var(--r-lg) 0 0; overscroll-behavior: contain; background: var(--card); box-shadow: var(--shadow-pop);
}
.us__grip { display: block; width: 40px; height: 5px; margin: 0 auto 8px; border-radius: var(--r-pill); background: var(--line-2); flex: none; }
.us__shead { display: flex; align-items: center; padding: 2px 12px 8px; flex: none; }
.us__stitle { flex: 1; font-size: var(--fs-h2); font-weight: 600; }
.us__search--m { height: 44px; margin: 0 4px 6px; border: 0; border-radius: var(--r); background: var(--bg-2); flex: none; }
.us__search--m input { font-size: 16px; }
.us__list--m { flex: 1; min-height: 0; overscroll-behavior: contain; }
.us__list--m .us__opt { min-height: 50px; padding: 8px 12px; font-size: 16px; gap: 14px; border-radius: var(--r); }
.us__list--m .us__opt:active { background: var(--bg-2); }
.us__list--m .us__opt.is-on { background: var(--bg-2); }
.us__list--m .us__ot small { font-size: var(--fs-sm); }
.us__list--m .us__group { padding: 12px 12px 4px; font-size: var(--fs-sm); }
.us-fade-enter-active, .us-fade-leave-active { transition: opacity var(--t) ease; }
.us-fade-enter-from, .us-fade-leave-to { opacity: 0; }
.us-sheet-enter-active, .us-sheet-leave-active { transition: translate var(--t-sheet) var(--ease); }
.us-sheet-enter-from, .us-sheet-leave-to { translate: 0 100%; }
@media (prefers-reduced-motion: reduce) {
  .us__pop { animation: none; }
}
</style>
