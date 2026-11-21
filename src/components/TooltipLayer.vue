<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const show = ref(false)
const text = ref('')
const keys = ref('')
const side = ref<'right' | 'top' | 'bottom'>('top')
const pos = ref({ x: 0, y: 0 })
const ax = ref(0)
const tip = ref<HTMLElement>()
let target: HTMLElement | null = null
let muted: HTMLElement | null = null
let timer = 0
let warm = 0

function place(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const right = el.dataset.tipSide === 'right' || !!el.closest('.sb.is-rail')
  if (right) {
    side.value = 'right'
    pos.value = { x: r.right + 10, y: r.top + r.height / 2 }
  } else if (r.top > 48) {
    side.value = 'top'
    pos.value = { x: r.left + r.width / 2, y: r.top - 8 }
  } else {
    side.value = 'bottom'
    pos.value = { x: r.left + r.width / 2, y: r.bottom + 8 }
  }
}
function open(el: HTMLElement) {
  const raw = el.dataset.tip ?? ''
  if (!raw.trim()) return
  const [t, k] = raw.split(/\s{2,}/)
  text.value = t ?? raw
  keys.value = k ?? ''
  place(el)
  ax.value = 0
  show.value = true
  void nextTick(fit)
}
function fit() {
  const box = tip.value?.getBoundingClientRect()
  if (!box || side.value === 'right') return
  const pad = 8
  const shift = box.left < pad ? pad - box.left : box.right > window.innerWidth - pad ? window.innerWidth - pad - box.right : 0
  if (!shift) return
  pos.value = { x: pos.value.x + shift, y: pos.value.y }
  ax.value = -shift
}
function press(e: PointerEvent) {
  muted = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]') ?? null
  hide()
}
function hide() {
  clearTimeout(timer)
  if (show.value) warm = Date.now()
  show.value = false
  target = null
}
function truncated(t: HTMLElement | null): HTMLElement | null {
  let n = t
  for (let i = 0; n && i < 4 && n !== document.body; i++, n = n.parentElement) {
    if (n.dataset.tip) return null
    if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).textOverflow === 'ellipsis') {
      const full = n.textContent?.replace(/\s+/g, ' ').trim()
      if (!full) return null
      n.dataset.tip = full
      return n
    }
  }
  return null
}
function onOver(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  const t = e.target as HTMLElement | null
  const el = t?.closest<HTMLElement>('[data-tip]') ?? truncated(t)
  if (!el || el === target) return
  if (el === muted || el.getAttribute('aria-expanded') === 'true') return
  if (el.closest('.sb') && !el.closest('.sb.is-rail') && el.textContent?.trim()) return
  target = el
  clearTimeout(timer)
  const quick = Date.now() - warm < 400 || show.value
  show.value = false
  timer = window.setTimeout(() => target === el && el.isConnected && open(el), quick ? 0 : 350)
}
function onOut(e: PointerEvent) {
  const to = e.relatedTarget as Node | null
  if (muted && !(to && muted.contains(to))) muted = null
  if (!target) return
  if (to && target.contains(to)) return
  hide()
}

onMounted(() => {
  document.addEventListener('pointerover', onOver, true)
  document.addEventListener('pointerout', onOut, true)
  document.addEventListener('pointerdown', press, true)
  document.addEventListener('keydown', hide, true)
  window.addEventListener('scroll', hide, true)
  window.addEventListener('blur', hide)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerover', onOver, true)
  document.removeEventListener('pointerout', onOut, true)
  document.removeEventListener('pointerdown', press, true)
  document.removeEventListener('keydown', hide, true)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('blur', hide)
  clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" ref="tip" class="gtip" :class="'gtip--' + side" :style="{ left: pos.x + 'px', top: pos.y + 'px', '--ax': ax + 'px' }" role="tooltip">
      <span>{{ text }}</span><kbd v-if="keys" class="gtip__k">{{ keys }}</kbd>
    </div>
  </Teleport>
</template>

<style scoped>
.gtip {
  position: fixed; z-index: var(--z-tip); pointer-events: none; display: inline-flex; align-items: center; gap: var(--s2);
  width: max-content; max-width: min(320px, calc(100vw - 16px)); padding: 6px 10px; border-radius: var(--r-sm);
  font-size: var(--fs-xs); font-weight: 500; line-height: 1.35; color: var(--on-solid); background: var(--solid);
  box-shadow: var(--shadow-pop); animation: gtip-in var(--t-fast) ease both;
}
.gtip::before { content: ''; position: absolute; width: 8px; height: 8px; background: inherit; rotate: 45deg; border-radius: 1px; }
.gtip--right { translate: 0 -50%; }
.gtip--right::before { left: -3px; top: calc(50% - 4px); }
.gtip--top { translate: -50% -100%; }
.gtip--top::before { left: calc(50% - 4px + var(--ax, 0px)); bottom: -3px; }
.gtip--bottom { translate: -50% 0; }
.gtip--bottom::before { left: calc(50% - 4px + var(--ax, 0px)); top: -3px; }
.gtip span { min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; line-clamp: 3; overflow: hidden; }
.gtip__k {
  flex: none; padding: 1px 6px; border-radius: var(--r-xs); font: inherit; font-size: var(--fs-xs);
  color: color-mix(in srgb, var(--on-solid) 75%, transparent); background: color-mix(in srgb, var(--on-solid) 14%, transparent);
}
@keyframes gtip-in { from { opacity: 0; } }
@media (hover: none) { .gtip { display: none; } }
</style>
